import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = process.env;
const checkOnly = process.argv.includes("--check");
const CF_API = "https://api.cloudflare.com/client/v4";
const INFISICAL = "https://app.infisical.com";

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function first(names) {
  for (const name of names) {
    const value = nonempty(env[name]);
    if (value) return { name, value };
  }
  return undefined;
}

function matching(re) {
  return Object.keys(env)
    .filter((name) => re.test(name))
    .map((name) => ({ name, value: nonempty(env[name]) }))
    .filter((entry) => entry.value);
}

function mask(value) {
  if (value) process.stdout.write(`::add-mask::${value}\n`);
}

function exportEnv(name, value) {
  if (!value) return;
  mask(value);
  if (!env.GITHUB_ENV) throw new Error("GITHUB_ENV is unavailable");
  const marker = `CAROLINE_${randomBytes(8).toString("hex")}`;
  appendFileSync(env.GITHUB_ENV, `${name}<<${marker}\n${value}\n${marker}\n`);
  env[name] = value;
}

async function cfFetch(path, auth, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  if (auth.kind === "bearer") {
    headers.set("Authorization", `Bearer ${auth.token}`);
  } else {
    headers.set("X-Auth-Email", auth.email);
    headers.set("X-Auth-Key", auth.key);
  }
  return fetch(`${CF_API}${path}`, { ...init, headers });
}

async function validBearer(token) {
  try {
    const response = await fetch(`${CF_API}/user/tokens/verify`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => ({}));
    return body?.success === true && body?.result?.status !== "disabled";
  } catch {
    return false;
  }
}

async function chooseCloudflareAuth() {
  const candidates = [];
  const exact = first([
    "CLOUDFLARE_CONTROL_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_BUILDS_TOKEN",
  ]);
  if (exact) candidates.push(exact);

  for (const entry of matching(/^CLOUDFLARE.*(?:TOKEN|SECRET)$/i)) {
    if (!candidates.some((candidate) => candidate.value === entry.value)) candidates.push(entry);
  }

  const fallbackToken = nonempty(env.GITHUB_FALLBACK_CF_TOKEN);
  if (fallbackToken && !candidates.some((candidate) => candidate.value === fallbackToken)) {
    candidates.push({ name: "GITHUB_FALLBACK_CF_TOKEN", value: fallbackToken });
  }

  for (const candidate of candidates) {
    if (await validBearer(candidate.value)) {
      return { kind: "bearer", token: candidate.value, source: candidate.name };
    }
  }

  const key = first(["CLOUDFLARE_API_KEY"]) ?? matching(/^CLOUDFLARE.*API.*KEY$/i)[0];
  const email = first(["CLOUDFLARE_API_EMAIL", "CLOUDFLARE_EMAIL"]) ?? matching(/^CLOUDFLARE.*EMAIL$/i)[0];
  if (key?.value && email?.value) {
    const auth = { kind: "global-key", key: key.value, email: email.value, source: `${key.name}+${email.name}` };
    const response = await cfFetch("/user", auth);
    if (response.ok) return auth;
  }

  throw new Error("No usable Cloudflare Workers credential was found in Infisical or the existing GitHub fallback credential");
}

async function resolveAccountId(auth) {
  const configured = nonempty(env.CLOUDFLARE_ACCOUNT_ID) ?? nonempty(env.GITHUB_FALLBACK_CF_ACCOUNT);
  if (configured) {
    const probe = await cfFetch(`/accounts/${encodeURIComponent(configured)}/workers/scripts/caroline-mcp/settings`, auth);
    if (probe.ok || probe.status === 404) return configured;
  }

  const response = await cfFetch("/accounts?per_page=50", auth);
  if (!response.ok) throw new Error(`Cloudflare account discovery failed with HTTP ${response.status}`);
  const body = await response.json();
  const accounts = Array.isArray(body?.result) ? body.result : [];
  if (!accounts.length) throw new Error("Cloudflare credential can authenticate but has no visible accounts");

  for (const account of accounts) {
    const id = nonempty(account?.id);
    if (!id) continue;
    const probe = await cfFetch(`/accounts/${encodeURIComponent(id)}/workers/scripts/caroline-mcp/settings`, auth);
    if (probe.ok) return id;
  }

  if (accounts.length === 1 && nonempty(accounts[0]?.id)) return accounts[0].id;
  throw new Error("Multiple Cloudflare accounts are visible and none contains the existing caroline-mcp Worker");
}

