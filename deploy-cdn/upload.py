#!/usr/bin/env python3
"""Upload images with versioned object names and publish a complete URL map."""

import argparse
import csv
import hashlib
import io
import mimetypes
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from common import ConfigError, DEFAULT_CONFIG, cdn_domain, credentials, load_config, local_path, save_json

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".avif", ".heic", ".heif", ".svg", ".tif", ".tiff"}
CI_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def collect_images(root):
    root = Path(root)
    if not root.is_dir():
        raise ConfigError("找不到图片目录: %s" % root)
    files = [p for p in sorted(root.rglob("*")) if p.is_file() and p.suffix.lower() in IMAGE_EXT]
    if not files:
        raise ConfigError("图片目录中没有可上传的图片。")
    for path in files:
        if not path.resolve().is_relative_to(root.resolve()):
            raise ConfigError("图片符号链接指向目录外部: %s" % path.name)
    return files


def digest_of(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def build_entry(cfg, root, path):
    rel = PurePosixPath(path.relative_to(root).as_posix())
    digest = digest_of(path)
    hashed = cfg.get("hash_filenames", True)
    versioned = rel.with_name("%s.%s%s" % (rel.stem, digest[:16], rel.suffix.lower())) if hashed else rel
    key = str(PurePosixPath(cfg.get("cos_prefix", "").strip("/")) / versioned)
    source = str(PurePosixPath(cfg.get("source_image_prefix", "images").strip("/")) / rel)
    original = "https://%s/%s" % (cdn_domain(cfg), quote(key, safe="/"))
    url = original
    if cfg.get("convert_webp", True) and path.suffix.lower() in CI_EXT:
        if path.stat().st_size > 32 * 1024 * 1024:
            raise ConfigError("图片超过数据万象单图 32MB 限制，需先缩小: %s" % path.name)
        width = int(cfg.get("thumbnail_width") or 0)
        if width < 0 or width > 30000:
            raise ConfigError("thumbnail_width 应为 0 到 30000；0 表示不缩放。")
        url += "?imageMogr2/format/webp"
        if width:
            url += "/thumbnail/%dx" % width
    return source, {
        "cos_key": key, "origin_url": original, "cdn_url": url,
        "sha256": digest, "bytes": path.stat().st_size,
        "cache_control": "public, max-age=31536000, immutable" if hashed else "public, max-age=0, must-revalidate",
    }


def build_client(cfg):
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError as exc:
        raise ConfigError("请先安装 deploy-cdn/requirements.txt。") from exc
    secret_id, secret_key, token = credentials()
    return CosS3Client(CosConfig(Region=cfg["region"], SecretId=secret_id, SecretKey=secret_key,
                               Token=token or None, Scheme="https"))


def object_unchanged(client, bucket, entry):
    try:
        head = client.head_object(Bucket=bucket, Key=entry["cos_key"])
    except Exception as exc:
        # Authentication, TLS and permission failures must stop the upload.
        if callable(getattr(exc, "get_status_code", None)) and str(exc.get_status_code()) == "404":
            return False
        raise
    return head.get("x-cos-meta-sha256") == entry["sha256"]


def run(cfg, dry_run=False):
    cdn_domain(cfg)
    root = local_path(cfg, "local_image_dir", "../images")
    files = collect_images(root)
    planned = [(path, *build_entry(cfg, root, path)) for path in files]
    if dry_run:
        for path, source, entry in planned:
            print("预览 %s -> %s" % (source, entry["cdn_url"]))
        print("预览完成: %d 张；没有云端请求，没有写入映射表。" % len(planned))
        return
    for key in ("bucket", "region"):
        if not cfg.get(key):
            raise ConfigError("请填写配置项: " + key)
    if cdn_domain(cfg) == "example.com" or cdn_domain(cfg).endswith(".example.com"):
        raise ConfigError("请填写实际图片加速域名。")
    client = build_client(cfg)
    result = {}
    uploaded = skipped = 0
    for path, source, entry in planned:
        if object_unchanged(client, cfg["bucket"], entry):
            skipped += 1
            print("跳过(无变化) %s" % source)
        else:
            client.put_object_from_local_file(
                Bucket=cfg["bucket"], LocalFilePath=str(path), Key=entry["cos_key"],
                ContentType=mimetypes.guess_type(str(path))[0] or "application/octet-stream",
                CacheControl=entry["cache_control"], Metadata={"sha256": entry["sha256"]},
            )
            uploaded += 1
            print("已上传 %s" % source)
        result[source] = entry
    # Publish the map only after every object succeeds. Existing maps survive failures.
    out = local_path(cfg, "map_file", "url-map.json")
    save_json(out, result)
    csv_text = io.StringIO()
    writer = csv.writer(csv_text)
    writer.writerow(["local_path", "cos_key", "cdn_url", "origin_url"])
    for source, entry in result.items():
        writer.writerow([source, entry["cos_key"], entry["cdn_url"], entry["origin_url"]])
    out.with_suffix(".csv").write_text(csv_text.getvalue(), encoding="utf-8-sig")
    print("完成: 上传 %d / 跳过 %d；映射表 %s" % (uploaded, skipped, out))
    print("下一步: verify.py 验证真实图片，然后对网页构建目录运行 rewrite-html.py --dry-run。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        run(load_config(args.config), args.dry_run)
    except Exception as exc:
        print("上传中止（未发布新的完整映射表）: %s" % exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
