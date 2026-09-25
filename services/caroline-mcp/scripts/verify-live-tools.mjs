const endpoint = process.env.CAROLINE_MCP_URL ?? "https://caroline-mcp.customerservice-882.workers.dev/mcp";
const token = process.env.MCP_GATEWAY_TOKEN?.trim();

if (!token) throw new Error("MCP_GATEWAY_TOKEN is required for live MCP discovery verification");

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "caroline-ci", version: "1.0.0" },
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "tools/list",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "caroline-ci-tools-list",
    method: "tools/list",
    params: { _meta: meta },
  }),
});

const raw = await response.text();
if (!response.ok) {
  throw new Error(`MCP tools/list failed: HTTP ${response.status}: ${raw.slice(0, 1000)}`);
}

function decodePayload(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (!dataLines.length) throw new Error(`MCP tools/list returned SSE without data: ${text.slice(0, 1000)}`);
    for (const line of dataLines) {
      try {
        const value = JSON.parse(line);
        if (value?.result?.tools) return value;
      } catch {}
    }
    return JSON.parse(dataLines.at(-1));
  }
  return JSON.parse(text);
}

const payload = decodePayload(raw, response.headers.get("content-type") ?? "");
if (payload?.error) throw new Error(`MCP tools/list JSON-RPC error: ${JSON.stringify(payload.error)}`);

const tools = payload?.result?.tools;
if (!Array.isArray(tools)) {
  throw new Error(`MCP tools/list response did not contain a tools array: ${raw.slice(0, 1000)}`);
}

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
  throw new Error(`Live MCP is missing Cloudflare tools: ${missing.join(", ")}. Exposed tools: ${[...names].sort().join(", ")}`);
}

const cloudflareTools = [...names].filter((name) => name.startsWith("cloudflare_")).sort();
console.log(`Live MCP tool discovery verified: ${tools.length} total tools; ${cloudflareTools.length} Cloudflare tools.`);
console.log(`Cloudflare tools: ${cloudflareTools.join(", ")}`);