async function infisicalAccessToken() {
  const requestUrl = nonempty(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  const requestToken = nonempty(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
  const identityId = nonempty(env.INFISICAL_IDENTITY_ID);
  if (!requestUrl || !requestToken || !identityId) throw new Error("GitHub OIDC context for Infisical is unavailable");

  const oidcResponse = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" },
  });
  if (!oidcResponse.ok) throw new Error(`GitHub OIDC token request failed with HTTP ${oidcResponse.status}`);
  const oidcBody = await oidcResponse.json();
  const jwt = nonempty(oidcBody?.value);
  if (!jwt) throw new Error("GitHub OIDC response did not contain a token");

  const login = new URLSearchParams({ identityId, jwt });
  const infResponse = await fetch(`${INFISICAL}/api/v1/auth/oidc-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: login,
  });
  if (!infResponse.ok) throw new Error(`Infisical OIDC login failed with HTTP ${infResponse.status}`);
  const infBody = await infResponse.json();
  const token = nonempty(infBody?.accessToken);
  if (!token) throw new Error("Infisical OIDC login returned no access token");
  mask(token);
  return token;
}

async function persistGatewayToken(value) {
  const projectId = nonempty(env.INFISICAL_PROJECT_ID);
  const environment = nonempty(env.INFISICAL_ENV_SLUG) ?? "dev";
  const secretPath = nonempty(env.INFISICAL_SECRET_PATH) ?? "/";
  if (!projectId) throw new Error("INFISICAL_PROJECT_ID is unavailable for MCP token persistence");

  const accessToken = await infisicalAccessToken();
  const response = await fetch(`${INFISICAL}/api/v3/secrets/raw/MCP_GATEWAY_TOKEN`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      workspaceId: projectId,
      environment,
      type: "shared",
      secretPath,
      secretKey: "MCP_GATEWAY_TOKEN",
      secretValue: value,
      secretComment: "Generated automatically for the Caroline MCP gateway",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Could not persist MCP_GATEWAY_TOKEN to Infisical (HTTP ${response.status}): ${body.slice(0, 240)}`);
  }
}

const auth = await chooseCloudflareAuth();
const accountId = await resolveAccountId(auth);
console.log(`Cloudflare authentication verified (${auth.kind}; source=${auth.source}).`);
console.log("Cloudflare account resolved for caroline-mcp.");

if (checkOnly) process.exit(0);

exportEnv("CLOUDFLARE_ACCOUNT_ID", accountId);

if (auth.kind === "bearer") {
  exportEnv("CLOUDFLARE_API_TOKEN", auth.token);
  exportEnv("CLOUDFLARE_CONTROL_TOKEN", nonempty(env.CLOUDFLARE_CONTROL_TOKEN) ?? auth.token);
  exportEnv("CLOUDFLARE_BUILDS_TOKEN", nonempty(env.CLOUDFLARE_BUILDS_TOKEN) ?? nonempty(env.CLOUDFLARE_CONTROL_TOKEN) ?? auth.token);
} else {
  exportEnv("CLOUDFLARE_API_KEY", auth.key);
  exportEnv("CLOUDFLARE_API_EMAIL", auth.email);
  exportEnv("CLOUDFLARE_EMAIL", auth.email);
}

let gatewayToken = nonempty(env.MCP_GATEWAY_TOKEN);
if (!gatewayToken) {
  gatewayToken = randomBytes(48).toString("base64url");
  mask(gatewayToken);
  await persistGatewayToken(gatewayToken);
  console.log("Generated MCP gateway bearer token and stored it in Infisical.");
} else {
  console.log("Using existing MCP gateway bearer token from Infisical.");
}
exportEnv("MCP_GATEWAY_TOKEN", gatewayToken);
