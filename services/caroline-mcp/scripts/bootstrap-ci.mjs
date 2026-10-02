import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = process.env;
const checkOnly = process.argv.includes("--check");
const CF_API = "https://api.cloudflare.com/client/v4";

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

function wranglerWhoami(auth) {
  const childEnv = { ...env };
  delete childEnv.CLOUDFLARE_ACCOUNT_ID;
  delete childEnv.CLOUDFLARE_API_TOKEN;
  delete childEnv.CLOUDFLARE_API_KEY;
  delete childEnv.CLOUDFLARE_EMAIL;

  if (auth.kind === "bearer") {
    childEnv.CLOUDFLARE_API_TOKEN = auth.token;
  } else {
    childEnv.CLOUDFLARE_API_KEY = auth.key;
    childEnv.CLOUDFLARE_EMAIL = auth.email;
  }

  try {
    const stdout = execFileSync("npx", ["wrangler", "whoami", "--json"], {
      cwd: process.cwd(),
      env: childEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const identity = JSON.parse(stdout);
    return {
      identity,
      accounts: Array.isArray(identity?.accounts) ? identity.accounts : [],
    };
  } catch {
    return null;
  }
}

function bearerCandidates() {
  const ordered = [
    first(["CLOUDFLARE_CONTROL_TOKEN"]),
    first(["CLOUDFLARE_API_TOKEN"]),
    first(["CLOUDFLARE_BUILDS_TOKEN"]),
  ].filter(Boolean);

  const fallback = nonempty(env.GITHUB_FALLBACK_CF_TOKEN);
  if (fallback) ordered.push({ name: "GITHUB_FALLBACK_CF_TOKEN", value: fallback });

  const seen = new Set();
  return ordered.filter((candidate) => {
    if (seen.has(candidate.value)) return false;
    seen.add(candidate.value);
    return true;
  });
}

async function chooseCloudflareAuth() {
  for (const candidate of bearerCandidates()) {
    const auth = { kind: "bearer", token: candidate.value, source: candidate.name };
    const whoami = wranglerWhoami(auth);
    if (whoami) return { ...auth, accounts: whoami.accounts };
  }

  const key = first(["CLOUDFLARE_API_KEY"]);
  const email = first(["CLOUDFLARE_API_EMAIL", "CLOUDFLARE_EMAIL"]);
  if (key?.value && email?.value) {
    const auth = {
      kind: "global-key",
      key: key.value,
      email: email.value,
      source: `${key.name}+${email.name}`,
    };
    const whoami = wranglerWhoami(auth);
    if (whoami) return { ...auth, accounts: whoami.accounts };
  }

  throw new Error("No usable Cloudflare Workers deployment credential was found");
}

async function workerExists(accountId, auth) {
  const response = await cfFetch(
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts/caroline-mcp/settings`,
    auth,
  );
  return response.ok;
}

async function resolveAccountId(auth) {
  const configured = nonempty(env.CLOUDFLARE_ACCOUNT_ID) ?? nonempty(env.GITHUB_FALLBACK_CF_ACCOUNT);
  if (configured && (await workerExists(configured, auth))) return configured;

  const accounts = Array.isArray(auth.accounts) ? auth.accounts : [];
  for (const account of accounts) {
    const id = nonempty(account?.id);
    if (id && (await workerExists(id, auth))) return id;
  }

  if (accounts.length === 1 && nonempty(accounts[0]?.id)) return accounts[0].id;

  const response = await cfFetch("/accounts?per_page=50", auth);
  if (response.ok) {
    const body = await response.json().catch(() => ({}));
    const visible = Array.isArray(body?.result) ? body.result : [];
    for (const account of visible) {
      const id = nonempty(account?.id);
      if (id && (await workerExists(id, auth))) return id;
    }
    if (visible.length === 1 && nonempty(visible[0]?.id)) return visible[0].id;
  }

  throw new Error("Cloudflare authenticated successfully, but the account containing caroline-mcp could not be resolved");
}

const auth = await chooseCloudflareAuth();
const accountId = await resolveAccountId(auth);
console.log(`Cloudflare authentication verified (${auth.kind}; source=${auth.source}).`);
console.log("Cloudflare account containing caroline-mcp resolved successfully.");

if (checkOnly) process.exit(0);

// These credentials are CI/deployment-process credentials only. They are not uploaded
// as caroline-mcp Worker runtime secrets. Runtime credentials come from secrets-gateway.
exportEnv("CLOUDFLARE_ACCOUNT_ID", accountId);

if (auth.kind === "bearer") {
  exportEnv("CLOUDFLARE_API_TOKEN", auth.token);
} else {
  exportEnv("CLOUDFLARE_API_KEY", auth.key);
  exportEnv("CLOUDFLARE_API_EMAIL", auth.email);
  exportEnv("CLOUDFLARE_EMAIL", auth.email);
}
