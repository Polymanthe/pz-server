export type WorkshopItemId = string;
export type ModId = string;

/**
 * Where the illustration of a mod comes from. The domain records the fact, not
 * a URL: turning "local" into a route belongs to the delivery layer.
 */
export type ModPoster =
  | { readonly source: "local" }
  | { readonly source: "remote"; readonly url: string };

export interface Mod {
  readonly id: ModId;
  readonly workshopItemId: WorkshopItemId;
  readonly name: string;
  readonly author: string | null;
  readonly description: string | null;
  readonly category: string | null;
  readonly poster: ModPoster | null;
}

const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=";

export function workshopUrl(itemId: WorkshopItemId): string {
  return `${WORKSHOP_URL}${itemId}`;
}
