import type { APIRoute } from "astro";

export const prerender = false;

// Used by the container healthcheck. It must not touch the game server:
// the web service stays healthy even while Project Zomboid is down.
export const GET: APIRoute = () =>
  Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
