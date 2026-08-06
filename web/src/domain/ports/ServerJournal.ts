import type { LogFile } from "../model/Log";

/**
 * Everything derived from the log files Project Zomboid writes next to the
 * world data.
 *
 * Contract: an absent or empty log directory is a legitimate state (a freshly
 * created volume) and yields null or an empty list. Implementations throw only
 * on genuine I/O failures.
 */
export interface ServerJournal {
  /** Log files an operator is allowed to read, most recent first. */
  available(): Promise<readonly LogFile[]>;

  /** Last `lines` lines of `fileName`. The caller has already validated the name. */
  tail(fileName: string, lines: number): Promise<readonly string[]>;

  /** When the server last wrote anything, or null when it never has. */
  lastActivityAt(): Promise<Date | null>;

  /** Game build the server last logged, for example "42.20.2 ffe7a8a4b1". */
  currentBuild(): Promise<string | null>;
}
