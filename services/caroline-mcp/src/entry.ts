import app from "./index";

type Env = {
  GATEWAY_TOKEN?: string;
  GATEWAY_URL?: string;
  WORKER_NAME?: string;
  ENVIRONMENT?: string;
  CLOUDFLARE_MCP_URL?: string;
  [key: string]: unknown;
};

type RuntimeSecrets = {
  MCP_GATEWAY_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_CONTROL_TOKEN?: string;
  CLOUDFLARE_BUILDS_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_API_KEY?: string;
  CLOUDFLARE_API_EMAIL?: string;
  CLOUDFLARE_EMAIL?: string;
};

type GatewayResponse = {
  ok?: unknown;
  error?: unknown;
  secrets?: unknown;
};

const SECRETS_CACHE_TTL_MS = 5 * 60 * 1000;
let _secrets: RuntimeSecrets | null = null;
let _secretsExpiresAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function getSecrets(env: Env): Promise<RuntimeSecrets> {
  const now = Date.now();
  if (_secrets && now < _secretsExpiresAt) return _secrets;
  if (!env.GATEWAY_URL || !env.GATEWAY_TOKEN || !env.WORKER_NAME) {
    throw new Error("secrets_gateway_not_configured");
  }

  const resp = await fetch(
    `${env.GATEWAY_URL.replace(/\/+$/, "")}/secrets?worker=${encodeURIComponent(env.WORKER_NAME)}`,
    { headers: { Authorization: `Bearer ${env.GATEWAY_TOKEN}` } },
  );
  if (!resp.ok) throw new Error(`Secrets gateway error: ${resp.status}`);

  const data = (await resp.json()) as GatewayResponse;
  if (data.ok !== true) {
    throw new Error(`Secrets gateway: ${typeof data.error === "string" ? data.error : "unknown_error"}`);
  }
  if (!isRecord(data.secrets)) throw new Error("secrets_gateway_invalid_payload");

  const secretKeys = [
    "MCP_GATEWAY_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_CONTROL_TOKEN",
    "CLOUDFLARE_BUILDS_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_API_EMAIL",
    "CLOUDFLARE_EMAIL",
  ] as const;

  const resolved: RuntimeSecrets = {};
  for (const key of secretKeys) {
    const value = data.secrets[key];
    if (typeof value === "string" && value.length > 0) resolved[key] = value;
  }

  _secrets = resolved;
  _secretsExpiresAt = now + SECRETS_CACHE_TTL_MS;
  return resolved;
}

function hydrateEnv(env: Env, secrets: RuntimeSecrets) {
  return {
    ...env,
    MCP_GATEWAY_TOKEN: secrets.MCP_GATEWAY_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: secrets.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_CONTROL_TOKEN: secrets.CLOUDFLARE_CONTROL_TOKEN,
    CLOUDFLARE_BUILDS_TOKEN: secrets.CLOUDFLARE_BUILDS_TOKEN,
    CLOUDFLARE_API_TOKEN: secrets.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_API_KEY: secrets.CLOUDFLARE_API_KEY,
    CLOUDFLARE_API_EMAIL: secrets.CLOUDFLARE_API_EMAIL,
    CLOUDFLARE_EMAIL: secrets.CLOUDFLARE_EMAIL,
  };
}

const DISCOVERY_METHODS = new Set([
  "server/discover",
  "tools/list",
  "initialize",
  "notifications/initialized",
]);

function withInternalGatewayAuth(request: Request, runtimeEnv: ReturnType<typeof hydrateEnv>) {
  if (!runtimeEnv.MCP_GATEWAY_TOKEN) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${runtimeEnv.MCP_GATEWAY_TOKEN}`);
  return new Request(request, { headers });
}

function normalizeMcpPath(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== "/sse") return request;
  url.pathname = "/mcp";
  return new Request(url, request);
}

function gatewayUnavailable() {
  return Response.json({ ok: false, error: "secrets_unavailable" }, { status: 503 });
}

export default {
  async fetch(originalRequest: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let runtimeEnv: ReturnType<typeof hydrateEnv>;
    try {
      runtimeEnv = hydrateEnv(env, await getSecrets(env));
    } catch {
      return gatewayUnavailable();
    }

    const request = normalizeMcpPath(originalRequest);
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return app.fetch(request, runtimeEnv as never, ctx);
    }

    // Authenticated clients keep the original behavior for every MCP method.
    if (request.headers.get("authorization")) {
      return app.fetch(request, runtimeEnv as never, ctx);
    }

    // Discovery is intentionally public so MCP clients can scan the tool catalog
    // before credentials are configured. No tool execution is permitted here.
    if (request.method === "POST" && runtimeEnv.MCP_GATEWAY_TOKEN) {
      let method: string | undefined;
      try {
        const body = await request.clone().json() as { method?: unknown };
        method = typeof body?.method === "string" ? body.method : undefined;
      } catch {
        method = undefined;
      }

      if (method && DISCOVERY_METHODS.has(method)) {
        return app.fetch(withInternalGatewayAuth(request, runtimeEnv), runtimeEnv as never, ctx);
      }
    }

    // tools/call and every other non-discovery method remain protected by the
    // existing bearer-token gate in index.ts.
    return app.fetch(request, runtimeEnv as never, ctx);
  },
};
