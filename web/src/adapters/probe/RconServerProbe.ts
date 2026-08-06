import { Rcon } from "rcon-client";

import type { Player } from "../../domain/model/Player";
import type { ProbeOutcome, ServerProbe } from "../../domain/ports/ServerProbe";

export interface RconSettings {
  readonly host: string;
  readonly port: number;
  readonly password: string;
  readonly timeoutMs: number;
}

const PLAYERS_HEADER = /^Players connected \((\d+)\):/;

/**
 * Project Zomboid answers `players` with a header line followed by one
 * hyphen-prefixed name per player:
 *
 *   Players connected (2):
 *   -globule
 *   -someone
 *
 * An empty server answers with the header alone.
 */
export function parsePlayers(response: string): Player[] {
  const lines = response.split(/\r?\n/);
  const header = lines.shift() ?? "";

  if (!PLAYERS_HEADER.test(header.trim())) {
    throw new Error(`Unexpected response to the players command: ${response.slice(0, 120)}`);
  }

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ name: line.replace(/^-\s*/, "") }))
    .filter((player) => player.name.length > 0);
}

const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ETIMEDOUT",
]);

/**
 * Tells "the game server is not listening" apart from "this adapter cannot do
 * its job". Only the former means the server is down; a rejected password must
 * be reported as a deployment problem, not as an offline server.
 */
export function isUnreachable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && UNREACHABLE_CODES.has(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("timeout") || message.includes("socket closed");
}

export function createRconServerProbe(settings: RconSettings): ServerProbe {
  return {
    async probe(): Promise<ProbeOutcome> {
      let connection: Rcon | undefined;
      try {
        connection = await Rcon.connect({
          host: settings.host,
          port: settings.port,
          password: settings.password,
          timeout: settings.timeoutMs,
        });
        return { kind: "players", players: parsePlayers(await connection.send("players")) };
      } catch (error) {
        if (isUnreachable(error)) {
          return { kind: "unreachable" };
        }
        return {
          kind: "unavailable",
          reason:
            error instanceof Error
              ? `La sonde RCON a échoué : ${error.message}`
              : "La sonde RCON a échoué pour une raison inconnue.",
        };
      } finally {
        await connection?.end().catch(() => undefined);
      }
    },
  };
}

/** Stands in for the RCON probe when the deployment did not configure it. */
export function createUnavailableProbe(reason: string): ServerProbe {
  return {
    probe: async () => ({ kind: "unavailable", reason }),
  };
}
