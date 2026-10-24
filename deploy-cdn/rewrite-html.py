#!/usr/bin/env python3
"""Replace local image URLs in built site files, preserving eager loading."""

import argparse
import json
import re
import sys
from pathlib import Path

from common import ConfigError, DEFAULT_CONFIG, load_config, local_path

TEXT_EXT = {".html", ".htm", ".css", ".js", ".json"}
IMG_TAG = re.compile(r"<img\b(?P<attrs>[^<>]*?)>", re.IGNORECASE)


def replace_paths(text, url_map, use_cdn=True):
    if not url_map:
        return text, 0
    alternatives = "|".join(re.escape(key) for key in sorted(url_map, key=len, reverse=True))
    pattern = re.compile(
        r"(?<![A-Za-z0-9_\-./:%])(?:\./|/)?(?P<local>" + alternatives
        + r")(?![A-Za-z0-9_\-./%])(?P<suffix>[?#][^\"'()\s<>]*)?"
    )

    def substitute(match):
        entry = url_map[match.group("local")]
        target = entry["cdn_url" if use_cdn else "origin_url"]
        suffix = match.group("suffix") or ""
        if suffix.startswith("?") and "?" in target:
            suffix = "&" + suffix[1:]
        return target + suffix

    return pattern.subn(substitute, text)


def has_attr(attrs, name):
    return re.search(r"(?:^|\s)" + name + r"\s*=", attrs, re.IGNORECASE) is not None


def add_lazy(text):
    count = 0
    first = True

    def substitute(match):
        nonlocal count, first
        attrs = match.group("attrs").rstrip()
        closing = " />" if attrs.endswith("/") else ">"
        if attrs.endswith("/"):
            attrs = attrs[:-1].rstrip()
        if not has_attr(attrs, "loading"):
            priority = re.search(r"""\bfetchpriority\s*=\s*["']high["']""", attrs, re.IGNORECASE)
            loading = "eager" if first or priority else "lazy"
            attrs += ' loading="%s"' % loading
            count += 1
        if not has_attr(attrs, "decoding"):
            attrs += ' decoding="async"'
        first = False
        return "<img" + attrs + closing

    return IMG_TAG.sub(substitute, text), count


def run(cfg, map_path=None, dry_run=False, no_lazy=False, origin=False):
    map_path = map_path or local_path(cfg, "map_file", "url-map.json")
    if not Path(map_path).is_file():
        raise ConfigError("缺少 URL 映射表，请先上传图片。")
    mapping = json.loads(Path(map_path).read_text(encoding="utf-8"))
    if not mapping:
        raise ConfigError("URL 映射表为空，不能确认图片已上传。")
    root = local_path(cfg, "local_site_dir", "../dist").resolve()
    if not root.is_dir():
        raise ConfigError("找不到网页构建目录: %s" % root)
    changed = hits_total = loading_total = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXT:
            continue
        if not path.resolve().is_relative_to(root):
            raise ConfigError("站点文件符号链接指向目录外部: %s" % path.name)
        text = path.read_text(encoding="utf-8")
        rewritten, hits = replace_paths(text, mapping, not origin)
        loading = 0
        if not no_lazy and path.suffix.lower() in {".html", ".htm"}:
            rewritten, loading = add_lazy(rewritten)
        if rewritten == text:
            continue
        changed += 1
        hits_total += hits
        loading_total += loading
        print("%s: 替换 %d 处，设置加载属性 %d 处" % (path.relative_to(root), hits, loading))
        if not dry_run:
            backup = path.with_suffix(path.suffix + ".bak")
            if not backup.exists():
                backup.write_text(text, encoding="utf-8")
            path.write_text(rewritten, encoding="utf-8")
    print("完成: %d 个文件，替换 %d 处，设置加载属性 %d 处%s" %
          (changed, hits_total, loading_total, "；预览未写入。" if dry_run else "；已保留 .bak 备份。"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--map", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-lazy", action="store_true")
    parser.add_argument("--origin", action="store_true")
    args = parser.parse_args()
    try:
        run(load_config(args.config), args.map, args.dry_run, args.no_lazy, args.origin)
    except (OSError, ValueError, KeyError) as exc:
        print("改写中止: %s" % exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
