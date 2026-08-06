const ENDPOINT = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const BATCH_SIZE = 100;
const MAX_DESCRIPTION = 320;

export interface WorkshopDetails {
  readonly title: string | null;
  readonly description: string | null;
  readonly previewUrl: string | null;
}

export interface WorkshopDetailsSource {
  fetchDetails(itemIds: readonly string[]): Promise<ReadonlyMap<string, WorkshopDetails>>;
}

// Blocks whose content is an address rather than prose. Stripping only the
// tags would leave a bare URL sitting in the middle of the description.
const MEDIA_BLOCK = /\[(img|previewimg|video)[^\]]*\][\s\S]*?\[\/\1\]/gi;
const BBCODE = /\[\/?[a-z0-9=*\s.:/?&#-]*\]/gi;
const BARE_URL = /https?:\/\/\S+/gi;

/** Workshop descriptions are BBCode and can run for pages. Cards need a sentence. */
export function plainDescription(raw: string): string | null {
  const text = raw
    .replace(MEDIA_BLOCK, " ")
    .replace(BBCODE, " ")
    .replace(BARE_URL, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text === "") {
    return null;
  }
  if (text.length <= MAX_DESCRIPTION) {
    return text;
  }

  const cut = text.slice(0, MAX_DESCRIPTION);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_DESCRIPTION / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

interface SteamItem {
  publishedfileid?: unknown;
  title?: unknown;
  description?: unknown;
  preview_url?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function parseWorkshopResponse(body: unknown): Map<string, WorkshopDetails> {
  const details = new Map<string, WorkshopDetails>();
  const items = (body as { response?: { publishedfiledetails?: unknown } } | null)?.response
    ?.publishedfiledetails;

  if (!Array.isArray(items)) {
    return details;
  }

  for (const raw of items as SteamItem[]) {
    const id = text(raw.publishedfileid);
    if (!id) {
      continue;
    }
    const description = text(raw.description);
    details.set(id, {
      title: text(raw.title),
      description: description === null ? null : plainDescription(description),
      previewUrl: text(raw.preview_url),
    });
  }

  return details;
}

/** Only the shape this adapter actually uses, so tests can supply a plain function. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SteamSourceSettings {
  readonly timeoutMs: number;
  readonly fetchImpl?: FetchLike;
}

export function createSteamWorkshopSource(settings: SteamSourceSettings): WorkshopDetailsSource {
  const call: FetchLike = settings.fetchImpl ?? fetch;

  return {
    async fetchDetails(itemIds) {
      const details = new Map<string, WorkshopDetails>();

      for (let start = 0; start < itemIds.length; start += BATCH_SIZE) {
        const batch = itemIds.slice(start, start + BATCH_SIZE);
        const body = new URLSearchParams({ itemcount: String(batch.length) });
        batch.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

        const response = await call(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(settings.timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`Steam a répondu ${response.status}`);
        }

        for (const [id, entry] of parseWorkshopResponse(await response.json())) {
          details.set(id, entry);
        }
      }

      return details;
    },
  };
}
