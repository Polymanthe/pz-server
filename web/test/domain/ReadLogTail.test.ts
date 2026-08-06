import { describe, expect, it } from "bun:test";

import {
  DEFAULT_LOG_LINES,
  MAX_LOG_LINES,
  readLogTail,
  UnknownLogFileError,
} from "../../src/domain/usecases/ReadLogTail";
import { journalWith, logFile } from "../fakes";

const SERVER_LOG = "2026-08-06_16-07_DebugLog-server.txt";

function journalRecording(requested: { file?: string; lines?: number }) {
  return journalWith({
    available: async () => [logFile(SERVER_LOG)],
    tail: async (file, lines) => {
      requested.file = file;
      requested.lines = lines;
      return ["first", "second"];
    },
  });
}

describe("readLogTail", () => {
  it("returns the tail of a listed file", async () => {
    const excerpt = await readLogTail({ journal: journalRecording({}) }, { file: SERVER_LOG });

    expect(excerpt.file).toBe(SERVER_LOG);
    expect(excerpt.lines).toEqual(["first", "second"]);
  });

  it.each([
    ["a file that is not listed", "secrets.txt"],
    ["a parent directory traversal", "../Server/pzserver.ini"],
    ["an absolute path", "/etc/passwd"],
    ["a listed name with a traversal prefix", `../Logs/${SERVER_LOG}`],
  ])("rejects %s", async (_label, file) => {
    const attempt = readLogTail({ journal: journalRecording({}) }, { file });

    await expect(attempt).rejects.toBeInstanceOf(UnknownLogFileError);
  });

  it("caps the number of lines", async () => {
    const requested: { lines?: number } = {};
    await readLogTail(
      { journal: journalRecording(requested) },
      { file: SERVER_LOG, lines: MAX_LOG_LINES * 10 },
    );

    expect(requested.lines).toBe(MAX_LOG_LINES);
  });

  it("asks for at least one line", async () => {
    const requested: { lines?: number } = {};
    await readLogTail({ journal: journalRecording(requested) }, { file: SERVER_LOG, lines: -5 });

    expect(requested.lines).toBe(1);
  });

  it("applies the default when no count is given", async () => {
    const requested: { lines?: number } = {};
    await readLogTail({ journal: journalRecording(requested) }, { file: SERVER_LOG });

    expect(requested.lines).toBe(DEFAULT_LOG_LINES);
  });

  it("falls back to the default for a non-numeric count", async () => {
    const requested: { lines?: number } = {};
    await readLogTail(
      { journal: journalRecording(requested) },
      { file: SERVER_LOG, lines: Number.NaN },
    );

    expect(requested.lines).toBe(DEFAULT_LOG_LINES);
  });
});
