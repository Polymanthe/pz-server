import type { Player } from "../model/Player";

/**
 * Three distinct outcomes, because collapsing them loses information the page
 * needs to tell the truth:
 *
 *  - `players`     the game server answered
 *  - `unreachable` nothing is listening, which is normal when it is down
 *  - `unavailable` the probe itself cannot do its job: missing configuration,
 *                  rejected credentials, unusable response
 *
 * Reporting `unavailable` as `unreachable` would show "hors ligne" for a server
 * that is in fact running perfectly well behind a typo in the configuration.
 */
export type ProbeOutcome =
  | { readonly kind: "players"; readonly players: readonly Player[] }
  | { readonly kind: "unreachable" }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface ServerProbe {
  probe(): Promise<ProbeOutcome>;
}
