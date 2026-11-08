import { onRequestGet as getAccas } from "../functions/api/accas";
import { onRequestGet as getHealth } from "../functions/api/health";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/accas") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      }
      return getAccas({ request, env });
    }

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      }
      return getHealth({ request, env });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
