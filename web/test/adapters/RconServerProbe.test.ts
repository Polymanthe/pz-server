import { describe, expect, it } from "bun:test";

import {
  createUnavailableProbe,
  isUnreachable,
  parsePlayers,
} from "../../src/adapters/probe/RconServerProbe";

describe("parsePlayers", () => {
  it("reads an empty server, exactly as the server answers it", () => {
    expect(parsePlayers("Players connected (0):\n")).toEqual([]);
  });

  it("reads the hyphen-prefixed names", () => {
    expect(parsePlayers("Players connected (2):\n-globule\n-someone\n")).toEqual([
      { name: "globule" },
      { name: "someone" },
    ]);
  });

  it("tolerates carriage returns and stray blank lines", () => {
    expect(parsePlayers("Players connected (1):\r\n-globule\r\n\r\n")).toEqual([
      { name: "globule" },
    ]);
  });

  it("keeps names that contain a hyphen", () => {
    expect(parsePlayers("Players connected (1):\n-jean-claude\n")).toEqual([
      { name: "jean-claude" },
    ]);
  });

  it("rejects a response that is not the players listing", () => {
    expect(() => parsePlayers("Unknown command\n")).toThrow(/Unexpected response/);
  });
});

describe("isUnreachable", () => {
  it.each(["ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ETIMEDOUT"])(
    "treats %s as the server being down",
    (code) => {
      expect(isUnreachable(Object.assign(new Error("connect"), { code }))).toBe(true);
    },
  );

  it("treats a timeout message as the server being down", () => {
    expect(isUnreachable(new Error("Timeout while connecting"))).toBe(true);
  });

  it("does not hide an authentication failure behind an offline status", () => {
    expect(isUnreachable(new Error("Authentication failed: password rejected"))).toBe(false);
  });

  it("does not treat an arbitrary value as the server being down", () => {
    expect(isUnreachable(null)).toBe(false);
    expect(isUnreachable("boom")).toBe(false);
  });
});

describe("createUnavailableProbe", () => {
  it("carries the reason instead of pretending the server is unreachable", async () => {
    const probe = createUnavailableProbe("RCON_PASSWORD n'est pas défini.");

    expect(await probe.probe()).toEqual({
      kind: "unavailable",
      reason: "RCON_PASSWORD n'est pas défini.",
    });
  });
});
