import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { WorkshopDetails, WorkshopDetailsSource } from "./SteamWorkshopSource";

interface CacheEntry {
  readonly fetchedAt: number;
  readonly details: WorkshopDetails;
}

export interface CacheSettings {
  readonly file: string;
  readonly ttlMs: number;
  readonly now?: () => number;
  readonly onProblem?: (message: string) => void;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  const entry = value as CacheEntry | null;
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof entry.fetchedAt === "number" &&
    typeof entry.details === "object" &&
    entry.details !== null
  );
}

/**
 * Remembers Workshop details across restarts so a page view does not depend on
 * Steam answering. Only items missing from the cache, or stale in it, are
 * fetched; everything else is served from disk.
 *
 * A cache that cannot be read or written is reported and then ignored: it must
 * never be the reason the mods page fails.
 */
export function withFileCache(
  source: WorkshopDetailsSource,
  settings: CacheSettings,
): WorkshopDetailsSource {
  const now = settings.now ?? Date.now;
  let entries: Map<string, CacheEntry> | undefined;

  async function load(): Promise<Map<string, CacheEntry>> {
    if (entries) {
      return entries;
    }

    entries = new Map();
    try {
      const parsed: unknown = JSON.parse(await readFile(settings.file, "utf8"));
      for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
        if (isCacheEntry(entry)) {
          entries.set(id, entry);
        }
      }
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== "ENOENT") {
        console.error("Steam cache unreadable", error);
        settings.onProblem?.("Cache Steam illisible, il sera reconstruit.");
      }
    }
    return entries;
  }

  async function persist(current: Map<string, CacheEntry>): Promise<void> {
    try {
      await mkdir(dirname(settings.file), { recursive: true });
      // Written aside then moved, so a crash cannot leave a truncated cache.
      const temporary = `${settings.file}.tmp`;
      await writeFile(temporary, JSON.stringify(Object.fromEntries(current)), "utf8");
      await rename(temporary, settings.file);
    } catch (error) {
      console.error("Steam cache not written", error);
      settings.onProblem?.("Cache Steam non écrit, les détails seront redemandés.");
    }
  }

  return {
    async fetchDetails(itemIds) {
      const current = await load();
      const instant = now();

      const details = new Map<string, WorkshopDetails>();
      const missing: string[] = [];
      for (const id of itemIds) {
        const entry = current.get(id);
        if (entry && instant - entry.fetchedAt < settings.ttlMs) {
          details.set(id, entry.details);
        } else {
          missing.push(id);
        }
      }

      if (missing.length === 0) {
        return details;
      }

      const fetched = await source.fetchDetails(missing);
      for (const [id, entry] of fetched) {
        details.set(id, entry);
        current.set(id, { fetchedAt: instant, details: entry });
      }
      await persist(current);

      return details;
    },
  };
}
