import type { Mod } from "../domain/model/Mod";
import { workshopUrl } from "../domain/model/Mod";

/** What /api/mods sends. Shared by the Astro pages and the React islands. */
export interface ModPayload {
  readonly id: string;
  readonly name: string;
  readonly author: string | null;
  readonly description: string | null;
  readonly category: string | null;
  /** Ready-to-use image URL, local route or remote thumbnail, null when none. */
  readonly posterUrl: string | null;
  readonly workshopUrl: string | null;
  /** True when the server declares the mod but its files are not on disk. */
  readonly missingFiles: boolean;
}

export function toModPayload(mod: Mod): ModPayload {
  const posterUrl =
    mod.poster === null
      ? null
      : mod.poster.source === "local"
        ? `/api/mods/${encodeURIComponent(mod.id)}/poster`
        : mod.poster.url;

  return {
    id: mod.id,
    name: mod.name,
    author: mod.author,
    description: mod.description,
    category: mod.category,
    posterUrl,
    workshopUrl: mod.workshopItemId === "" ? null : workshopUrl(mod.workshopItemId),
    missingFiles: mod.workshopItemId === "",
  };
}
