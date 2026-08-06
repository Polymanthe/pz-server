import type { LogFile } from "../domain/model/Log";

export interface LogFilePayload {
  readonly name: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export function toLogFilePayload(file: LogFile): LogFilePayload {
  return {
    name: file.name,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt.toISOString(),
  };
}
