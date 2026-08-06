import { describe, expect, it } from "bun:test";

import type { ServerIdentity } from "../../src/domain/model/ServerStatus";
import {
  getServerStatus,
  STARTING_WINDOW_MS,
} from "../../src/domain/usecases/GetServerStatus";
import {
  fixedClock,
  journalWith,
  probeReturning,
  unavailableProbe,
  unreachableProbe,
} from "../fakes";

const NOW = "2026-08-06T18:00:00Z";
const identity: ServerIdentity = { address: "pz.example.org", port: 16261, maxPlayers: 8 };

function ago(milliseconds: number): Date {
  return new Date(new Date(NOW).getTime() - milliseconds);
}

describe("getServerStatus", () => {
  it("reports online with the connected players when the probe answers", async () => {
    const status = await getServerStatus({
      probe: probeReturning([{ name: "globule" }]),
      journal: journalWith({ currentBuild: async () => "42.20.2 ffe7a8a4b1" }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("online");
    expect(status.players).toEqual([{ name: "globule" }]);
    expect(status.gameBuild).toBe("42.20.2 ffe7a8a4b1");
    expect(status.maxPlayers).toBe(8);
    expect(status.address).toBe("pz.example.org");
    expect(status.port).toBe(16261);
    expect(status.problems).toEqual([]);
  });

  it("reports online with nobody connected rather than offline", async () => {
    const status = await getServerStatus({
      probe: probeReturning([]),
      journal: journalWith(),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("online");
    expect(status.players).toEqual([]);
  });

  it("reports starting when nothing listens but the journal was just written", async () => {
    const status = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => ago(30_000) }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("starting");
    expect(status.players).toEqual([]);
  });

  it("reports offline when nothing listens and the journal is stale", async () => {
    const status = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => ago(STARTING_WINDOW_MS * 2) }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("offline");
  });

  it("treats the starting window as exclusive at its boundary", async () => {
    const atBoundary = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => ago(STARTING_WINDOW_MS) }),
      clock: fixedClock(NOW),
      identity,
    });
    const justInside = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => ago(STARTING_WINDOW_MS - 1) }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(atBoundary.state).toBe("offline");
    expect(justInside.state).toBe("starting");
  });

  it("reports offline on a volume that has never been written to", async () => {
    const status = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => null }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("offline");
    expect(status.gameBuild).toBeNull();
  });

  it("honours an overridden starting window", async () => {
    const status = await getServerStatus({
      probe: unreachableProbe(),
      journal: journalWith({ lastActivityAt: async () => ago(30_000) }),
      clock: fixedClock(NOW),
      identity,
      startingWindowMs: 10_000,
    });

    expect(status.state).toBe("offline");
  });

  it("never claims the server is down when the probe itself cannot run", async () => {
    const status = await getServerStatus({
      probe: unavailableProbe("RCON_PASSWORD n'est pas défini."),
      // A stale journal would read as "offline" if the outcome were confused
      // with an unreachable server.
      journal: journalWith({ lastActivityAt: async () => ago(STARTING_WINDOW_MS * 10) }),
      clock: fixedClock(NOW),
      identity,
    });

    expect(status.state).toBe("unknown");
    expect(status.players).toEqual([]);
    expect(status.problems).toEqual(["RCON_PASSWORD n'est pas défini."]);
  });

  it("carries deployment problems detected before the request", async () => {
    const status = await getServerStatus({
      probe: probeReturning([]),
      journal: journalWith(),
      clock: fixedClock(NOW),
      identity: { ...identity, address: null },
      problems: ["SERVER_CONNECT_ADDRESS n'est pas défini."],
    });

    expect(status.state).toBe("online");
    expect(status.problems).toEqual(["SERVER_CONNECT_ADDRESS n'est pas défini."]);
    expect(status.address).toBeNull();
  });

  it("does not repeat a problem already reported by the configuration", async () => {
    const reason = "RCON_PASSWORD n'est pas défini.";
    const status = await getServerStatus({
      probe: unavailableProbe(reason),
      journal: journalWith(),
      clock: fixedClock(NOW),
      identity,
      problems: [reason],
    });

    expect(status.problems).toEqual([reason]);
  });
});
