#!/usr/bin/env python3
"""Compare the server mod pack and game build with this machine's Steam install."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from discover_mods import APP_ID, WORKSHOP_URL, find_steam_root

HASHED_SUFFIXES = (".lua", ".txt")
CATEGORIES = ("lua", "scripts")

SERVER_VERSION = r"""
set -eu
log=$(ls -t /project-zomboid-config/Logs/*_DebugLog-server.txt 2>/dev/null | head -1 || true)
[ -n "${log:-}" ] || exit 0
version=$(grep -hoE 'version=[0-9][^ ]+ [a-f0-9]+' "$log" | tail -1 | sed 's/^version=//' || true)
[ -n "${version:-}" ] && printf 'VERSION\t%s\n' "$version" || true
"""

SERVER_INVENTORY = (
    SERVER_VERSION
    + r"""
content=/project-zomboid/steamapps/workshop/content/__APP_ID__
[ -d "$content" ] || exit 0
cd "$content"
for id in *; do
  [ -d "$id" ] || continue
  name=$(find "$id" -name mod.info -exec grep -h -m1 '^name=' {} + 2>/dev/null | head -1 | cut -d= -f2- || true)
  printf 'ITEM\t%s\t%s\n' "$id" "${name:-}"
  find "$id" -type f \( -name '*.lua' -o -name '*.txt' \) -exec md5sum {} + 2>/dev/null || true
done
"""
).replace("__APP_ID__", APP_ID)


def run_on_server(script: str) -> str:
    """Return the raw output of a shell snippet executed in the server container."""

    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "projectzomboid", "sh", "-c", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        detail = result.stderr.strip().splitlines()
        raise ValueError(detail[-1] if detail else "docker compose exec failed")
    return result.stdout


def unescape(path: str) -> str:
    """Undo the escaping md5sum applies to paths holding a newline or backslash."""

    if not path.startswith("\\"):
        return path
    return path[1:].replace("\\\\n", "\n").replace("\\\\", "\\")


def parse_server_inventory(output: str) -> tuple[str, dict[str, dict[str, str]], dict[str, str]]:
    version = ""
    items: dict[str, dict[str, str]] = {}
    names: dict[str, str] = {}
    current = ""

    for line in output.splitlines():
        if line.startswith("VERSION\t"):
            version = line.split("\t", 1)[1].strip()
        elif line.startswith("ITEM\t"):
            _, item_id, name = line.split("\t", 2)
            current = item_id
            items[item_id] = {}
            if name.strip():
                names[item_id] = name.strip()
        elif "  " in line and current:
            digest, path = line.split("  ", 1)
            relative = unescape(path).split("/", 1)
            if len(relative) == 2:
                items[current][relative[1]] = digest

    return version, items, names


def file_digest(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_inventory(content_directory: Path) -> dict[str, dict[str, str]]:
    items: dict[str, dict[str, str]] = {}
    if not content_directory.is_dir():
        return items

    for item_directory in sorted(entry for entry in content_directory.iterdir() if entry.is_dir()):
        files: dict[str, str] = {}
        for path in item_directory.rglob("*"):
            if path.suffix in HASHED_SUFFIXES and path.is_file():
                files[path.relative_to(item_directory).as_posix()] = file_digest(path)
        items[item_directory.name] = files
    return items


def local_names() -> dict[str, str]:
    catalog_file = Path("mods/catalog.lock.json")
    if not catalog_file.is_file():
        return {}

    catalog = json.loads(catalog_file.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    for item_id, item in catalog.get("items", {}).items():
        mods = item.get("mods") or []
        if mods:
            names[item_id] = str(mods[0].get("name", item_id))
    return names


def local_version() -> str:
    console = Path.home() / "Zomboid/console.txt"
    if not console.is_file():
        return ""

    matches = re.findall(
        r"version=([0-9][^ ]+ [a-f0-9]+)",
        console.read_text(encoding="utf-8", errors="replace"),
    )
    return matches[-1] if matches else ""


def category(relative_path: str) -> str:
    return "lua" if relative_path.endswith(".lua") else "scripts"


def compare_files(server: dict[str, str], client: dict[str, str]) -> dict[str, dict[str, int]]:
    counters = {name: {"differ": 0, "missing": 0, "extra": 0} for name in CATEGORIES}
    for relative_path, digest in server.items():
        if relative_path not in client:
            counters[category(relative_path)]["missing"] += 1
        elif client[relative_path] != digest:
            counters[category(relative_path)]["differ"] += 1
    for relative_path in client:
        if relative_path not in server:
            counters[category(relative_path)]["extra"] += 1
    return counters


def describe(counters: dict[str, int]) -> str:
    labels = (("differ", "differ"), ("missing", "missing on the client"), ("extra", "only on the client"))
    return ", ".join(f"{counters[key]} {label}" for key, label in labels if counters[key])


def report_versions(server_version: str, client_version: str) -> bool:
    """Print the build comparison and return True when the builds are known to differ."""

    server_label = server_version or "unknown (server has not logged a version yet)"
    client_label = client_version or "unknown (no local Steam client log)"
    print(f"Game build   server {server_label}")
    print(f"             client {client_label}")

    if not server_version or not client_version:
        print("             build comparison skipped")
        return False
    if server_version != client_version:
        print("             MISMATCH: the anti-cheat checksum will kick players. Run task update.")
        return True
    print("             match")
    return False


def section(title: str, lines: list[str]) -> None:
    print()
    print(f"{title} ({len(lines)})")
    if not lines:
        print("  none")
        return
    for line in lines:
        print(line)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--versions",
        action="store_true",
        help="only compare the server and client game builds",
    )
    args = parser.parse_args()

    try:
        output = run_on_server(SERVER_VERSION if args.versions else SERVER_INVENTORY)
    except ValueError as error:
        if args.versions:
            # The guard runs before the first task up, so an unreachable server is not a failure.
            print(f"Game build   server unreachable, comparison skipped ({error})")
            return 0
        print(f"Could not read the server inventory: {error}", file=sys.stderr)
        print("Start the server with task up first.", file=sys.stderr)
        return 1

    server_version, server_items, server_names = parse_server_inventory(output)

    mismatched_build = report_versions(server_version, local_version())
    if args.versions:
        return 1 if mismatched_build else 0

    try:
        steam_root = find_steam_root()
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    client_items = local_inventory(steam_root / "steamapps/workshop/content" / APP_ID)
    names = {**server_names, **local_names()}

    def label(item_id: str) -> str:
        return f"  {item_id}  {names.get(item_id, 'unknown mod')}"

    missing = sorted(set(server_items) - set(client_items))
    unused = sorted(set(client_items) - set(server_items))
    shared = sorted(set(server_items) & set(client_items))

    diverging: list[str] = []
    for item_id in shared:
        counters = compare_files(server_items[item_id], client_items[item_id])
        details = [
            f"      {name:<8} {describe(counters[name])}"
            for name in CATEGORIES
            if describe(counters[name])
        ]
        if details:
            diverging.append("\n".join([label(item_id), *details]))

    section(
        "Missing on this machine, downloaded on first join",
        [f"{label(item_id)}\n      {WORKSHOP_URL.format(item_id=item_id)}" for item_id in missing],
    )
    section("Installed here but not used by the server", [label(item_id) for item_id in unused])
    section("Shared but diverging", diverging)

    print()
    print(f"{len(shared)} shared items, {len(shared) - len(diverging)} identical.")
    if mismatched_build or diverging:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
