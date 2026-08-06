import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import type { Mod, ModId } from "../../domain/model/Mod";
import type { ModCatalog } from "../../domain/ports/ModCatalog";
import type { ModPosterStore } from "../../domain/ports/ModPosterStore";
import {
  isHigher,
  parseModInfo,
  parseSettingList,
  readIniSetting,
  versionScore,
  type ModInfoFields,
  type VersionScore,
} from "./ModInfo";

const APP_ID = "108600";
/** mod.info sits at mods/<modId>/mod.info or mods/<modId>/<build>/mod.info. */
const MAX_DEPTH = 4;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface WorkshopModsSettings {
  /** Directory holding Server/<name>.ini, mounted read-only. */
  readonly configDirectory: string;
  /** Directory holding steamapps/steam workshop content, mounted read-only. */
  readonly filesDirectory: string;
  readonly serverName: string;
}

interface Candidate {
  readonly fields: ModInfoFields;
  readonly score: VersionScore;
  readonly directory: string;
  readonly itemId: string;
}

interface Scan {
  readonly mods: readonly Mod[];
  readonly posters: ReadonlyMap<ModId, string>;
  readonly signature: string;
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function findModInfoFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }

  const found: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === "mod.info") {
      found.push(path);
    } else if (entry.isDirectory()) {
      found.push(...(await findModInfoFiles(path, depth + 1)));
    }
  }
  return found;
}

/**
 * Resolves the poster declared in mod.info, refusing anything outside the
 * Workshop item.
 *
 * The check runs on realpath, not on the textual path: mod.info comes from a
 * third-party Workshop item, and a symbolic link planted inside it would
 * otherwise pass a purely lexical containment test while stat and readFile
 * follow it. That file is then served publicly on /api/mods/<id>/poster.
 * The extension allowlist closes the same door from the other side.
 */
async function resolvePoster(candidate: Candidate, itemDirectory: string): Promise<string | null> {
  const declared = candidate.fields.poster ?? candidate.fields.icon;
  const names = [declared, "preview.png", "poster.png"].filter(
    (name): name is string => typeof name === "string" && name !== "",
  );

  let itemRoot: string;
  try {
    itemRoot = await realpath(itemDirectory);
  } catch {
    return null;
  }

  for (const directory of [candidate.directory, resolve(candidate.directory, "..")]) {
    for (const name of names) {
      if (!(extname(name).toLowerCase() in CONTENT_TYPES)) {
        continue;
      }

      try {
        const path = await realpath(resolve(directory, name));
        const inside = relative(itemRoot, path);
        if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
          continue;
        }
        if ((await stat(path)).isFile()) {
          return path;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export function createWorkshopMods(
  settings: WorkshopModsSettings,
  onProblem: (message: string) => void,
): { catalog: ModCatalog; posters: ModPosterStore } {
  const iniPath = join(settings.configDirectory, "Server", `${settings.serverName}.ini`);
  const contentDirectory = join(settings.filesDirectory, "steamapps/workshop/content", APP_ID);

  let cached: Scan | undefined;
  let inFlight: Promise<Scan> | undefined;

  async function signature(): Promise<string> {
    try {
      const details = await stat(iniPath);
      return `${details.mtimeMs}-${details.size}`;
    } catch {
      return "missing";
    }
  }

  async function scan(): Promise<Scan> {
    const current = await signature();
    let ini: string;
    try {
      ini = await readFile(iniPath, "utf8");
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      // The path stays in the logs: this message reaches the public page.
      console.error(`Server configuration not found at ${iniPath}`);
      onProblem(
        "La configuration du serveur est introuvable : la liste des mods ne peut pas être établie.",
      );
      return { mods: [], posters: new Map(), signature: current };
    }

    const modIds = parseSettingList(readIniSetting(ini, "Mods") ?? "");
    const itemIds = parseSettingList(readIniSetting(ini, "WorkshopItems") ?? "");

    // Best variant per mod id, across every Workshop item the server declares.
    const best = new Map<ModId, Candidate>();
    for (const itemId of itemIds) {
      const itemDirectory = join(contentDirectory, itemId);
      for (const file of await findModInfoFiles(itemDirectory)) {
        const fields = parseModInfo(await readFile(file, "utf8"));
        const id = fields.id;
        if (!id) {
          continue;
        }
        const candidate: Candidate = {
          fields,
          score: versionScore(relative(itemDirectory, file)),
          directory: resolve(file, ".."),
          itemId,
        };
        const known = best.get(id);
        if (!known || isHigher(candidate.score, known.score)) {
          best.set(id, candidate);
        }
      }
    }

    const posters = new Map<ModId, string>();
    const mods: Mod[] = [];

    for (const id of modIds) {
      const candidate = best.get(id);
      if (!candidate) {
        // The server declares a mod whose files are not on disk. Showing it is
        // more useful than hiding it: it usually means a failed download.
        mods.push({
          id,
          workshopItemId: "",
          name: id,
          author: null,
          description: null,
          category: null,
          poster: null,
        });
        continue;
      }

      const poster = await resolvePoster(candidate, join(contentDirectory, candidate.itemId));
      if (poster) {
        posters.set(id, poster);
      }

      mods.push({
        id,
        workshopItemId: candidate.itemId,
        name: candidate.fields.name || id,
        author: candidate.fields.author || null,
        description: candidate.fields.description || null,
        category: candidate.fields.category || null,
        poster: poster ? { source: "local" } : null,
      });
    }

    return { mods, posters, signature: current };
  }

  /** Rescans only when the server configuration changed. */
  async function current(): Promise<Scan> {
    if (cached && cached.signature === (await signature())) {
      return cached;
    }
    inFlight ??= scan()
      .then((result) => {
        cached = result;
        return result;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return {
    catalog: {
      async activeMods() {
        return (await current()).mods;
      },
    },

    posters: {
      async find(modId) {
        const path = (await current()).posters.get(modId);
        if (!path) {
          return null;
        }

        const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
        if (!contentType) {
          // Unreachable: resolvePoster only accepts known extensions. Kept so
          // this never degrades into serving arbitrary bytes to the internet.
          return null;
        }

        const [contents, details] = await Promise.all([readFile(path), stat(path)]);
        return {
          // Copied out of Node's shared Buffer pool: a pooled slice aliases
          // memory that other reads keep writing to.
          bytes: new Uint8Array(contents),
          contentType,
          fingerprint: `${details.size}-${details.mtimeMs}`,
        };
      },
    },
  };
}
