import os
from typing import Dict, Any

DEFAULT_MINECRAFT_SETTINGS = {
    "motd": "A Minecraft Server",
    "server-port": 25565,
    "difficulty": "easy",
    "gamemode": "survival",
    "max-players": 20,
    "pvp": True,
    "online-mode": True,
    "enable-command-block": False,
    "spawn-animals": True,
    "spawn-monsters": True,
    "spawn-npcs": True,
    "view-distance": 10,
    "simulation-distance": 10,
    "max-world-size": 29999984,
    "whitelist": False,
    "enforce-whitelist": False,
    "generate-structures": True,
    "allow-flight": False,
    "hardcore": False,
    "max-tick-time": 60000,
    "rate-limit": 0,
    "enable-rcon": False,
    "rcon.port": 25575,
    "rcon.password": "",
    "enable-query": False,
    "query.port": 25565,
    "op-permission-level": 4,
    "player-idle-timeout": 0,
    "resource-pack": "",
    "resource-pack-sha1": "",
    "require-resource-pack": False,
    "enforce-secure-profile": True,
    "allow-nether": True,
    "sync-chunk-writes": True,
    "enable-jmx-monitoring": False,
    "enable-status": True,
    "broadcast-rcon-to-ops": True,
    "broadcast-console-to-ops": True,
    "max-chained-neighbor-updates": 1000000,
    "entity-broadcast-range-percentage": 100,
    "text-filtering-config": "",
    "spawn-protection": 16,
    "function-permission-level": 2,
    "prevent-proxy-connections": False,
    "initial-disabled-packs": "",
    "initial-enabled-packs": "vanilla",
    "max-memory-gb": 2,
}

SETTINGS_PRESETS = {
    "survival": {
        "label": "Survival",
        "description": "Standard survival Minecraft experience",
        "icon": "&#9878;",
        "settings": {
            "gamemode": "survival",
            "difficulty": "easy",
            "pvp": True,
            "hardcore": False,
            "max-players": 20,
        }
    },
    "creative": {
        "label": "Creative",
        "description": "Creative mode with flight enabled",
        "icon": "&#9997;",
        "settings": {
            "gamemode": "creative",
            "difficulty": "peaceful",
            "pvp": False,
            "hardcore": False,
            "spawn-monsters": False,
            "allow-flight": True,
            "max-players": 10,
        }
    },
    "hardcore": {
        "label": "Hardcore",
        "description": "Hardcore mode with permadeath",
        "icon": "&#9760;",
        "settings": {
            "gamemode": "survival",
            "difficulty": "hard",
            "hardcore": True,
            "pvp": True,
            "max-players": 10,
            "spawn-protection": 0,
        }
    },
    "peaceful": {
        "label": "Peaceful",
        "description": "No mobs, relaxed building",
        "icon": "&#9786;",
        "settings": {
            "gamemode": "survival",
            "difficulty": "peaceful",
            "pvp": False,
            "hardcore": False,
            "spawn-monsters": False,
            "max-players": 20,
        }
    },
}


def read_config(filepath: str) -> Dict[str, Any]:
    if not os.path.exists(filepath):
        return dict(DEFAULT_MINECRAFT_SETTINGS)
    settings = {}
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                settings[key] = _parse_value(value)
    return settings


def write_config(filepath: str, settings: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    lines = ["#Minecraft server properties", f"#{(os.path.basename(filepath))}"]
    for key, val in settings.items():
        if isinstance(val, bool):
            lines.append(f"{key}={str(val).lower()}")
        else:
            lines.append(f"{key}={val}")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _parse_value(value: str) -> Any:
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        pass
    return value


def get_default_settings() -> Dict[str, Any]:
    return dict(DEFAULT_MINECRAFT_SETTINGS)


def get_presets() -> Dict[str, Any]:
    return SETTINGS_PRESETS
