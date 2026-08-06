import { describe, expect, it } from "bun:test";

import type { WorkshopDetailsSource } from "../../src/adapters/enricher/SteamWorkshopSource";
import { createWorkshopModEnricher } from "../../src/adapters/enricher/WorkshopModEnricher";
import { mod } from "../fakes";

function sourceOf(entries: Record<string, Partial<{ title: string; description: string; previewUrl: string }>>): WorkshopDetailsSource {
  return {
    async fetchDetails() {
      return new Map(
        Object.entries(entries).map(([id, entry]) => [
          id,
          {
            title: entry.title ?? null,
            description: entry.description ?? null,
            previewUrl: entry.previewUrl ?? null,
          },
        ]),
      );
    },
  };
}

describe("createWorkshopModEnricher", () => {
  it("keeps the local name, because a Workshop item can bundle several mods", async () => {
    const enricher = createWorkshopModEnricher(sourceOf({ "1": { title: "KI5 Vehicle Pack" } }));

    const [enriched] = await enricher.enrich([
      mod("91range", { workshopItemId: "1", name: "'91 Range Rover" }),
    ]);

    expect(enriched!.name).toBe("'91 Range Rover");
  });

  it("fills a description the mod files do not carry", async () => {
    const enricher = createWorkshopModEnricher(sourceOf({ "1": { description: "Ajoute un 4x4." } }));

    const [enriched] = await enricher.enrich([mod("91range", { workshopItemId: "1" })]);

    expect(enriched!.description).toBe("Ajoute un 4x4.");
  });

  it("never overwrites a description the mod already carries", async () => {
    const enricher = createWorkshopModEnricher(sourceOf({ "1": { description: "Version Steam" } }));

    const [enriched] = await enricher.enrich([
      mod("91range", { workshopItemId: "1", description: "Version locale" }),
    ]);

    expect(enriched!.description).toBe("Version locale");
  });

  it("uses the Steam thumbnail only when the mod ships none", async () => {
    const enricher = createWorkshopModEnricher(
      sourceOf({ "1": { previewUrl: "https://images.steamusercontent.com/a.jpg" } }),
    );

    const [withoutLocal, withLocal] = await enricher.enrich([
      mod("a", { workshopItemId: "1" }),
      mod("b", { workshopItemId: "1", poster: { source: "local" } }),
    ]);

    expect(withoutLocal!.poster).toEqual({
      source: "remote",
      url: "https://images.steamusercontent.com/a.jpg",
    });
    expect(withLocal!.poster).toEqual({ source: "local" });
  });

  it("leaves a mod untouched when Steam knows nothing about its item", async () => {
    const enricher = createWorkshopModEnricher(sourceOf({}));
    const original = mod("91range", { workshopItemId: "1" });

    expect((await enricher.enrich([original]))[0]).toEqual(original);
  });

  it("does not call Steam when no mod has a Workshop item", async () => {
    let called = false;
    const enricher = createWorkshopModEnricher({
      async fetchDetails() {
        called = true;
        return new Map();
      },
    });

    await enricher.enrich([mod("ghost", { workshopItemId: "" })]);

    expect(called).toBe(false);
  });
});
