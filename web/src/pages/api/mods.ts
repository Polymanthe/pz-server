import type { APIRoute } from "astro";

import { container } from "../../composition";
import { toModPayload } from "../../shared/ModPayload";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const mods = await container().listActiveMods();
    return Response.json(
      { mods: mods.map(toModPayload) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Public response: the detail stays in the container logs.
    console.error("Failed to list the active mods", error);
    return Response.json(
      {
        mods: [],
        problem:
          "La liste des mods n'a pas pu être lue. Le détail figure dans les logs du service.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
};
