import { describe, expect, it } from "bun:test";

import {
  createSteamWorkshopSource,
  parseWorkshopResponse,
  plainDescription,
} from "../../src/adapters/enricher/SteamWorkshopSource";

describe("plainDescription", () => {
  it("strips BBCode markup", () => {
    expect(plainDescription("[h1]Titre[/h1] Un [b]super[/b] mod.")).toBe("Titre Un super mod.");
  });

  it("collapses blank lines and repeated spaces", () => {
    expect(plainDescription("a   b\n\n\n\nc")).toBe("a b\nc");
  });

  it("returns null for a description that is only markup", () => {
    expect(plainDescription("[img]https://example.org/a.png[/img]")).toBeNull();
  });

  it("truncates on a word boundary", () => {
    const long = `${"mot ".repeat(200)}fin`;
    const short = plainDescription(long)!;

    expect(short.length).toBeLessThanOrEqual(321);
    expect(short.endsWith("…")).toBe(true);
    expect(short).not.toContain("mo…");
  });

  it("leaves a short description untouched", () => {
    expect(plainDescription("Ajoute une voiture.")).toBe("Ajoute une voiture.");
  });
});

describe("parseWorkshopResponse", () => {
  it("reads the fields of a Steam answer", () => {
    const details = parseWorkshopResponse({
      response: {
        publishedfiledetails: [
          {
            publishedfileid: "2409333430",
            title: "'91 Range Rover Classic",
            description: "[b]Adds[/b] a Range Rover.",
            preview_url: "https://images.steamusercontent.com/a.jpg",
          },
        ],
      },
    });

    expect(details.get("2409333430")).toEqual({
      title: "'91 Range Rover Classic",
      description: "Adds a Range Rover.",
      previewUrl: "https://images.steamusercontent.com/a.jpg",
    });
  });

  it("skips entries without an id", () => {
    expect(parseWorkshopResponse({ response: { publishedfiledetails: [{ title: "x" }] } }).size).toBe(
      0,
    );
  });

  it.each([
    ["an empty object", {}],
    ["a null body", null],
    ["an unexpected shape", { response: { publishedfiledetails: "nope" } }],
  ])("returns nothing for %s", (_label, body) => {
    expect(parseWorkshopResponse(body).size).toBe(0);
  });

  it("reports a deleted item as having no details rather than dropping it", () => {
    const details = parseWorkshopResponse({
      response: { publishedfiledetails: [{ publishedfileid: "1", result: 9 }] },
    });

    expect(details.get("1")).toEqual({ title: null, description: null, previewUrl: null });
  });
});

describe("createSteamWorkshopSource", () => {
  it("splits the request into batches of 100", async () => {
    const counts: number[] = [];
    const source = createSteamWorkshopSource({
      timeoutMs: 1000,
      fetchImpl: async (_url, init) => {
        const body = init?.body as URLSearchParams;
        counts.push(Number(body.get("itemcount")));
        return Response.json({ response: { publishedfiledetails: [] } });
      },
    });

    await source.fetchDetails(Array.from({ length: 132 }, (_, index) => String(index)));

    expect(counts).toEqual([100, 32]);
  });

  it("raises when Steam refuses the request", async () => {
    const source = createSteamWorkshopSource({
      timeoutMs: 1000,
      fetchImpl: async () => new Response("nope", { status: 503 }),
    });

    await expect(source.fetchDetails(["1"])).rejects.toThrow("Steam a répondu 503");
  });
});
