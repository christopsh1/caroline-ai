import app from "./index";

type Env = {
  MCP_GATEWAY_TOKEN?: string;
  [key: string]: unknown;
};

const DISCOVERY_METHODS = new Set([
  "server/discover",
  "tools/list",
  "initialize",
  "notifications/initialized",
]);

function withInternalGatewayAuth(request: Request, env: Env) {
  if (!env.MCP_GATEWAY_TOKEN) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.MCP_GATEWAY_TOKEN}`);
  return new Request(request, { headers });
}

function normalizeMcpPath(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== "/sse") return request;
  url.pathname = "/mcp";
  return new Request(url, request);
}

export default {
  async fetch(originalRequest: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const request = normalizeMcpPath(originalRequest);
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return app.fetch(request, env as never, ctx);
    }

    // Authenticated clients keep the original behavior for every MCP method.
    if (request.headers.get("authorization")) {
      return app.fetch(request, env as never, ctx);
    }

    // Discovery is intentionally public so MCP clients can scan the tool catalog
    // before credentials are configured. No tool execution is permitted here.
    if (request.method === "POST" && env.MCP_GATEWAY_TOKEN) {
      let method: string | undefined;
      try {
        const body = await request.clone().json() as { method?: unknown };
        method = typeof body?.method === "string" ? body.method : undefined;
      } catch {
        method = undefined;
      }

      if (method && DISCOVERY_METHODS.has(method)) {
        return app.fetch(withInternalGatewayAuth(request, env), env as never, ctx);
      }
    }

    // tools/call and every other non-discovery method remain protected by the
    // existing bearer-token gate in index.ts.
    return app.fetch(request, env as never, ctx);
  },
};
