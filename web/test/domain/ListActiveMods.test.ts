import { describe, expect, it } from "bun:test";

import type { ModEnricher } from "../../src/domain/ports/ModEnricher";
import { listActiveMods } from "../../src/domain/usecases/ListActiveMods";
import { catalogOf, failingEnricher, mod } from "../fakes";

const passthrough: ModEnricher = { enrich: async (mods) => mods };

describe("listActiveMods", () => {
  it("returns the enriched mods when enrichment succeeds", async () => {
    const enricher: ModEnricher = {
      enrich: async (mods) => mods.map((entry) => ({ ...entry, name: `${entry.name} (Steam)` })),
    };

    const mods = await listActiveMods({ catalog: catalogOf([mod("damnlib")]), enricher });

    expect(mods.map((entry) => entry.name)).toEqual(["damnlib (Steam)"]);
  });

  it("falls back to the server files when enrichment fails", async () => {
    const mods = await listActiveMods({
      catalog: catalogOf([mod("damnlib"), mod("91range")]),
      enricher: failingEnricher(new Error("Steam is unreachable")),
    });

    expect(mods.map((entry) => entry.id)).toEqual(["damnlib", "91range"]);
  });

  it("reports the enrichment failure instead of swallowing it", async () => {
    const failure = new Error("Steam is unreachable");
    const reported: unknown[] = [];

    await listActiveMods({
      catalog: catalogOf([mod("damnlib")]),
      enricher: failingEnricher(failure),
      onEnrichmentFailure: (error) => reported.push(error),
    });

    expect(reported).toEqual([failure]);
  });

  it("preserves the order the server declares", async () => {
    const mods = await listActiveMods({
      catalog: catalogOf([mod("damnlib"), mod("91range"), mod("63beetle")]),
      enricher: passthrough,
    });

    expect(mods.map((entry) => entry.id)).toEqual(["damnlib", "91range", "63beetle"]);
  });
});
