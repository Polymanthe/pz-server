import type { Mod } from "../model/Mod";

export interface ModCatalog {
  /** Mods the server actually loads, in the order it declares them. */
  activeMods(): Promise<readonly Mod[]>;
}
