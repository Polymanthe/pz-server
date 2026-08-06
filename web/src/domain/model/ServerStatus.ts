import type { Player } from "./Player";

export type ServerState = "online" | "starting" | "offline" | "unknown";

export interface ServerIdentity {
  readonly address: string | null;
  readonly port: number;
  readonly maxPlayers: number;
}

export interface ServerStatus {
  readonly state: ServerState;
  /** Always empty unless the state is "online": nothing else can enumerate players. */
  readonly players: readonly Player[];
  readonly maxPlayers: number;
  readonly gameBuild: string | null;
  readonly address: string | null;
  readonly port: number;
  readonly observedAt: Date;
  /**
   * Deployment problems worth showing to the operator, such as a missing
   * environment variable. Empty on a healthy deployment.
   */
  readonly problems: readonly string[];
}
