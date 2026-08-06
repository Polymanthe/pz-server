import type { ProbeOutcome, ServerProbe } from "../../domain/ports/ServerProbe";

type Snapshot = {
  readonly takenAt: number;
  readonly outcome: ProbeOutcome;
};

/**
 * Keeps a short-lived snapshot and collapses concurrent calls into one.
 * Every page view asks for the status, and each RCON round trip opens a TCP
 * connection to the game server: without this, a handful of viewers would
 * hammer a server that is busy simulating a world.
 */
export function withCache(
  probe: ServerProbe,
  ttlMs: number,
  now: () => number = Date.now,
): ServerProbe {
  let snapshot: Snapshot | undefined;
  let inFlight: Promise<ProbeOutcome> | undefined;

  return {
    async probe() {
      if (snapshot && now() - snapshot.takenAt < ttlMs) {
        return snapshot.outcome;
      }
      if (inFlight) {
        return inFlight;
      }

      inFlight = probe
        .probe()
        .then((outcome) => {
          snapshot = { takenAt: now(), outcome };
          return outcome;
        })
        .finally(() => {
          inFlight = undefined;
        });

      return inFlight;
    },
  };
}
