const names = [
  "MCP_GATEWAY_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_CONTROL_TOKEN",
  "CLOUDFLARE_BUILDS_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_EMAIL",
];

const out = {};
for (const name of names) {
  const value = process.env[name];
  if (typeof value === "string" && value.length > 0) out[name] = value;
}

if (!out.MCP_GATEWAY_TOKEN) throw new Error("MCP_GATEWAY_TOKEN is missing");
if (!out.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_ACCOUNT_ID is missing");
if (!out.CLOUDFLARE_CONTROL_TOKEN && !(out.CLOUDFLARE_API_KEY && out.CLOUDFLARE_API_EMAIL)) {
  throw new Error("No Cloudflare runtime control credential is available");
}

process.stdout.write(JSON.stringify(out));
