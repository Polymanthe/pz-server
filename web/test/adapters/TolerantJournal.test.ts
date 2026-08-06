import { describe, expect, it } from "bun:test";

import { tolerant } from "../../src/adapters/journal/TolerantJournal";
import { journalWith } from "../fakes";

function exploding() {
  return journalWith({
    available: async () => {
      throw new Error("EACCES: permission denied");
    },
    lastActivityAt: async () => {
      throw new Error("EACCES: permission denied");
    },
    currentBuild: async () => {
      throw new Error("EACCES: permission denied");
    },
    tail: async () => {
      throw new Error("EACCES: permission denied");
    },
  });
}

describe("tolerant", () => {
  it("degrades an unreadable log directory into a reported problem", async () => {
    const problems: string[] = [];
    const journal = tolerant(exploding(), (message) => problems.push(message));

    expect(await journal.available()).toEqual([]);
    expect(await journal.lastActivityAt()).toBeNull();
    expect(await journal.currentBuild()).toBeNull();
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("Lecture des journaux du serveur impossible");
  });

  it("keeps the underlying error out of a problem shown on the public page", async () => {
    const problems: string[] = [];
    const journal = tolerant(exploding(), (message) => problems.push(message));

    await journal.available();

    expect(problems[0]).not.toContain("EACCES");
    expect(problems[0]).not.toContain("permission denied");
  });

  it("still fails a tail so the log panel does not show a silently empty file", async () => {
    const journal = tolerant(exploding(), () => undefined);

    await expect(journal.tail("whatever.txt", 10)).rejects.toThrow("permission denied");
  });

  it("passes healthy results through untouched", async () => {
    const problems: string[] = [];
    const journal = tolerant(
      journalWith({ currentBuild: async () => "42.20.2 ffe7a8a4b1" }),
      (message) => problems.push(message),
    );

    expect(await journal.currentBuild()).toBe("42.20.2 ffe7a8a4b1");
    expect(problems).toEqual([]);
  });
});
