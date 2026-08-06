export interface LogFile {
  readonly name: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

export interface LogExcerpt {
  readonly file: string;
  readonly lines: readonly string[];
}
