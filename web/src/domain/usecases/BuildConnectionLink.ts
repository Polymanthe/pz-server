import type { ConnectionTarget } from "../model/ConnectionTarget";

export const PROJECT_ZOMBOID_APP_ID = "108600";

export class InvalidConnectionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionTargetError";
  }
}

/**
 * Produces the same URL as scripts/connection_link.py. It carries no password:
 * the server has none, and the account password a player is asked for on first
 * join is chosen by the player, not by the server.
 */
export function buildConnectionLink(target: ConnectionTarget): string {
  const host = target.host.trim();

  if (!host) {
    throw new InvalidConnectionTargetError("The server address is empty.");
  }
  if (host.includes("://") || host.includes("/") || /\s/.test(host)) {
    throw new InvalidConnectionTargetError(
      "The server address must be a bare DNS name or IP, without a scheme or path.",
    );
  }
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    throw new InvalidConnectionTargetError("The server port must be between 1 and 65535.");
  }

  const argumentsForClient = target.useSteam
    ? `+connect ${host}:${target.port}`
    : `-nosteam +connect ${host}:${target.port}`;

  return `steam://run/${PROJECT_ZOMBOID_APP_ID}//${encodeURIComponent(argumentsForClient)}/`;
}
