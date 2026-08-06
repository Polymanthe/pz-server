import type { ModEnricher } from "../../domain/ports/ModEnricher";

/** Used when enrichment is switched off. The server files are already enough. */
export const nullModEnricher: ModEnricher = {
  enrich: async (mods) => mods,
};
