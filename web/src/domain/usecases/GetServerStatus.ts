import type { ServerIdentity, ServerStatus } from "../model/ServerStatus";
import type { Clock } from "../ports/Clock";
import type { ServerJournal } from "../ports/ServerJournal";
import type { ServerProbe } from "../ports/ServerProbe";

/**
 * How long after its last log write a silent server is still considered to be
 * booting. Project Zomboid takes well over a minute to load a modded world
 * before RCON accepts connections, and it writes to its log throughout.
 */
export const STARTING_WINDOW_MS = 120_000;

export interface GetServerStatusDependencies {
  readonly probe: ServerProbe;
  readonly journal: ServerJournal;
  readonly clock: Clock;
  readonly identity: ServerIdentity;
  readonly startingWindowMs?: number;
  /** Deployment problems detected before the request, such as missing variables. */
  readonly problems?: readonly string[];
}

/**
 * Distinguishing "offline" from "starting" without the Docker socket:
 *
 *   probe answers                         -> online
 *   nothing listening, journal just wrote -> starting
 *   nothing listening, journal stale      -> offline
 *   probe cannot run at all               -> unknown
 *
 * This rule lives here rather than in the probe so that a future probe backed
 * by the Docker API replaces only the ServerProbe implementation.
 */
export async function getServerStatus(
  dependencies: GetServerStatusDependencies,
): Promise<ServerStatus> {
  const { probe, journal, clock, identity } = dependencies;
  const startingWindowMs = dependencies.startingWindowMs ?? STARTING_WINDOW_MS;
  const observedAt = clock.now();

  const [outcome, gameBuild] = await Promise.all([probe.probe(), journal.currentBuild()]);

  const problems = [...(dependencies.problems ?? [])];
  const common = {
    maxPlayers: identity.maxPlayers,
    gameBuild,
    address: identity.address,
    port: identity.port,
    observedAt,
  };

  if (outcome.kind === "players") {
    return { state: "online", players: outcome.players, ...common, problems };
  }

  if (outcome.kind === "unavailable") {
    if (!problems.includes(outcome.reason)) {
      problems.push(outcome.reason);
    }
    return { state: "unknown", players: [], ...common, problems };
  }

  const lastActivityAt = await journal.lastActivityAt();
  const silentFor =
    lastActivityAt === null
      ? Number.POSITIVE_INFINITY
      : observedAt.getTime() - lastActivityAt.getTime();

  return {
    state: silentFor < startingWindowMs ? "starting" : "offline",
    players: [],
    ...common,
    problems,
  };
}
