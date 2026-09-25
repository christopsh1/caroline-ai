import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  deleteWorker,
  deployWorkerCode,
  executeCloudflareApiMcp,
  getWorkerSettings,
  listWorkers,
  readWorkerCode,
  searchCloudflareApiMcp,
  type CloudflareEnv,
} from "./cloudflare";

type Risk = "read" | "write" | "restricted";
type Provider = "local" | "cloudflare" | "github" | "railway" | "elevenlabs" | "docker";

type Env = CloudflareEnv & {
  MCP_GATEWAY_TOKEN?: string;
  ENVIRONMENT?: string;
};

type Capability = {
  id: string;
  provider: Provider;
  title: string;
  description: string;
  risk: Risk;
  ownerApprovalRequired: boolean;
  enabled: boolean;
};

const VERSION = "0.1.0";

const CAPABILITIES: Capability[] = [
  {
    id: "caroline.system.status",
    provider: "local",
    title: "System status",
    description: "Return health, environment, registry size, and execution-policy state for the Caroline MCP control plane.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "caroline.capabilities.search",
    provider: "local",
    title: "Search capabilities",
    description: "Search the Caroline capability registry without exposing every provider tool schema to the model.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "caroline.capabilities.describe",
    provider: "local",
    title: "Describe capability",
    description: "Return policy and routing metadata for one registered Caroline capability.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "cloudflare.workers.list",
    provider: "cloudflare",
    title: "List Cloudflare Workers",
    description: "List Worker scripts in the configured Cloudflare account.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "cloudflare.workers.settings",
    provider: "cloudflare",
    title: "Read Worker settings",
    description: "Read settings and bindings metadata for a Worker script.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "cloudflare.workers.read_code",
    provider: "cloudflare",
    title: "Read Worker code",
    description: "Read the deployed Worker script content without modifying it.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "cloudflare.workers.deploy_code",
    provider: "cloudflare",
    title: "Create or edit Worker code",
    description: "Create a Worker or replace its deployed module source using the stable Workers Scripts API.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: true,
  },
  {
    id: "cloudflare.workers.delete",
    provider: "cloudflare",
    title: "Delete Worker",
    description: "Delete a Worker script. This is destructive and always requires explicit owner confirmation.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: true,
  },
  {
    id: "cloudflare.api.search",
    provider: "cloudflare",
    title: "Search the full Cloudflare API",
    description: "Call the official Cloudflare API MCP search tool against the OpenAPI catalog covering more than 2,500 endpoints.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: true,
  },
  {
    id: "cloudflare.api.execute",
    provider: "cloudflare",
    title: "Execute against the full Cloudflare API",
    description: "Call the official Cloudflare API MCP execute tool. Because this surface can mutate the account, this gateway requires explicit owner confirmation for every call.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: true,
  },
  {
    id: "github.repo.read",
    provider: "github",
    title: "GitHub repository read",
    description: "Read approved repository state through the GitHub MCP adapter.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "github.repo.write",
    provider: "github",
    title: "GitHub repository write",
    description: "Perform an approved repository mutation through the GitHub MCP adapter.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: false,
  },
  {
    id: "railway.project.read",
    provider: "railway",
    title: "Railway project read",
    description: "Inspect approved Railway project and deployment state.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "railway.project.write",
    provider: "railway",
    title: "Railway project write",
    description: "Perform an explicitly approved Railway project mutation.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: false,
  },
  {
    id: "elevenlabs.agent.read",
    provider: "elevenlabs",
    title: "ElevenLabs agent read",
    description: "Inspect approved ElevenLabs agent configuration through its MCP adapter.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "elevenlabs.agent.write",
    provider: "elevenlabs",
    title: "ElevenLabs agent write",
    description: "Perform an explicitly approved ElevenLabs agent configuration mutation.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: false,
  },
  {
    id: "docker.mcp.call",
    provider: "docker",
    title: "Docker MCP call",
    description: "Route a permitted capability to the remote Docker MCP execution node when a container-backed server is required.",
    risk: "restricted",
    ownerApprovalRequired: true,
    enabled: false,
  },
];

function asToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function searchCapabilities(query?: string, provider?: Provider) {
  const q = normalized(query ?? "");
  return CAPABILITIES.filter((capability) => {
    const providerMatches = !provider || capability.provider === provider;
    const queryMatches =
      !q ||
      normalized(capability.id).includes(q) ||
      normalized(capability.title).includes(q) ||
      normalized(capability.description).includes(q) ||
      normalized(capability.provider).includes(q);
    return providerMatches && queryMatches;
  });
}

function getCapability(id: string) {
  return CAPABILITIES.find((capability) => capability.id === id);
}

