import type { APIRoute } from "astro";

import { container } from "../../composition";
import { UnknownLogFileError } from "../../domain/usecases/ReadLogTail";
import { toLogFilePayload } from "../../shared/LogPayload";

export const prerender = false;

// Caddy requires basic authentication on this path. The service is never
// exposed directly, so there is no second check here.
export const GET: APIRoute = async ({ url }) => {
  const application = container();
  const file = url.searchParams.get("file");

  try {
    if (file === null) {
      const files = await application.listLogFiles();
      return Response.json(
        { files: files.map(toLogFilePayload) },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const requested = url.searchParams.get("lines");
    const excerpt = await application.readLogTail({
      file,
      lines: requested === null ? undefined : Number(requested),
    });

    return Response.json(excerpt, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UnknownLogFileError) {
      return Response.json({ problem: "Ce fichier de journal n'existe pas." }, { status: 404 });
    }

    console.error("Failed to read the server logs", error);
    return Response.json(
      {
        problem: `Les journaux n'ont pas pu être lus : ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 502 },
    );
  }
};
