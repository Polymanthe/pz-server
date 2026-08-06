import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSystemJournal } from "../../src/adapters/journal/FileSystemJournal";

const SERVER_LOG = "2026-08-06_16-07_DebugLog-server.txt";
const CONNECTIONS_LOG = "2026-08-06_16-07_connections.txt";

// The real line, copied from the running server's log.
const BOOT_LINE =
  "[06-08-26 16:07:14.657] LOG  : General      f:0 st:7,069,669> version=42.20.2 ffe7a8a4b1 demo=false.";

let directory: string;

async function write(name: string, content: string, modifiedAt?: Date): Promise<void> {
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  if (modifiedAt) {
    await utimes(path, modifiedAt, modifiedAt);
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pz-journal-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("createFileSystemJournal", () => {
  it("lists text files most recent first", async () => {
    await write(SERVER_LOG, "a\n", new Date("2026-08-06T16:00:00Z"));
    await write(CONNECTIONS_LOG, "b\n", new Date("2026-08-06T18:00:00Z"));
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect((await journal.available()).map((file) => file.name)).toEqual([
      CONNECTIONS_LOG,
      SERVER_LOG,
    ]);
  });

  it("ignores rotated subdirectories and non-text files", async () => {
    await write(SERVER_LOG, "a\n");
    await write("world.db", "binary");
    await mkdir(join(directory, "logs_2026-08-06"));
    await writeFile(join(directory, "logs_2026-08-06", "old.txt"), "old\n");
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect((await journal.available()).map((file) => file.name)).toEqual([SERVER_LOG]);
  });

  it("treats a missing log directory as an empty journal", async () => {
    const journal = createFileSystemJournal({ logsDirectory: join(directory, "absent") });

    expect(await journal.available()).toEqual([]);
    expect(await journal.lastActivityAt()).toBeNull();
    expect(await journal.currentBuild()).toBeNull();
  });

  it("reports the most recent write as the last activity", async () => {
    await write(SERVER_LOG, "a\n", new Date("2026-08-06T16:00:00Z"));
    await write(CONNECTIONS_LOG, "b\n", new Date("2026-08-06T18:30:00Z"));
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.lastActivityAt()).toEqual(new Date("2026-08-06T18:30:00Z"));
  });

  it("reads the build from the boot line at the head of the server log", async () => {
    await write(SERVER_LOG, `${BOOT_LINE}\n${"filler\n".repeat(1000)}`);
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.currentBuild()).toBe("42.20.2 ffe7a8a4b1");
  });

  it("returns no build when only other logs exist", async () => {
    await write(CONNECTIONS_LOG, `${BOOT_LINE}\n`);
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.currentBuild()).toBeNull();
  });

  it("returns the last lines of a file", async () => {
    await write(SERVER_LOG, "one\ntwo\nthree\nfour\n");
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.tail(SERVER_LOG, 2)).toEqual(["three", "four"]);
  });

  it("returns the whole file when it holds fewer lines than requested", async () => {
    await write(SERVER_LOG, "one\ntwo\n");
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.tail(SERVER_LOG, 100)).toEqual(["one", "two"]);
  });

  it("returns nothing for an empty file", async () => {
    await write(SERVER_LOG, "");
    const journal = createFileSystemJournal({ logsDirectory: directory });

    expect(await journal.tail(SERVER_LOG, 10)).toEqual([]);
  });

  it("reads across chunk boundaries without losing or duplicating lines", async () => {
    // 20 000 lines of ~60 bytes is roughly 1.2 MiB, and the requested tail of
    // 15 000 lines is far past the 128 KiB read chunk, so this spans several reads.
    const padding = "x".repeat(50);
    const lines = Array.from({ length: 20_000 }, (_, index) => `line ${index} ${padding}`);
    await write(SERVER_LOG, `${lines.join("\n")}\n`);
    const journal = createFileSystemJournal({ logsDirectory: directory });

    const tail = await journal.tail(SERVER_LOG, 15_000);

    expect(tail).toHaveLength(15_000);
    expect(tail[0]).toBe(`line 5000 ${padding}`);
    expect(tail[14_999]).toBe(`line 19999 ${padding}`);
    expect(new Set(tail).size).toBe(15_000);
  });

  it("keeps multi-byte characters intact across a chunk boundary", async () => {
    const padding = "é".repeat(40);
    const lines = Array.from({ length: 20_000 }, (_, index) => `ligne ${index} ${padding}…`);
    await write(SERVER_LOG, `${lines.join("\n")}\n`);
    const journal = createFileSystemJournal({ logsDirectory: directory });

    const tail = await journal.tail(SERVER_LOG, 15_000);

    expect(tail[0]).toBe(`ligne 5000 ${padding}…`);
    expect(tail.every((line) => !line.includes("�"))).toBe(true);
  });
});
