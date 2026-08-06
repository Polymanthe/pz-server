import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { LogFile } from "../../domain/model/Log";
import type { ServerJournal } from "../../domain/ports/ServerJournal";

const CHUNK_BYTES = 128 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
/** The build is logged once at boot, so it lives at the head of the file, never the tail. */
const HEAD_BYTES = 256 * 1024;
const SERVER_LOG_SUFFIX = "_DebugLog-server.txt";
const VERSION = /version=([0-9][^\s]*\s[a-f0-9]+)/g;

export interface JournalSettings {
  /** Directory Project Zomboid writes its logs to, mounted read-only. */
  readonly logsDirectory: string;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

async function readTail(path: string, lines: number): Promise<string[]> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const chunks: Buffer[] = [];
    let position = size;
    let newlines = 0;
    let read = 0;

    while (position > 0 && newlines <= lines && read < MAX_TAIL_BYTES) {
      const length = Math.min(CHUNK_BYTES, position);
      position -= length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, position);
      chunks.unshift(buffer);
      read += length;
      for (const byte of buffer) {
        if (byte === 0x0a) {
          newlines += 1;
        }
      }
    }

    const all = Buffer.concat(chunks).toString("utf8").split("\n");
    if (position > 0) {
      // The first line is cut in half by the chunk boundary. Dropping it also
      // discards any multi-byte character split across that boundary.
      all.shift();
    }
    while (all.length > 0 && all[all.length - 1] === "") {
      all.pop();
    }

    return all.slice(-lines).map((line) => line.replace(/\r$/, ""));
  } finally {
    await handle.close();
  }
}

async function readHead(path: string, bytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Exposes the log files sitting directly in the log directory. Rotated
 * subdirectories are deliberately left out, and nothing outside this listing
 * can be reached: callers select a name from `available`, never a path.
 */
export function createFileSystemJournal(settings: JournalSettings): ServerJournal {
  async function available(): Promise<LogFile[]> {
    let entries;
    try {
      entries = await readdir(settings.logsDirectory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
        .map(async (entry) => {
          const details = await stat(join(settings.logsDirectory, entry.name));
          return { name: entry.name, sizeBytes: details.size, modifiedAt: details.mtime };
        }),
    );

    return files.sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
  }

  return {
    available,

    async tail(fileName, lines) {
      return readTail(join(settings.logsDirectory, fileName), lines);
    },

    async lastActivityAt() {
      const files = await available();
      return files.length === 0 ? null : files[0]!.modifiedAt;
    },

    async currentBuild() {
      const files = await available();
      const serverLog = files.find((file) => file.name.endsWith(SERVER_LOG_SUFFIX));
      if (!serverLog) {
        return null;
      }

      const head = await readHead(join(settings.logsDirectory, serverLog.name), HEAD_BYTES);
      const matches = [...head.matchAll(VERSION)];
      return matches.length === 0 ? null : matches[matches.length - 1]![1]!;
    },
  };
}
