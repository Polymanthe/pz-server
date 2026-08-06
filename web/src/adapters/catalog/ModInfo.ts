/** Parsing of Project Zomboid's mod.info files and of the Build 42 layout. */

export type ModInfoFields = Readonly<Record<string, string>>;

export function parseModInfo(content: string): ModInfoFields {
  const fields: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    if (key !== "") {
      fields[key] = line.slice(separator + 1).trim();
    }
  }

  return fields;
}

export type VersionScore = readonly [number, number, number];

const NUMERIC_DIRECTORY = /^(\d+)(?:\.(\d+))?$/;

/**
 * Ranks the variants of a mod that ships several copies of itself, one per game
 * build, as in mods/91range/42.13/mod.info next to mods/91range/mod.info.
 *
 * This mirrors version_score() in scripts/discover_mods.py, including its quirk
 * of matching a purely numeric mod directory name. The two implementations must
 * agree: the site would otherwise describe a different variant than the one
 * task mods:sync selected.
 */
export function versionScore(relativePath: string): VersionScore {
  const parts = relativePath.split("/").filter((part) => part !== "");

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = NUMERIC_DIRECTORY.exec(parts[index]!);
    if (match) {
      return [1, Number(match[1]), Number(match[2] ?? 0)];
    }
  }

  return [0, 0, 0];
}

export function isHigher(candidate: VersionScore, current: VersionScore): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index]! !== current[index]!) {
      return candidate[index]! > current[index]!;
    }
  }
  return false;
}

/** Splits a Project Zomboid semicolon-separated setting such as Mods= or WorkshopItems=. */
export function parseSettingList(line: string): string[] {
  return line
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function readIniSetting(content: string, key: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1);
    }
  }
  return null;
}
