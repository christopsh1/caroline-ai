const endpoint = process.env.CAROLINE_MCP_URL ?? "https://caroline-mcp.customerservice-882.workers.dev/mcp";
const token = process.env.MCP_GATEWAY_TOKEN?.trim();

if (!token) throw new Error("MCP_GATEWAY_TOKEN is required for live MCP verification");

const protocolVersion = "2026-07-28";
const meta = {
  "io.modelcontextprotocol/protocolVersion": protocolVersion,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "caroline-ci", version: "1.0.0" },
};

function decodePayload(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (!dataLines.length) throw new Error(`MCP returned SSE without data: ${text.slice(0, 1000)}`);
    for (const line of dataLines) {
      try {
        const value = JSON.parse(line);
        if (value?.result || value?.error) return value;
      } catch {}
    }
    return JSON.parse(dataLines.at(-1));
  }
  return JSON.parse(text);
}

async function mcpRequest(method, params = {}, bearer) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": protocolVersion,
    "Mcp-Method": method,
  };
  if (method === "tools/call" && typeof params?.name === "string") {
    headers["Mcp-Name"] = params.name;
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `caroline-ci-${method}-${crypto.randomUUID()}`,
      method,
      params: { ...params, _meta: meta },
    }),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = decodePayload(raw, response.headers.get("content-type") ?? "");
  } catch {
    payload = { raw };
  }
  return { response, raw, payload };
}

function assertToolCatalog(payload, label) {
  if (payload?.error) throw new Error(`${label} JSON-RPC error: ${JSON.stringify(payload.error)}`);
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) throw new Error(`${label} did not contain a tools array: ${JSON.stringify(payload).slice(0, 1000)}`);

  const names = new Set(tools.map((tool) => tool?.name).filter(Boolean));
  const required = [
    "cloudflare_workers_list",
    "cloudflare_worker_get_settings",
    "cloudflare_worker_read_code",
    "cloudflare_worker_deploy_code",
    "cloudflare_worker_deploy_modules",
    "cloudflare_worker_delete",
    "cloudflare_builds_list",
    "cloudflare_api_search",
    "cloudflare_api_execute",
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) {
    throw new Error(`${label} is missing Cloudflare tools: ${missing.join(", ")}. Exposed tools: ${[...names].sort().join(", ")}`);
  }
  return { tools, names };
}

const publicList = await mcpRequest("tools/list");
if (!publicList.response.ok) {
  throw new Error(`Unauthenticated tools/list failed: HTTP ${publicList.response.status}: ${publicList.raw.slice(0, 1000)}`);
}
const publicCatalog = assertToolCatalog(publicList.payload, "Unauthenticated tools/list");

const publicCall = await mcpRequest("tools/call", {
  name: "cloudflare_workers_list",
  arguments: {},
});
if (publicCall.response.status !== 401) {
  throw new Error(`Unauthenticated tools/call must return 401, got HTTP ${publicCall.response.status}: ${publicCall.raw.slice(0, 1000)}`);
}

const privateList = await mcpRequest("tools/list", {}, token);
if (!privateList.response.ok) {
  throw new Error(`Authenticated tools/list failed: HTTP ${privateList.response.status}: ${privateList.raw.slice(0, 1000)}`);
}
const privateCatalog = assertToolCatalog(privateList.payload, "Authenticated tools/list");

const readCall = await mcpRequest("tools/call", {
  name: "cloudflare_workers_list",
  arguments: {},
}, token);
if (!readCall.response.ok) {
  throw new Error(`Authenticated cloudflare_workers_list failed: HTTP ${readCall.response.status}: ${readCall.raw.slice(0, 1000)}`);
}
if (readCall.payload?.error) {
  throw new Error(`Authenticated cloudflare_workers_list JSON-RPC error: ${JSON.stringify(readCall.payload.error)}`);
}
const structured = readCall.payload?.result?.structuredContent;
if (structured && structured.ok === false) {
  throw new Error(`Cloudflare Worker list returned an application error: ${JSON.stringify(structured).slice(0, 1000)}`);
}

const cloudflareTools = [...publicCatalog.names].filter((name) => name.startsWith("cloudflare_")).sort();
if (privateCatalog.tools.length !== publicCatalog.tools.length) {
  throw new Error(`Authenticated/public tool count mismatch: public=${publicCatalog.tools.length}, authenticated=${privateCatalog.tools.length}`);
}

console.log(`Public MCP discovery verified: ${publicCatalog.tools.length} total tools; ${cloudflareTools.length} Cloudflare tools.`);
console.log("Unauthenticated tool execution correctly rejected with HTTP 401.");
console.log("Authenticated cloudflare_workers_list execution verified.");
console.log(`Cloudflare tools: ${cloudflareTools.join(", ")}`);
