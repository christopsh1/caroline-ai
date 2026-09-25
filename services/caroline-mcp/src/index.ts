import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

type Risk = "read" | "write" | "restricted";
type Provider = "local" | "cloudflare" | "github" | "railway" | "elevenlabs" | "docker";

type Env = {
  MCP_GATEWAY_TOKEN?: string;
  ENVIRONMENT?: string;
  CLOUDFLARE_MCP_URL?: string;
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
    id: "cloudflare.api.search",
    provider: "cloudflare",
    title: "Cloudflare API search",
    description: "Search Cloudflare API MCP capabilities. Adapter is registered but disabled until provider authentication is configured.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "cloudflare.api.execute",
    provider: "cloudflare",
    title: "Cloudflare API execute",
    description: "Execute a Cloudflare API MCP operation after policy evaluation. Disabled until provider authentication is configured.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: false,
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
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text" as const, text }],
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

function systemStatus(env: Env) {
  return {
    service: "caroline-mcp",
    version: VERSION,
    environment: env.ENVIRONMENT ?? "unknown",
    gateway_locked: !env.MCP_GATEWAY_TOKEN,
    execution_policy: "deny-by-default",
    registered_capabilities: CAPABILITIES.length,
    enabled_capabilities: CAPABILITIES.filter((capability) => capability.enabled).map((capability) => capability.id),
    upstreams: {
      cloudflare: env.CLOUDFLARE_MCP_URL ?? "https://mcp.cloudflare.com/mcp",
      github: "registered-not-connected",
      railway: "registered-not-connected",
      elevenlabs: "registered-not-connected",
      docker: "registered-not-connected",
    },
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
    return {
      ok: false,
      status: "blocked",
      reason: "provider_adapter_not_enabled",
      capability,
    };
  }

  if (capability.ownerApprovalRequired && confirmWrite !== true) {
    return {
      ok: false,
      status: "approval_required",
      reason: "explicit_owner_confirmation_required",
      capability,
    };
  }

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
    default:
      return {
        ok: false,
        status: "blocked",
        reason: "no_execution_adapter",
        capability,
      };
  }
}

function createServer(env: Env) {
  const server = new McpServer({ name: "caroline-mcp", version: VERSION });

  server.registerTool(
    "caroline_system_status",
    {
      description: "Read the status and security posture of the Caroline MCP control plane.",
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
      return asToolResult(
        capability
          ? { found: true, capability }
          : { found: false, capability_id: id },
      );
    },
  );

  server.registerTool(
    "caroline_capabilities_execute",
    {
      description: "Execute one registered capability through Caroline's policy gate. Disabled providers fail closed.",
      inputSchema: {
        capability_id: z.string().min(1),
        input: z.record(z.string(), z.unknown()).optional(),
        confirm_write: z.boolean().optional(),
      },
    },
    async ({ capability_id, input, confirm_write }) =>
      asToolResult(await executeCapability(env, capability_id, input, confirm_write)),
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
