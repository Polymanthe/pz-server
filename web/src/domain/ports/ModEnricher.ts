import type { Mod } from "../model/Mod";

export interface ModEnricher {
  /**
   * Completes mods with data the server files do not hold, such as the
   * Workshop title or a hosted thumbnail. Enrichment is a bonus: callers must
   * keep working when this rejects.
   */
  enrich(mods: readonly Mod[]): Promise<readonly Mod[]>;
}
