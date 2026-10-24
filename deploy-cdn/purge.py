#!/usr/bin/env python3
"""Submit an EdgeOne purge for explicitly selected resources."""

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

from common import ConfigError, DEFAULT_CONFIG, cdn_domain, credentials, load_config


def find_zone_id(client, models, name):
    offset = 0
    while True:
        request = models.DescribeZonesRequest()
        request.Offset, request.Limit = offset, 100
        zones = getattr(client.DescribeZones(request), "Zones", None) or []
        for zone in zones:
            if zone.ZoneName == name:
                return zone.ZoneId
        if len(zones) < 100:
            return None
        offset += len(zones)


def run(cfg, purge_type, targets, dry_run=False):
    domain = cdn_domain(cfg)
    for target in targets:
        if purge_type == "purge_host":
            valid = target == domain
        else:
            parsed = urlsplit(target)
            valid = parsed.scheme == "https" and parsed.netloc.lower() == domain
        if not valid:
            raise ConfigError("刷新目标必须属于配置中的图片加速域名，并使用 HTTPS。")
    zone_id = cfg.get("eo_zone_id")
    if not zone_id and not cfg.get("eo_zone_name"):
        raise ConfigError("请填写 eo_zone_id 或 eo_zone_name。")
    if dry_run:
        print(json.dumps({"type": purge_type, "targets": targets, "zone_id": zone_id,
                          "zone_name": cfg.get("eo_zone_name")}, ensure_ascii=False, indent=2))
        print("预览未调用腾讯云，也未提交刷新任务。")
        return
    try:
        from tencentcloud.common import credential
        from tencentcloud.teo.v20220901 import teo_client, models
    except ImportError as exc:
        raise ConfigError("请先安装 deploy-cdn/requirements.txt。") from exc
    secret_id, secret_key, token = credentials()
    cred = credential.Credential(secret_id, secret_key, token or None)
    client = teo_client.TeoClient(cred, "")
    zone_id = zone_id or find_zone_id(client, models, cfg["eo_zone_name"])
    if not zone_id:
        raise ConfigError("未找到配置的 EdgeOne 站点。")
    request = models.CreatePurgeTaskRequest()
    request.ZoneId, request.Type, request.Targets = zone_id, purge_type, targets
    response = client.CreatePurgeTask(request)
    print("刷新任务已提交: JobId=%s；提交成功不代表边缘节点已完成刷新。" % response.JobId)
    print("文件名包含内容哈希时通常无需刷新；旧浏览器缓存应通过新 URL 更新。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dry-run", action="store_true")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", action="append")
    group.add_argument("--prefix")
    group.add_argument("--host")
    args = parser.parse_args()
    kind, targets = ("purge_url", args.url) if args.url else (
        ("purge_prefix", [args.prefix]) if args.prefix else ("purge_host", [args.host]))
    try:
        run(load_config(args.config), kind, targets, args.dry_run)
    except Exception as exc:
        print("刷新未完成: %s" % exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
