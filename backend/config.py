"""
配置管理：读写 config.json，支持运行时更新。
优先级：config.json > .env 环境变量 > 默认值
"""

import json
import os
from pathlib import Path

# PyInstaller 打包后，config.json 放在用户目录，保证可写
import sys
if getattr(sys, 'frozen', False):
    CONFIG_PATH = Path.home() / ".bookloop" / "config.json"
else:
    CONFIG_PATH = Path(__file__).parent / "config.json"

PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "matcher_model": "deepseek-chat",
        "responder_model": "deepseek-chat",
    },
    "minimax": {
        "name": "MiniMax",
        "base_url": "https://api.minimax.io/v1",
        "matcher_model": "MiniMax-M2.7-highspeed",
        "responder_model": "MiniMax-M3",
    },
    "glm": {
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "matcher_model": "glm-4-flash",
        "responder_model": "glm-4-plus",
    },
    "volcengine": {
        "name": "火山引擎",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "matcher_model": "doubao-1.5-lite-256k",
        "responder_model": "doubao-1.5-pro-256k",
    },
    "custom": {
        "name": "自定义",
        "base_url": "",
        "matcher_model": "",
        "responder_model": "",
    },
}

DEFAULTS = {
    "api_key": "",
    "base_url": "",
    "matcher_model": "",
    "responder_model": "",
    "max_responders": 5,
    "provider": "custom",
}


def load_config() -> dict:
    """加载配置：config.json 优先，fallback 到 .env 和默认值"""
    config = dict(DEFAULTS)

    # Layer 1: .env 环境变量
    config["api_key"] = os.getenv("OPENAI_API_KEY", "")
    config["base_url"] = os.getenv("OPENAI_BASE_URL", config["base_url"])
    config["matcher_model"] = os.getenv("MATCHER_MODEL", config["matcher_model"])
    config["responder_model"] = os.getenv("RESPONDER_MODEL", config["responder_model"])

    # Layer 2: config.json 覆盖（如果存在）
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r") as f:
                saved = json.load(f)
            for k in DEFAULTS:
                if saved.get(k):
                    config[k] = saved[k]
        except (json.JSONDecodeError, IOError):
            pass

    return config


def save_config(config: dict) -> None:
    """保存配置到 config.json"""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump({k: config.get(k, "") for k in DEFAULTS}, f, ensure_ascii=False, indent=2)


def config_for_client(config: dict) -> dict | None:
    """返回用于 OpenAI client 初始化的配置，如果没有 API key 返回 None"""
    api_key = config.get("api_key", "").strip()
    if not api_key:
        return None
    return {
        "api_key": api_key,
        "base_url": config.get("base_url", DEFAULTS["base_url"]),
    }


def config_public(config: dict) -> dict:
    """返回可以安全暴露给前端的配置（API key 脱敏）"""
    public = dict(config)
    key = public.get("api_key", "")
    if key and len(key) > 8:
        public["api_key"] = key[:4] + "****" + key[-4:]
    elif key:
        public["api_key"] = "****"
    public["has_api_key"] = bool(key)
    public["provider"] = config.get("provider", "custom")
    return public
