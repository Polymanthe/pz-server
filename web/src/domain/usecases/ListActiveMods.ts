import type { Mod } from "../model/Mod";
import type { ModCatalog } from "../ports/ModCatalog";
import type { ModEnricher } from "../ports/ModEnricher";

export interface ListActiveModsDependencies {
  readonly catalog: ModCatalog;
  readonly enricher: ModEnricher;
  /** Called when enrichment fails, so the failure is visible without being fatal. */
  readonly onEnrichmentFailure?: (error: unknown) => void;
}

/**
 * The server files are the source of truth; enrichment only adds nicer titles
 * and thumbnails. A Steam outage must degrade the page, never break it.
 */
export async function listActiveMods(
  dependencies: ListActiveModsDependencies,
): Promise<readonly Mod[]> {
  const mods = await dependencies.catalog.activeMods();

  try {
    return await dependencies.enricher.enrich(mods);
  } catch (error) {
    dependencies.onEnrichmentFailure?.(error);
    return mods;
  }
}
