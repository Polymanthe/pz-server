import type { APIRoute } from "astro";

import { container } from "../../composition";
import { degradedStatusPayload, toStatusPayload } from "../../shared/StatusPayload";

export const prerender = false;

export const GET: APIRoute = async () => {
  let payload;
  try {
    payload = toStatusPayload(await container().getServerStatus());
  } catch (error) {
    // The site stays up whatever happens here: an operator fixing a broken
    // deployment needs a readable page, not a stack trace. The detail stays in
    // the container logs because this response is public.
    console.error("Failed to build the server status", error);
    payload = degradedStatusPayload(
      "L'état du serveur n'a pas pu être déterminé. Le détail figure dans les logs du service.",
    );
  }

  return Response.json(payload, { headers: { "cache-control": "no-store" } });
};