function cloudflareConfigured(env: Env) {
  return Boolean(env.CLOUDFLARE_CONTROL_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}

function systemStatus(env: Env) {
  return {
    service: "caroline-mcp",
    version: VERSION,
    environment: env.ENVIRONMENT ?? "unknown",
    gateway_locked: !env.MCP_GATEWAY_TOKEN,
    execution_policy: "deny-by-default; explicit confirmation for writes",
    registered_capabilities: CAPABILITIES.length,
    enabled_capabilities: CAPABILITIES.filter((capability) => capability.enabled).map((capability) => capability.id),
    cloudflare: {
      configured: cloudflareConfigured(env),
      api_mcp_url: env.CLOUDFLARE_MCP_URL ?? "https://mcp.cloudflare.com/mcp",
      workers_read: cloudflareConfigured(env),
      workers_write: cloudflareConfigured(env),
      full_api_search: cloudflareConfigured(env),
      full_api_execute: cloudflareConfigured(env),
    },
    upstreams: {
      github: "registered-not-connected",
      railway: "registered-not-connected",
      elevenlabs: "registered-not-connected",
      docker: "registered-not-connected",
    },
  };
}

function approvalRequired(capability: Capability, confirmWrite?: boolean) {
  if (!capability.ownerApprovalRequired) return null;
  if (confirmWrite === true) return null;
  return {
    ok: false,
    status: "approval_required",
    reason: "explicit_owner_confirmation_required",
    capability,
  };
}

async function executeCapability(
  env: Env,
  capabilityId: string,
  input: Record<string, unknown> | undefined,
  confirmWrite: boolean | undefined,
) {
  const capability = getCapability(capabilityId);
  if (!capability) {
    return { ok: false, status: "denied", reason: "unknown_capability", capability_id: capabilityId };
  }

  if (!capability.enabled) {
    return { ok: false, status: "blocked", reason: "provider_adapter_not_enabled", capability };
  }

  const approval = approvalRequired(capability, confirmWrite);
  if (approval) return approval;

  try {
    switch (capability.id) {
      case "caroline.system.status":
        return { ok: true, status: "completed", output: systemStatus(env) };
      case "caroline.capabilities.search": {
        const query = typeof input?.query === "string" ? input.query : undefined;
        return { ok: true, status: "completed", output: searchCapabilities(query) };
      }
      case "caroline.capabilities.describe": {
        const id = typeof input?.id === "string" ? input.id : "";
        const described = getCapability(id);
        return described
          ? { ok: true, status: "completed", output: described }
          : { ok: false, status: "denied", reason: "unknown_capability", capability_id: id };
      }
      case "cloudflare.workers.list":
        return { ok: true, status: "completed", output: await listWorkers(env) };
      case "cloudflare.workers.settings":
        return {
          ok: true,
          status: "completed",
          output: await getWorkerSettings(env, String(input?.script_name ?? "")),
        };
      case "cloudflare.workers.read_code":
        return {
          ok: true,
          status: "completed",
          output: await readWorkerCode(env, String(input?.script_name ?? "")),
        };
      case "cloudflare.workers.deploy_code":
        return {
          ok: true,
          status: "completed",
          output: await deployWorkerCode(env, {
            scriptName: String(input?.script_name ?? ""),
            source: String(input?.source ?? ""),
            mainModule: typeof input?.main_module === "string" ? input.main_module : undefined,
            compatibilityDate: typeof input?.compatibility_date === "string" ? input.compatibility_date : undefined,
            compatibilityFlags: Array.isArray(input?.compatibility_flags)
              ? input.compatibility_flags.map(String)
              : undefined,
            bindings: Array.isArray(input?.bindings) ? input.bindings : undefined,
          }),
        };
      case "cloudflare.workers.delete":
        return {
          ok: true,
          status: "completed",
          output: await deleteWorker(env, String(input?.script_name ?? "")),
        };
      case "cloudflare.api.search":
        return {
          ok: true,
          status: "completed",
          output: await searchCloudflareApiMcp(env, String(input?.code ?? "")),
        };
      case "cloudflare.api.execute":
        return {
          ok: true,
          status: "completed",
          output: await executeCloudflareApiMcp(env, String(input?.code ?? "")),
        };
      default:
        return { ok: false, status: "blocked", reason: "no_execution_adapter", capability };
    }
  } catch (error) {
    return {
      ok: false,
      status: "error",
      capability_id: capability.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createServer(env: Env) {
  const server = new McpServer({ name: "caroline-mcp", version: VERSION });

  server.registerTool(
    "caroline_system_status",
    {
      description: "Read the status, connected providers, and security posture of the Caroline MCP control plane.",
      inputSchema: {},
    },
    async () => asToolResult(systemStatus(env)),
  );

  server.registerTool(
    "caroline_capabilities_search",
    {
      description: "Search Caroline's capability registry. Use this before requesting execution.",
      inputSchema: {
        query: z.string().optional(),
        provider: z.enum(["local", "cloudflare", "github", "railway", "elevenlabs", "docker"]).optional(),
      },
    },
    async ({ query, provider }) => asToolResult({ capabilities: searchCapabilities(query, provider) }),
  );

  server.registerTool(
    "caroline_capabilities_describe",
    {
      description: "Describe one registered capability including provider, risk, approval requirements, and enabled state.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const capability = getCapability(id);
      return asToolResult(capability ? { found: true, capability } : { found: false, capability_id: id });
    },
  );

  server.registerTool(
    "caroline_capabilities_execute",
    {
      description: "Execute one registered capability through Caroline's policy gate. Write capabilities require confirm_write=true.",
      inputSchema: {
        capability_id: z.string().min(1),
        input: z.record(z.string(), z.unknown()).optional(),
        confirm_write: z.boolean().optional(),
      },
    },
    async ({ capability_id, input, confirm_write }) =>
      asToolResult(await executeCapability(env, capability_id, input, confirm_write)),
  );

  server.registerTool(
    "cloudflare_workers_list",
    {
      description: "List all Cloudflare Worker scripts in Caroline's configured account.",
      inputSchema: {},
    },
    async () => {
      try {
        return asToolResult(await listWorkers(env));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_worker_get_settings",
    {
      description: "Read Cloudflare Worker settings and bindings metadata.",
      inputSchema: { script_name: z.string().min(1) },
    },
    async ({ script_name }) => {
      try {
        return asToolResult(await getWorkerSettings(env, script_name));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_worker_read_code",
    {
      description: "Read the currently deployed source/bundle for a Cloudflare Worker. Read-only.",
      inputSchema: { script_name: z.string().min(1) },
    },
    async ({ script_name }) => {
      try {
        return asToolResult(await readWorkerCode(env, script_name));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_worker_deploy_code",
    {
      description: "Create a Worker or replace its deployed ES-module source. This is a write and requires confirm_write=true.",
      inputSchema: {
        script_name: z.string().min(1),
        source: z.string().min(1),
        main_module: z.string().default("index.js"),
        compatibility_date: z.string().optional(),
        compatibility_flags: z.array(z.string()).optional(),
        bindings: z.array(z.unknown()).optional(),
        confirm_write: z.boolean().optional(),
      },
    },
    async ({ script_name, source, main_module, compatibility_date, compatibility_flags, bindings, confirm_write }) => {
      if (confirm_write !== true) {
        return asToolResult({
          ok: false,
          status: "approval_required",
          reason: "explicit_owner_confirmation_required",
        });
      }
      try {
        return asToolResult(
          await deployWorkerCode(env, {
            scriptName: script_name,
            source,
            mainModule: main_module,
            compatibilityDate: compatibility_date,
            compatibilityFlags: compatibility_flags,
            bindings,
          }),
        );
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_worker_delete",
    {
      description: "Delete a Cloudflare Worker. Destructive; requires confirm_write=true.",
      inputSchema: {
        script_name: z.string().min(1),
        confirm_write: z.boolean().optional(),
      },
    },
    async ({ script_name, confirm_write }) => {
      if (confirm_write !== true) {
        return asToolResult({
          ok: false,
          status: "approval_required",
          reason: "explicit_owner_confirmation_required",
        });
      }
      try {
        return asToolResult(await deleteWorker(env, script_name));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_api_search",
    {
      description: "Search Cloudflare's official full API MCP OpenAPI catalog. Pass JavaScript code that inspects codemode.spec().",
      inputSchema: { code: z.string().min(1) },
    },
    async ({ code }) => {
      try {
        return asToolResult(await searchCloudflareApiMcp(env, code));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  server.registerTool(
    "cloudflare_api_execute",
    {
      description: "Execute code through Cloudflare's official full API MCP. This is a privileged surface and requires confirm_write=true for every call.",
      inputSchema: {
        code: z.string().min(1),
        confirm_write: z.boolean().optional(),
      },
    },
    async ({ code, confirm_write }) => {
      if (confirm_write !== true) {
        return asToolResult({
          ok: false,
          status: "approval_required",
          reason: "explicit_owner_confirmation_required",
        });
      }
      try {
        return asToolResult(await executeCloudflareApiMcp(env, code));
      } catch (error) {
        return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  return server;
}

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function locked() {
  return Response.json(
    {
      error: "gateway_locked",
      message: "MCP_GATEWAY_TOKEN is not configured. The MCP endpoint is intentionally unavailable.",
    },
    { status: 503 },
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "caroline-mcp",
        version: VERSION,
        environment: env.ENVIRONMENT ?? "unknown",
        mcp_endpoint: "/mcp",
        gateway_locked: !env.MCP_GATEWAY_TOKEN,
        cloudflare_configured: cloudflareConfigured(env),
      });
    }

    if (url.pathname !== "/mcp") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    if (!env.MCP_GATEWAY_TOKEN) return locked();

    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${env.MCP_GATEWAY_TOKEN}`) return unauthorized();

    const handler = createMcpHandler(() => createServer(env), { legacy: "stateless" });
    return handler(request, env, ctx);
  },
};
