#!/usr/bin/env python3
"""Discover installed Project Zomboid Steam Workshop items and mod IDs."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


APP_ID = "108600"
WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id={item_id}"


def steam_roots() -> list[Path]:
    roots: list[Path] = []
    configured_root = os.environ.get("PZ_STEAM_ROOT")
    if configured_root:
        roots.append(Path(configured_root).expanduser())

    home = Path.home()
    roots.extend(
        [
            home / "Library/Application Support/Steam",
            home / ".steam/steam",
            home / ".local/share/Steam",
        ]
    )
    return roots


def find_steam_root() -> Path:
    for root in steam_roots():
        acf = root / "steamapps/workshop" / f"appworkshop_{APP_ID}.acf"
        if acf.is_file():
            return root

    searched = ", ".join(str(root) for root in steam_roots())
    raise ValueError(
        "Could not find Steam Workshop metadata. Set PZ_STEAM_ROOT or install "
        f"Project Zomboid Workshop content first. Searched: {searched}"
    )


def workshop_items(acf_file: Path) -> list[str]:
    content = acf_file.read_text(encoding="utf-8", errors="replace")
    match = re.search(r'"WorkshopItemsInstalled"\s*\{', content)
    if not match:
        raise ValueError(f"WorkshopItemsInstalled is missing from {acf_file}")

    depth = 1
    end = match.end()
    while end < len(content) and depth:
        if content[end] == "{":
            depth += 1
        elif content[end] == "}":
            depth -= 1
        end += 1

    if depth:
        raise ValueError(f"WorkshopItemsInstalled has unmatched braces in {acf_file}")

    block = content[match.end() : end - 1]
    return sorted(set(re.findall(r'^\s*"(\d+)"\s*\{', block, flags=re.MULTILINE)))


def version_score(path: Path) -> tuple[int, int, int]:
    """Prefer Build 42 metadata over legacy metadata for the same mod ID."""

    for part in reversed(path.parts):
        match = re.fullmatch(r"(\d+)(?:\.(\d+))?", part)
        if match:
            return (1, int(match.group(1)), int(match.group(2) or 0))
    return (0, 0, 0)


def parse_mod_info(path: Path, item_directory: Path) -> dict[str, object] | None:
    fields: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        fields[key.strip().lower()] = value.strip()

    mod_id = fields.get("id")
    if not mod_id:
        return None

    requires = [
        dependency.strip().lstrip("\\")
        for dependency in fields.get("require", "").split(",")
        if dependency.strip().lstrip("\\")
    ]
    relative_path = path.relative_to(item_directory).as_posix()
    return {
        "id": mod_id,
        "name": fields.get("name", mod_id),
        "requires": sorted(set(requires)),
        "metadata_path": relative_path,
        "build42_metadata": version_score(path.relative_to(item_directory))[0] == 1,
    }


def item_mods(item_directory: Path) -> list[dict[str, object]]:
    candidates: dict[str, tuple[tuple[int, int, int], dict[str, object]]] = {}
    for mod_info in item_directory.rglob("mod.info"):
        parsed = parse_mod_info(mod_info, item_directory)
        if parsed is None:
            continue

        score = version_score(mod_info.relative_to(item_directory))
        mod_id = str(parsed["id"])
        current = candidates.get(mod_id)
        if current is None or score > current[0]:
            candidates[mod_id] = (score, parsed)

    return [candidates[mod_id][1] for mod_id in sorted(candidates)]


def discover() -> dict[str, object]:
    steam_root = find_steam_root()
    workshop_directory = steam_root / "steamapps/workshop"
    content_directory = workshop_directory / "content" / APP_ID
    item_ids = workshop_items(workshop_directory / f"appworkshop_{APP_ID}.acf")

    items: dict[str, object] = {}
    mod_sources: dict[str, list[str]] = {}
    for item_id in item_ids:
        item_directory = content_directory / item_id
        installed = item_directory.is_dir()
        mods = item_mods(item_directory) if installed else []
        for mod in mods:
            mod_sources.setdefault(str(mod["id"]), []).append(item_id)

        items[item_id] = {
            "url": WORKSHOP_URL.format(item_id=item_id),
            "installed": installed,
            "mods": mods,
        }

    duplicates = {
        mod_id: source_ids
        for mod_id, source_ids in sorted(mod_sources.items())
        if len(source_ids) > 1
    }
    return {
        "schema_version": 1,
        "app_id": APP_ID,
        "items": items,
        "duplicate_mod_ids": duplicates,
    }


def list_items(catalog: dict[str, object]) -> None:
    for item_id, raw_item in catalog["items"].items():
        item = dict(raw_item)
        status = "installed" if item["installed"] else "missing"
        mods = list(item["mods"])
        mod_ids = ", ".join(str(mod["id"]) for mod in mods) or "no mod.info"
        print(f"{item_id} [{status}] {mod_ids}")
        print(item["url"])
        for mod in mods:
            requires = ", ".join(mod["requires"]) or "none"
            print(f"  - {mod['id']}: {mod['name']} (requires: {requires})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("mods/catalog.lock.json"))
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    try:
        catalog = discover()
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.list:
        list_items(catalog)

    installed = sum(1 for item in catalog["items"].values() if item["installed"])
    print(f"Discovered {len(catalog['items'])} Workshop items ({installed} installed).")
    if catalog["duplicate_mod_ids"]:
        print("Duplicate mod IDs detected; resolve will reject affected selections.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
