#!/usr/bin/env python3
"""Print the password-free Steam launch URL for a Project Zomboid server."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import quote


def dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def value(name: str, values: dict[str, str], default: str = "") -> str:
    return os.environ.get(name, values.get(name, default))


def main() -> int:
    values = dotenv(Path(".env"))
    address = value("SERVER_CONNECT_ADDRESS", values)
    port = value("DEFAULT_PORT", values, "16261")
    use_steam = value("USE_STEAM", values, "true")

    if not address:
        print(
            "SERVER_CONNECT_ADDRESS is empty. Set a public DNS name or IP in .env.",
            file=sys.stderr,
        )
        return 1
    if "://" in address or "/" in address or any(char.isspace() for char in address):
        print(
            "SERVER_CONNECT_ADDRESS must contain only a DNS name or IP, without a scheme or port.",
            file=sys.stderr,
        )
        return 1
    if not port.isdecimal() or not 1 <= int(port) <= 65535:
        print("DEFAULT_PORT must be a valid port number.", file=sys.stderr)
        return 1

    arguments = f"+connect {address}:{port}"
    if use_steam.lower() == "false":
        arguments = f"-nosteam {arguments}"

    print(f"PZ_CONNECT_LINK=steam://run/108600//{quote(arguments, safe='')}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
