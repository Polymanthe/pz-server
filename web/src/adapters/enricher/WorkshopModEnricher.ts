import type { Mod } from "../../domain/model/Mod";
import type { ModEnricher } from "../../domain/ports/ModEnricher";
import type { WorkshopDetailsSource } from "./SteamWorkshopSource";

/**
 * Completes each mod with what the server files do not carry.
 *
 * The local name always wins: a Workshop item can bundle several mods, so its
 * title names the pack, not the mod. Using it would relabel every mod of a pack
 * with the same wrong name. Steam only fills gaps and supplies a thumbnail when
 * the mod ships none.
 */
export function createWorkshopModEnricher(source: WorkshopDetailsSource): ModEnricher {
  return {
    async enrich(mods) {
      const itemIds = [...new Set(mods.map((mod) => mod.workshopItemId).filter((id) => id !== ""))];
      if (itemIds.length === 0) {
        return mods;
      }

      const details = await source.fetchDetails(itemIds);

      return mods.map((mod): Mod => {
        const entry = details.get(mod.workshopItemId);
        if (!entry) {
          return mod;
        }

        return {
          ...mod,
          description: mod.description ?? entry.description,
          poster:
            mod.poster ?? (entry.previewUrl ? { source: "remote", url: entry.previewUrl } : null),
        };
      });
    },
  };
}
