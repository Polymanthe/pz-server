import type { LogExcerpt } from "../model/Log";
import type { ServerJournal } from "../ports/ServerJournal";

export const MAX_LOG_LINES = 2000;
export const DEFAULT_LOG_LINES = 400;

export class UnknownLogFileError extends Error {
  readonly requested: string;

  constructor(requested: string) {
    super(`Unknown log file: ${requested}`);
    this.name = "UnknownLogFileError";
    this.requested = requested;
  }
}

export interface ReadLogTailRequest {
  readonly file: string;
  readonly lines?: number;
}

/**
 * The requested name is matched against what the journal offers instead of
 * being turned into a path. A caller cannot reach a file the journal does not
 * already list, whatever it sends.
 */
export async function readLogTail(
  dependencies: { readonly journal: ServerJournal },
  request: ReadLogTailRequest,
): Promise<LogExcerpt> {
  const available = await dependencies.journal.available();
  const match = available.find((candidate) => candidate.name === request.file);
  if (!match) {
    throw new UnknownLogFileError(request.file);
  }

  const requested = request.lines ?? DEFAULT_LOG_LINES;
  const lines = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LOG_LINES)
    : DEFAULT_LOG_LINES;

  return {
    file: match.name,
    lines: await dependencies.journal.tail(match.name, lines),
  };
}
