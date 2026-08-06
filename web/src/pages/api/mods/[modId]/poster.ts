import type { APIRoute } from "astro";

import { container } from "../../../../composition";

export const prerender = false;

// The mod id is only ever looked up in the catalog built from the server
// configuration; it never becomes part of a filesystem path here.
export const GET: APIRoute = async ({ params, request }) => {
  const modId = params.modId;
  if (!modId) {
    return new Response("Not found", { status: 404 });
  }

  let poster;
  try {
    poster = await container().findModPoster(modId);
  } catch (error) {
    console.error(`Failed to read the poster of ${modId}`, error);
    return new Response("Poster unavailable", { status: 502 });
  }

  if (!poster) {
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${poster.fingerprint}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(poster.bytes, {
    headers: {
      "content-type": poster.contentType,
      "cache-control": "public, max-age=3600",
      etag,
    },
  });
};
