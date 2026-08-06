import { describe, expect, it } from "bun:test";

import {
  buildConnectionLink,
  InvalidConnectionTargetError,
} from "../../src/domain/usecases/BuildConnectionLink";

describe("buildConnectionLink", () => {
  it("produces the same URL as scripts/connection_link.py", () => {
    expect(buildConnectionLink({ host: "127.0.0.1", port: 16261, useSteam: true })).toBe(
      "steam://run/108600//%2Bconnect%20127.0.0.1%3A16261/",
    );
  });

  it("prefixes -nosteam when the server does not use Steam", () => {
    expect(buildConnectionLink({ host: "pz.example.org", port: 16261, useSteam: false })).toBe(
      "steam://run/108600//-nosteam%20%2Bconnect%20pz.example.org%3A16261/",
    );
  });

  it("trims surrounding whitespace from the address", () => {
    expect(buildConnectionLink({ host: "  pz.example.org  ", port: 16261, useSteam: true })).toBe(
      "steam://run/108600//%2Bconnect%20pz.example.org%3A16261/",
    );
  });

  it.each([
    ["an empty address", ""],
    ["a scheme", "https://pz.example.org"],
    ["a path", "pz.example.org/join"],
    ["an inner space", "pz example.org"],
  ])("rejects %s", (_label, host) => {
    expect(() => buildConnectionLink({ host, port: 16261, useSteam: true })).toThrow(
      InvalidConnectionTargetError,
    );
  });

  it.each([0, 65_536, -1, 1.5, Number.NaN])("rejects the port %p", (port) => {
    expect(() =>
      buildConnectionLink({ host: "pz.example.org", port, useSteam: true }),
    ).toThrow(InvalidConnectionTargetError);
  });
});
