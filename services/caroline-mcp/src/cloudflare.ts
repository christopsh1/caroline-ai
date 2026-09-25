export type CloudflareEnv = {
  CLOUDFLARE_CONTROL_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_API_KEY?: string;
  CLOUDFLARE_API_EMAIL?: string;
  CLOUDFLARE_EMAIL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_MCP_URL?: string;
};

export type WorkerModule = {
  name: string;
  content: string;
  type?: "esm" | "commonjs" | "text" | "json" | "wasm" | "data";
};

export function cloudflareAuthHeaders(env: CloudflareEnv, preferredToken?: string) {
  const token = preferredToken ?? env.CLOUDFLARE_CONTROL_TOKEN ?? env.CLOUDFLARE_API_TOKEN;
  if (token) {
    return new Headers({ Authorization: `Bearer ${token}` });
  }

  const email = env.CLOUDFLARE_API_EMAIL ?? env.CLOUDFLARE_EMAIL;
  if (env.CLOUDFLARE_API_KEY && email) {
    return new Headers({
      "X-Auth-Email": email,
      "X-Auth-Key": env.CLOUDFLARE_API_KEY,
    });
  }

  throw new Error("Cloudflare credentials are not configured");
}

function requireCloudflare(env: CloudflareEnv) {
  cloudflareAuthHeaders(env);
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }
  return { accountId: env.CLOUDFLARE_ACCOUNT_ID };
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let body: unknown = text;

  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    content_type: contentType,
    body,
  };
}

async function cloudflareApi(
  env: CloudflareEnv,
  path: string,
  init: RequestInit = {},
) {
  requireCloudflare(env);
  const headers = new Headers(init.headers);
  const auth = cloudflareAuthHeaders(env);
  auth.forEach((value, key) => headers.set(key, value));
  headers.set("Accept", headers.get("Accept") ?? "application/json");

  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers,
  });

  return parseResponse(response);
}

export async function listWorkers(env: CloudflareEnv) {
  const { accountId } = requireCloudflare(env);
  return cloudflareApi(env, `/accounts/${encodeURIComponent(accountId)}/workers/scripts`);
}

export async function getWorkerSettings(env: CloudflareEnv, scriptName: string) {
  const { accountId } = requireCloudflare(env);
  return cloudflareApi(
    env,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/settings`,
  );
}

export async function readWorkerCode(env: CloudflareEnv, scriptName: string) {
  const { accountId } = requireCloudflare(env);
  const headers = cloudflareAuthHeaders(env);
  headers.set("Accept", "*/*");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/content`,
    { method: "GET", headers },
  );

  const contentType = response.headers.get("content-type") ?? "";
  const source = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    content_type: contentType,
    source,
  };
}

function moduleContentType(type: WorkerModule["type"] = "esm") {
  switch (type) {
    case "commonjs":
      return "application/javascript";
    case "text":
      return "text/plain";
    case "json":
      return "application/json";
    case "wasm":
      return "application/wasm";
    case "data":
      return "application/octet-stream";
    case "esm":
    default:
      return "application/javascript+module";
  }
}

export async function deployWorkerModules(
  env: CloudflareEnv,
  input: {
    scriptName: string;
    modules: WorkerModule[];
    mainModule?: string;
    compatibilityDate?: string;
    compatibilityFlags?: string[];
    bindings?: unknown[];
  },
) {
  const { accountId } = requireCloudflare(env);
  if (!input.modules.length) {
    throw new Error("At least one Worker module is required");
  }

  const names = new Set(input.modules.map((module) => module.name));
  const mainModule = input.mainModule ?? input.modules[0]?.name ?? "index.js";
  if (!names.has(mainModule)) {
    throw new Error(`main_module ${mainModule} is not present in modules`);
  }

  const metadata: Record<string, unknown> = {
    main_module: mainModule,
    compatibility_date: input.compatibilityDate ?? new Date().toISOString().slice(0, 10),
  };

  if (input.compatibilityFlags?.length) {
    metadata.compatibility_flags = input.compatibilityFlags;
  }
  if (input.bindings?.length) {
    metadata.bindings = input.bindings;
  }

  const form = new FormData();
  form.set(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );

  for (const module of input.modules) {
    form.set(
      module.name,
      new Blob([module.content], { type: moduleContentType(module.type) }),
      module.name,
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(input.scriptName)}`,
    {
      method: "PUT",
      headers: cloudflareAuthHeaders(env),
      body: form,
    },
  );

  return parseResponse(response);
}

export async function deployWorkerCode(
  env: CloudflareEnv,
  input: {
    scriptName: string;
    source: string;
    mainModule?: string;
    compatibilityDate?: string;
    compatibilityFlags?: string[];
    bindings?: unknown[];
  },
) {
  const mainModule = input.mainModule ?? "index.js";
  return deployWorkerModules(env, {
    scriptName: input.scriptName,
    modules: [{ name: mainModule, content: input.source, type: "esm" }],
    mainModule,
    compatibilityDate: input.compatibilityDate,
    compatibilityFlags: input.compatibilityFlags,
    bindings: input.bindings,
  });
}

export async function deleteWorker(env: CloudflareEnv, scriptName: string) {
  const { accountId } = requireCloudflare(env);
  return cloudflareApi(
    env,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}`,
    { method: "DELETE" },
  );
}

function parseMcpResponse(contentType: string, raw: string) {
  if (contentType.includes("application/json")) {
    return JSON.parse(raw);
  }

  const events = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (let i = events.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(events[i]);
    } catch {
      // Keep looking for the final JSON event.
    }
  }

  return { raw };
}

async function callCloudflareMcp(
  env: CloudflareEnv,
  toolName: "search" | "execute",
  code: string,
) {
  const token = env.CLOUDFLARE_CONTROL_TOKEN ?? env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error("Cloudflare API MCP requires a bearer API token; legacy Global API Key auth is still supported for direct Worker and Builds tools");
  }
  const endpoint = env.CLOUDFLARE_MCP_URL ?? "https://mcp.cloudflare.com/mcp";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: { code },
      },
    }),
  });

  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = parseMcpResponse(contentType, raw);
  } catch {
    body = { raw };
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function searchCloudflareApiMcp(env: CloudflareEnv, code: string) {
  return callCloudflareMcp(env, "search", code);
}

export async function executeCloudflareApiMcp(env: CloudflareEnv, code: string) {
  return callCloudflareMcp(env, "execute", code);
}
