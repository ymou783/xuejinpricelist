"""Shared local configuration; credentials are read only at cloud execution time."""

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

DEFAULT_CONFIG = Path(__file__).with_name("config.local.json")


class ConfigError(ValueError):
    pass


def load_config(path=DEFAULT_CONFIG):
    path = Path(path).resolve()
    if not path.is_file():
        raise ConfigError("找不到配置文件；先复制 config.example.json 为 config.local.json 并填写资源信息。")
    with path.open(encoding="utf-8") as handle:
        cfg = json.load(handle)
    if not isinstance(cfg, dict):
        raise ConfigError("配置内容必须是 JSON 对象。")
    if any(cfg.get(key) for key in ("secret_id", "secret_key", "secret_token")):
        raise ConfigError("请从配置文件移除密钥，改用本地环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY。")
    cfg["_config_dir"] = path.parent
    return cfg


def local_path(cfg, name, default):
    value = Path(cfg.get(name) or default).expanduser()
    return value if value.is_absolute() else Path(cfg["_config_dir"]) / value


def cdn_domain(cfg):
    domain = str(cfg.get("cdn_domain") or "").strip().lower()
    parsed = urlsplit("https://" + domain)
    if (not domain or not parsed.hostname or parsed.netloc != domain
            or parsed.path or parsed.query or parsed.fragment or ":" in domain
            or "@" in domain or any(c.isspace() for c in domain)):
        raise ConfigError("cdn_domain 仅填写图片加速域名，例如 img.your-domain.cn，不带 https:// 或路径。")
    return domain.encode("idna").decode("ascii")


def credentials():
    values = [os.environ.get(name, "") for name in ("TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "TENCENT_SESSION_TOKEN")]
    if not all(values[:2]):
        raise ConfigError("云端操作需要本地环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY；不要把密钥写入配置或聊天。")
    return values


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
