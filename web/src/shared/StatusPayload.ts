import type { ServerState, ServerStatus } from "../domain/model/ServerStatus";

/** What /api/status sends. Shared by the Astro pages and the React islands. */
export interface StatusPayload {
  readonly state: ServerState;
  readonly players: readonly string[];
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly gameBuild: string | null;
  readonly address: string | null;
  readonly port: number;
  readonly observedAt: string;
  readonly problems: readonly string[];
}

/**
 * Last-resort payload when even building the status fails. The site keeps
 * serving pages and says what it cannot determine.
 */
export function degradedStatusPayload(reason: string): StatusPayload {
  return {
    state: "unknown",
    players: [],
    playerCount: 0,
    maxPlayers: 0,
    gameBuild: null,
    address: null,
    port: 0,
    observedAt: new Date().toISOString(),
    problems: [reason],
  };
}

export function toStatusPayload(status: ServerStatus): StatusPayload {
  return {
    state: status.state,
    players: status.players.map((player) => player.name),
    playerCount: status.players.length,
    maxPlayers: status.maxPlayers,
    gameBuild: status.gameBuild,
    address: status.address,
    port: status.port,
    observedAt: status.observedAt.toISOString(),
    problems: status.problems,
  };
}
