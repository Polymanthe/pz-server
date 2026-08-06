export interface ConnectionTarget {
  readonly host: string;
  readonly port: number;
  /**
   * Mirrors USE_STEAM. A non-Steam server needs -nosteam on the client command
   * line, otherwise the client refuses the connection.
   */
  readonly useSteam: boolean;
}
