import type { ModId } from "../model/Mod";

export interface ModPosterImage {
  /** Backed by its own ArrayBuffer, so it can be handed to a Response as is. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  /** Stable while the file does not change, suitable for an ETag. */
  readonly fingerprint: string;
}

export interface ModPosterStore {
  find(modId: ModId): Promise<ModPosterImage | null>;
}
