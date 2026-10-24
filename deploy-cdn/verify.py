#!/usr/bin/env python3
"""Read a public HTTPS image twice to check format, size and cache evidence."""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

MAX_BYTES = 32 * 1024 * 1024


def read_image(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("仅检查公开 HTTPS 图片地址，不接受用户名或密码。")
    request = urllib.request.Request(url, headers={"User-Agent": "PriceList-CDN-Check/1.0", "Accept": "image/webp,image/*;q=0.9,*/*;q=0.8"})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=30) as response:
        if urlsplit(response.url).scheme != "https":
            raise ValueError("图片跳转到了非 HTTPS 地址。")
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("单次图片响应超过 32MB，需要先压缩或切片。")
        headers = {key.lower(): value for key, value in response.headers.items()}
        if response.status != 200 or not headers.get("content-type", "").lower().startswith("image/"):
            raise ValueError("没有返回成功的图片响应。")
    is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if "format/webp" in parsed.query and not is_webp:
        raise ValueError("请求了 WebP，但返回内容不是 WebP；请检查数据万象和缓存键。")
    if not data:
        raise ValueError("图片内容为空。")
    cache = {key: headers[key] for key in ("eo-cache-status", "x-cache-lookup", "x-cache", "age") if key in headers}
    hit = any(re.search(r"\bhit\b", value, re.IGNORECASE) for key, value in cache.items() if key != "age")
    return {"status": 200, "content_type": headers["content-type"], "bytes": len(data),
            "elapsed_ms": round((time.monotonic() - started) * 1000), "webp": is_webp,
            "cache_headers": cache, "cache_hit": hit}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="一张实际上传的 CDN 图片完整 HTTPS 地址，包含处理参数")
    args = parser.parse_args()
    try:
        first, second = read_image(args.url), read_image(args.url)
        result = {"first_request": first, "second_request": second}
        parsed = urlsplit(args.url)
        if "imageMogr2/" in parsed.query:
            original = read_image(urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", "")))
            result["original_bytes"] = original["bytes"]
            result["size_reduction_percent"] = round((1 - second["bytes"] / original["bytes"]) * 100, 1)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not second["cache_hit"]:
            print("图片访问成功；第二次请求缺少明确 HIT 证据，缓存命中尚未确认。", file=sys.stderr)
            return 2
        print("图片访问、格式检查及第二次请求缓存命中已通过。")
        return 0
    except (OSError, ValueError, urllib.error.URLError) as exc:
        print("图片验证未通过: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
