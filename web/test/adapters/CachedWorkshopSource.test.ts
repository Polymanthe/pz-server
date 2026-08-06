import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withFileCache } from "../../src/adapters/enricher/CachedWorkshopSource";
import type {
  WorkshopDetails,
  WorkshopDetailsSource,
} from "../../src/adapters/enricher/SteamWorkshopSource";

const DAY = 24 * 3600 * 1000;

function details(title: string): WorkshopDetails {
  return { title, description: null, previewUrl: null };
}

function countingSource(): WorkshopDetailsSource & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    asked,
    async fetchDetails(itemIds) {
      asked.push([...itemIds]);
      return new Map(itemIds.map((id) => [id, details(`titre ${id}`)]));
    },
  };
}

let directory: string;
let file: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pz-steam-cache-"));
  file = join(directory, "steam-workshop.json");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("withFileCache", () => {
  it("asks the source once and then serves from the cache", async () => {
    const source = countingSource();
    const cached = withFileCache(source, { file, ttlMs: DAY, now: () => 1000 });

    await cached.fetchDetails(["1", "2"]);
    const second = await cached.fetchDetails(["1", "2"]);

    expect(source.asked).toEqual([["1", "2"]]);
    expect(second.get("2")).toEqual(details("titre 2"));
  });

  it("asks only for the items it does not already know", async () => {
    const source = countingSource();
    const cached = withFileCache(source, { file, ttlMs: DAY, now: () => 1000 });

    await cached.fetchDetails(["1"]);
    await cached.fetchDetails(["1", "2"]);

    expect(source.asked).toEqual([["1"], ["2"]]);
  });

  it("refetches an entry older than the retention", async () => {
    const source = countingSource();
    let instant = 1000;
    const cached = withFileCache(source, { file, ttlMs: DAY, now: () => instant });

    await cached.fetchDetails(["1"]);
    instant += DAY + 1;
    await cached.fetchDetails(["1"]);

    expect(source.asked).toEqual([["1"], ["1"]]);
  });

  it("survives a restart by reading the file back", async () => {
    const first = countingSource();
    await withFileCache(first, { file, ttlMs: DAY, now: () => 1000 }).fetchDetails(["1"]);

    const second = countingSource();
    const revived = await withFileCache(second, { file, ttlMs: DAY, now: () => 2000 }).fetchDetails([
      "1",
    ]);

    expect(second.asked).toEqual([]);
    expect(revived.get("1")).toEqual(details("titre 1"));
  });

  it("rebuilds a corrupted cache instead of failing", async () => {
    await writeFile(file, "{ this is not json", "utf8");
    const problems: string[] = [];
    const source = countingSource();

    const result = await withFileCache(source, {
      file,
      ttlMs: DAY,
      now: () => 1000,
      onProblem: (message) => problems.push(message),
    }).fetchDetails(["1"]);

    expect(result.get("1")).toEqual(details("titre 1"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Cache Steam illisible");
  });

  it("keeps working when the cache cannot be written", async () => {
    const problems: string[] = [];
    const source = countingSource();

    // A path whose parent is a file, so both mkdir and write fail.
    await writeFile(join(directory, "blocker"), "x", "utf8");
    const result = await withFileCache(source, {
      file: join(directory, "blocker", "cache.json"),
      ttlMs: DAY,
      now: () => 1000,
      onProblem: (message) => problems.push(message),
    }).fetchDetails(["1"]);

    expect(result.get("1")).toEqual(details("titre 1"));
    // Both the read and the write fail, and both are worth reporting.
    expect(problems.some((problem) => problem.includes("Cache Steam illisible"))).toBe(true);
    expect(problems.some((problem) => problem.includes("Cache Steam non écrit"))).toBe(true);
  });

  it("does not leave a temporary file behind", async () => {
    await withFileCache(countingSource(), { file, ttlMs: DAY, now: () => 1000 }).fetchDetails(["1"]);

    expect(JSON.parse(await readFile(file, "utf8"))).toHaveProperty("1");
    await expect(readFile(`${file}.tmp`, "utf8")).rejects.toThrow();
  });
});
