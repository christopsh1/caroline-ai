import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  cancelBuild,
  createBuildToken,
  createBuildTrigger,
  createRepoConnection,
  deleteBuildTrigger,
  deleteRepoConnection,
  getBuildLogs,
  listBuilds,
  listBuildTokens,
  listGithubInstallationRepositories,
  listGithubInstallations,
  listRepoConnections,
  listWorkerBuildTriggers,
  triggerBuild,
  updateBuildTrigger,
  buildsConfigured,
  type BuildTriggerInput,
  type CloudflareBuildsEnv,
} from "./builds";
import {
  deleteWorker,
  deployWorkerCode,
  deployWorkerModules,
  executeCloudflareApiMcp,
  getWorkerSettings,
  listWorkers,
  readWorkerCode,
  searchCloudflareApiMcp,
  type CloudflareEnv,
  type WorkerModule,
} from "./cloudflare";

type Risk = "read" | "write" | "restricted";
type Provider = "local" | "cloudflare" | "github" | "railway" | "elevenlabs" | "docker";

type Env = CloudflareEnv & CloudflareBuildsEnv & {
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

const VERSION = "0.1.1";

function capability(
  id: string,
  title: string,
  description: string,
  risk: Risk = "read",
  enabled = true,
): Capability {
  return {
    id,
    provider: id.startsWith("cloudflare.") ? "cloudflare" : "local",
    title,
    description,
    risk,
    ownerApprovalRequired: risk !== "read",
    enabled,
  };
}

const CAPABILITIES: Capability[] = [
  capability("caroline.system.status", "System status", "Read Caroline MCP health, configuration, and execution policy."),
  capability("caroline.capabilities.search", "Search capabilities", "Search the Caroline MCP capability registry."),
  capability("caroline.capabilities.describe", "Describe capability", "Read policy metadata for one capability."),
  capability("cloudflare.workers.list", "List Workers", "List Worker scripts in the configured Cloudflare account."),
  capability("cloudflare.workers.settings", "Read Worker settings", "Read Worker settings and bindings metadata."),
  capability("cloudflare.workers.read_code", "Read Worker code", "Read deployed Worker source or bundle content."),
  capability("cloudflare.workers.deploy_code", "Create or edit Worker code", "Create or replace a single-module Worker.", "write"),
  capability("cloudflare.workers.deploy_modules", "Create or edit multi-file Worker", "Deploy a Worker made of multiple modules/files.", "write"),
  capability("cloudflare.workers.delete", "Delete Worker", "Delete a Worker script.", "write"),
  capability("cloudflare.builds.list", "List Worker builds", "List Cloudflare Workers Builds records."),
  capability("cloudflare.builds.logs", "Read build logs", "Read logs for a Workers Build."),
  capability("cloudflare.builds.cancel", "Cancel build", "Cancel an in-progress Workers Build.", "write"),
  capability("cloudflare.builds.tokens.list", "List build tokens", "List Workers Builds token metadata."),
  capability("cloudflare.builds.tokens.create", "Create build token", "Create a Workers Builds token.", "write"),
  capability("cloudflare.builds.github.installations", "List GitHub installations", "List GitHub installations available to Workers Builds."),
  capability("cloudflare.builds.github.repositories", "List GitHub installation repositories", "List repositories visible to a Workers Builds GitHub installation."),
  capability("cloudflare.builds.repo_connections.list", "List repository connections", "List Workers Builds repository connections."),
  capability("cloudflare.builds.repo_connections.create", "Create repository connection", "Connect a GitHub repository to Workers Builds.", "write"),
  capability("cloudflare.builds.repo_connections.delete", "Delete repository connection", "Delete a Workers Builds repository connection.", "write"),
  capability("cloudflare.builds.triggers.list", "List build triggers", "List build triggers for a Worker tag."),
  capability("cloudflare.builds.triggers.create", "Create build trigger", "Create Git-backed build/deploy configuration for a Worker.", "write"),
  capability("cloudflare.builds.triggers.update", "Update build trigger", "Edit Worker build/deploy commands, branches, caching, or preview settings.", "write"),
  capability("cloudflare.builds.triggers.delete", "Delete build trigger", "Delete a Workers Builds trigger.", "write"),
  capability("cloudflare.builds.trigger_run", "Run Worker build", "Start a Workers Build for a branch or tag.", "write"),
  capability("cloudflare.api.search", "Search full Cloudflare API", "Search Cloudflare's official API MCP catalog."),
  capability("cloudflare.api.execute", "Execute full Cloudflare API", "Execute against Cloudflare's full API MCP surface.", "write"),
  {
    id: "github.repo.read",
    provider: "github",
    title: "GitHub repository read",
    description: "Reserved adapter for direct GitHub MCP access.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "github.repo.write",
    provider: "github",
    title: "GitHub repository write",
    description: "Reserved adapter for direct GitHub MCP mutations.",
    risk: "write",
    ownerApprovalRequired: true,
    enabled: false,
  },
  {
    id: "railway.project.read",
    provider: "railway",
    title: "Railway project read",
    description: "Reserved Railway adapter.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "elevenlabs.agent.read",
    provider: "elevenlabs",
    title: "ElevenLabs agent read",
    description: "Reserved ElevenLabs adapter.",
    risk: "read",
    ownerApprovalRequired: false,
    enabled: false,
  },
  {
    id: "docker.mcp.call",
    provider: "docker",
    title: "Docker MCP call",
    description: "Reserved remote Docker MCP execution adapter.",
    risk: "restricted",
    ownerApprovalRequired: true,
    enabled: false,
  },
];

const providerSchema = z.enum(["local", "cloudflare", "github", "railway", "elevenlabs", "docker"]);
const moduleSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
  type: z.enum(["esm", "commonjs", "text", "json", "wasm", "data"]).optional(),
});
const buildTriggerFields = {
  repo_connection_uuid: z.string().min(1),
  worker_tag: z.string().min(1),
  build_command: z.string().optional(),
  deploy_command: z.string().optional(),
  root_dir: z.string().optional(),
  branch_includes: z.array(z.string()).optional(),
  branch_excludes: z.array(z.string()).optional(),
  build_caching_enabled: z.boolean().optional(),
  build_token_uuid: z.string().optional(),
  preview_branch_includes: z.array(z.string()).optional(),
  preview_branch_excludes: z.array(z.string()).optional(),
  preview_script_name: z.string().optional(),
  preview_urls: z.boolean().optional(),
};

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
  return CAPABILITIES.filter((item) => {
    const providerMatches = !provider || item.provider === provider;
    const queryMatches =
      !q ||
      normalized(item.id).includes(q) ||
      normalized(item.title).includes(q) ||
      normalized(item.description).includes(q) ||
      normalized(item.provider).includes(q);
    return providerMatches && queryMatches;
  });
}

function getCapability(id: string) {
  return CAPABILITIES.find((item) => item.id === id);
}

function workersConfigured(env: Env) {
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
    enabled_capabilities: CAPABILITIES.filter((item) => item.enabled).map((item) => item.id),
    cloudflare: {
      account_configured: Boolean(env.CLOUDFLARE_ACCOUNT_ID),
      workers_control_configured: workersConfigured(env),
      workers_builds_configured: buildsConfigured(env),
      api_mcp_url: env.CLOUDFLARE_MCP_URL ?? "https://mcp.cloudflare.com/mcp",
    },
    upstreams: {
      github: "available-through-cloudflare-builds-when-connected",
      railway: "registered-not-connected",
      elevenlabs: "registered-not-connected",
      docker: "registered-not-connected",
    },
  };
}

function approvalRequired(capability: Capability, confirmWrite?: boolean) {
  if (!capability.ownerApprovalRequired || confirmWrite === true) return null;
  return {
    ok: false,
    status: "approval_required",
    reason: "explicit_owner_confirmation_required",
    capability,
  };
}

function writeRequired(confirmWrite?: boolean) {
  if (confirmWrite === true) return null;
  return {
    ok: false,
    status: "approval_required",
    reason: "explicit_owner_confirmation_required",
  };
}

function triggerInputFromRecord(input: Record<string, unknown>): BuildTriggerInput {
  return {
    repoConnectionUuid: String(input.repo_connection_uuid ?? ""),
    workerTag: String(input.worker_tag ?? ""),
    buildCommand: typeof input.build_command === "string" ? input.build_command : undefined,
    deployCommand: typeof input.deploy_command === "string" ? input.deploy_command : undefined,
    rootDir: typeof input.root_dir === "string" ? input.root_dir : undefined,
    branchIncludes: Array.isArray(input.branch_includes) ? input.branch_includes.map(String) : undefined,
    branchExcludes: Array.isArray(input.branch_excludes) ? input.branch_excludes.map(String) : undefined,
    buildCachingEnabled: typeof input.build_caching_enabled === "boolean" ? input.build_caching_enabled : undefined,
    buildTokenUuid: typeof input.build_token_uuid === "string" ? input.build_token_uuid : undefined,
    previewBranchIncludes: Array.isArray(input.preview_branch_includes) ? input.preview_branch_includes.map(String) : undefined,
    previewBranchExcludes: Array.isArray(input.preview_branch_excludes) ? input.preview_branch_excludes.map(String) : undefined,
    previewScriptName: typeof input.preview_script_name === "string" ? input.preview_script_name : undefined,
    previewUrls: typeof input.preview_urls === "boolean" ? input.preview_urls : undefined,
  };
}

function triggerPatchFromRecord(input: Record<string, unknown>): Partial<BuildTriggerInput> {
  const patch: Partial<BuildTriggerInput> = {};
  if (input.repo_connection_uuid !== undefined) patch.repoConnectionUuid = String(input.repo_connection_uuid);
  if (input.worker_tag !== undefined) patch.workerTag = String(input.worker_tag);
  if (input.build_command !== undefined) patch.buildCommand = String(input.build_command);
  if (input.deploy_command !== undefined) patch.deployCommand = String(input.deploy_command);
  if (input.root_dir !== undefined) patch.rootDir = String(input.root_dir);
  if (Array.isArray(input.branch_includes)) patch.branchIncludes = input.branch_includes.map(String);
  if (Array.isArray(input.branch_excludes)) patch.branchExcludes = input.branch_excludes.map(String);
  if (typeof input.build_caching_enabled === "boolean") patch.buildCachingEnabled = input.build_caching_enabled;
  if (input.build_token_uuid !== undefined) patch.buildTokenUuid = String(input.build_token_uuid);
  if (Array.isArray(input.preview_branch_includes)) patch.previewBranchIncludes = input.preview_branch_includes.map(String);
  if (Array.isArray(input.preview_branch_excludes)) patch.previewBranchExcludes = input.preview_branch_excludes.map(String);
  if (input.preview_script_name !== undefined) patch.previewScriptName = String(input.preview_script_name);
  if (typeof input.preview_urls === "boolean") patch.previewUrls = input.preview_urls;
  return patch;
}

async function executeCapability(
  env: Env,
  capabilityId: string,
  input: Record<string, unknown> = {},
  confirmWrite?: boolean,
) {
  const selected = getCapability(capabilityId);
  if (!selected) return { ok: false, status: "denied", reason: "unknown_capability", capability_id: capabilityId };
  if (!selected.enabled) return { ok: false, status: "blocked", reason: "provider_adapter_not_enabled", capability: selected };
  const approval = approvalRequired(selected, confirmWrite);
  if (approval) return approval;

  try {
    let output: unknown;
    switch (capabilityId) {
      case "caroline.system.status": output = systemStatus(env); break;
      case "caroline.capabilities.search": output = searchCapabilities(typeof input.query === "string" ? input.query : undefined); break;
      case "caroline.capabilities.describe": output = getCapability(String(input.id ?? "")); break;
      case "cloudflare.workers.list": output = await listWorkers(env); break;
      case "cloudflare.workers.settings": output = await getWorkerSettings(env, String(input.script_name ?? "")); break;
      case "cloudflare.workers.read_code": output = await readWorkerCode(env, String(input.script_name ?? "")); break;
      case "cloudflare.workers.deploy_code":
        output = await deployWorkerCode(env, {
          scriptName: String(input.script_name ?? ""),
          source: String(input.source ?? ""),
          mainModule: typeof input.main_module === "string" ? input.main_module : undefined,
          compatibilityDate: typeof input.compatibility_date === "string" ? input.compatibility_date : undefined,
          compatibilityFlags: Array.isArray(input.compatibility_flags) ? input.compatibility_flags.map(String) : undefined,
          bindings: Array.isArray(input.bindings) ? input.bindings : undefined,
        });
        break;
      case "cloudflare.workers.deploy_modules":
        output = await deployWorkerModules(env, {
          scriptName: String(input.script_name ?? ""),
          modules: (Array.isArray(input.modules) ? input.modules : []) as WorkerModule[],
          mainModule: typeof input.main_module === "string" ? input.main_module : undefined,
          compatibilityDate: typeof input.compatibility_date === "string" ? input.compatibility_date : undefined,
          compatibilityFlags: Array.isArray(input.compatibility_flags) ? input.compatibility_flags.map(String) : undefined,
          bindings: Array.isArray(input.bindings) ? input.bindings : undefined,
        });
        break;
      case "cloudflare.workers.delete": output = await deleteWorker(env, String(input.script_name ?? "")); break;
      case "cloudflare.builds.list": output = await listBuilds(env, {
        workerTag: typeof input.worker_tag === "string" ? input.worker_tag : undefined,
        page: typeof input.page === "number" ? input.page : undefined,
        perPage: typeof input.per_page === "number" ? input.per_page : undefined,
      }); break;
      case "cloudflare.builds.logs": output = await getBuildLogs(env, String(input.build_uuid ?? "")); break;
      case "cloudflare.builds.cancel": output = await cancelBuild(env, String(input.build_uuid ?? "")); break;
      case "cloudflare.builds.tokens.list": output = await listBuildTokens(env); break;
      case "cloudflare.builds.tokens.create": output = await createBuildToken(env, String(input.name ?? "")); break;
      case "cloudflare.builds.github.installations": output = await listGithubInstallations(env); break;
      case "cloudflare.builds.github.repositories": output = await listGithubInstallationRepositories(env, String(input.installation_id ?? "")); break;
      case "cloudflare.builds.repo_connections.list": output = await listRepoConnections(env); break;
      case "cloudflare.builds.repo_connections.create": output = await createRepoConnection(env, {
        providerAccountId: String(input.provider_account_id ?? ""),
        providerAccountName: String(input.provider_account_name ?? ""),
        providerRepoId: String(input.provider_repo_id ?? ""),
        providerRepoName: String(input.provider_repo_name ?? ""),
      }); break;
      case "cloudflare.builds.repo_connections.delete": output = await deleteRepoConnection(env, String(input.connection_uuid ?? "")); break;
      case "cloudflare.builds.triggers.list": output = await listWorkerBuildTriggers(env, String(input.worker_tag ?? "")); break;
      case "cloudflare.builds.triggers.create": output = await createBuildTrigger(env, triggerInputFromRecord(input)); break;
      case "cloudflare.builds.triggers.update": output = await updateBuildTrigger(env, String(input.trigger_uuid ?? ""), triggerPatchFromRecord(input)); break;
      case "cloudflare.builds.triggers.delete": output = await deleteBuildTrigger(env, String(input.trigger_uuid ?? "")); break;
      case "cloudflare.builds.trigger_run": output = await triggerBuild(env, String(input.trigger_uuid ?? ""), {
        branch: typeof input.branch === "string" ? input.branch : undefined,
        tag: typeof input.tag === "string" ? input.tag : undefined,
      }); break;
      case "cloudflare.api.search": output = await searchCloudflareApiMcp(env, String(input.code ?? "")); break;
      case "cloudflare.api.execute": output = await executeCloudflareApiMcp(env, String(input.code ?? "")); break;
      default: return { ok: false, status: "blocked", reason: "no_execution_adapter", capability: selected };
    }
    return { ok: true, status: "completed", output };
  } catch (error) {
    return { ok: false, status: "error", capability_id: capabilityId, error: error instanceof Error ? error.message : String(error) };
  }
}

async function safe<T>(fn: () => Promise<T>) {
  try {
    return asToolResult(await fn());
  } catch (error) {
    return asToolResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function createServer(env: Env) {
  const server = new McpServer({ name: "caroline-mcp", version: VERSION });

  server.registerTool("caroline_system_status", {
    description: "Read Caroline MCP status, configuration, and security posture.",
    inputSchema: {},
  }, async () => asToolResult(systemStatus(env)));

  server.registerTool("caroline_capabilities_search", {
    description: "Search Caroline's capability registry.",
    inputSchema: { query: z.string().optional(), provider: providerSchema.optional() },
  }, async ({ query, provider }) => asToolResult({ capabilities: searchCapabilities(query, provider) }));

  server.registerTool("caroline_capabilities_describe", {
    description: "Describe one capability including risk, approval requirements, and enabled state.",
    inputSchema: { id: z.string().min(1) },
  }, async ({ id }) => asToolResult({ capability: getCapability(id) ?? null }));

  server.registerTool("caroline_capabilities_execute", {
    description: "Execute one registered capability through the policy gate. Writes require confirm_write=true.",
    inputSchema: {
      capability_id: z.string().min(1),
      input: z.record(z.string(), z.unknown()).optional(),
      confirm_write: z.boolean().optional(),
    },
  }, async ({ capability_id, input, confirm_write }) => asToolResult(await executeCapability(env, capability_id, input, confirm_write)));

  server.registerTool("cloudflare_workers_list", {
    description: "List Cloudflare Workers.", inputSchema: {},
  }, async () => safe(() => listWorkers(env)));

  server.registerTool("cloudflare_worker_get_settings", {
    description: "Read Worker settings and bindings.", inputSchema: { script_name: z.string().min(1) },
  }, async ({ script_name }) => safe(() => getWorkerSettings(env, script_name)));

  server.registerTool("cloudflare_worker_read_code", {
    description: "Read deployed Worker source/bundle. Read-only.", inputSchema: { script_name: z.string().min(1) },
  }, async ({ script_name }) => safe(() => readWorkerCode(env, script_name)));

  server.registerTool("cloudflare_worker_deploy_code", {
    description: "Create or replace a single-module Worker. Requires confirm_write=true.",
    inputSchema: {
      script_name: z.string().min(1), source: z.string().min(1), main_module: z.string().default("index.js"),
      compatibility_date: z.string().optional(), compatibility_flags: z.array(z.string()).optional(),
      bindings: z.array(z.unknown()).optional(), confirm_write: z.boolean().optional(),
    },
  }, async ({ script_name, source, main_module, compatibility_date, compatibility_flags, bindings, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => deployWorkerCode(env, { scriptName: script_name, source, mainModule: main_module, compatibilityDate: compatibility_date, compatibilityFlags: compatibility_flags, bindings }));
  });

  server.registerTool("cloudflare_worker_deploy_modules", {
    description: "Create or replace a multi-file Worker using module uploads. Requires confirm_write=true.",
    inputSchema: {
      script_name: z.string().min(1), modules: z.array(moduleSchema).min(1), main_module: z.string().optional(),
      compatibility_date: z.string().optional(), compatibility_flags: z.array(z.string()).optional(),
      bindings: z.array(z.unknown()).optional(), confirm_write: z.boolean().optional(),
    },
  }, async ({ script_name, modules, main_module, compatibility_date, compatibility_flags, bindings, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => deployWorkerModules(env, { scriptName: script_name, modules, mainModule: main_module, compatibilityDate: compatibility_date, compatibilityFlags: compatibility_flags, bindings }));
  });

  server.registerTool("cloudflare_worker_delete", {
    description: "Delete a Worker. Destructive; requires confirm_write=true.",
    inputSchema: { script_name: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ script_name, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => deleteWorker(env, script_name));
  });

  server.registerTool("cloudflare_builds_list", {
    description: "List Workers Builds records, optionally filtered by Worker tag.",
    inputSchema: { worker_tag: z.string().optional(), page: z.number().int().positive().optional(), per_page: z.number().int().positive().max(100).optional() },
  }, async ({ worker_tag, page, per_page }) => safe(() => listBuilds(env, { workerTag: worker_tag, page, perPage: per_page })));

  server.registerTool("cloudflare_build_logs", {
    description: "Read logs for a Workers Build.", inputSchema: { build_uuid: z.string().min(1) },
  }, async ({ build_uuid }) => safe(() => getBuildLogs(env, build_uuid)));

  server.registerTool("cloudflare_build_cancel", {
    description: "Cancel a Workers Build. Requires confirm_write=true.",
    inputSchema: { build_uuid: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ build_uuid, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => cancelBuild(env, build_uuid));
  });

  server.registerTool("cloudflare_build_tokens_list", {
    description: "List Workers Builds token metadata.", inputSchema: {},
  }, async () => safe(() => listBuildTokens(env)));

  server.registerTool("cloudflare_build_token_create", {
    description: "Create a Workers Builds token. Requires confirm_write=true. Treat returned token material as secret.",
    inputSchema: { name: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ name, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => createBuildToken(env, name));
  });

  server.registerTool("cloudflare_builds_github_installations", {
    description: "List GitHub installations available to Workers Builds.", inputSchema: {},
  }, async () => safe(() => listGithubInstallations(env)));

  server.registerTool("cloudflare_builds_github_repositories", {
    description: "List repositories visible to a Workers Builds GitHub installation.",
    inputSchema: { installation_id: z.string().min(1) },
  }, async ({ installation_id }) => safe(() => listGithubInstallationRepositories(env, installation_id)));

  server.registerTool("cloudflare_builds_repo_connections_list", {
    description: "List Workers Builds repository connections.", inputSchema: {},
  }, async () => safe(() => listRepoConnections(env)));

  server.registerTool("cloudflare_builds_repo_connection_create", {
    description: "Connect a GitHub repository to Workers Builds. Requires confirm_write=true.",
    inputSchema: {
      provider_account_id: z.string().min(1), provider_account_name: z.string().min(1),
      provider_repo_id: z.string().min(1), provider_repo_name: z.string().min(1), confirm_write: z.boolean().optional(),
    },
  }, async ({ provider_account_id, provider_account_name, provider_repo_id, provider_repo_name, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => createRepoConnection(env, { providerAccountId: provider_account_id, providerAccountName: provider_account_name, providerRepoId: provider_repo_id, providerRepoName: provider_repo_name }));
  });

  server.registerTool("cloudflare_builds_repo_connection_delete", {
    description: "Delete a Workers Builds repository connection. Requires confirm_write=true.",
    inputSchema: { connection_uuid: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ connection_uuid, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => deleteRepoConnection(env, connection_uuid));
  });

  server.registerTool("cloudflare_worker_build_triggers_list", {
    description: "List build triggers for a Worker tag.", inputSchema: { worker_tag: z.string().min(1) },
  }, async ({ worker_tag }) => safe(() => listWorkerBuildTriggers(env, worker_tag)));

  server.registerTool("cloudflare_worker_build_trigger_create", {
    description: "Create Git-backed Worker build/deploy configuration. Requires confirm_write=true.",
    inputSchema: { ...buildTriggerFields, confirm_write: z.boolean().optional() },
  }, async (args) => {
    const denied = writeRequired(args.confirm_write); if (denied) return asToolResult(denied);
    return safe(() => createBuildTrigger(env, triggerInputFromRecord(args)));
  });

  server.registerTool("cloudflare_worker_build_trigger_update", {
    description: "Edit Worker build/deploy configuration. Requires confirm_write=true.",
    inputSchema: {
      trigger_uuid: z.string().min(1),
      repo_connection_uuid: z.string().optional(), worker_tag: z.string().optional(), build_command: z.string().optional(),
      deploy_command: z.string().optional(), root_dir: z.string().optional(), branch_includes: z.array(z.string()).optional(),
      branch_excludes: z.array(z.string()).optional(), build_caching_enabled: z.boolean().optional(), build_token_uuid: z.string().optional(),
      preview_branch_includes: z.array(z.string()).optional(), preview_branch_excludes: z.array(z.string()).optional(),
      preview_script_name: z.string().optional(), preview_urls: z.boolean().optional(), confirm_write: z.boolean().optional(),
    },
  }, async (args) => {
    const denied = writeRequired(args.confirm_write); if (denied) return asToolResult(denied);
    return safe(() => updateBuildTrigger(env, args.trigger_uuid, triggerPatchFromRecord(args)));
  });

  server.registerTool("cloudflare_worker_build_trigger_delete", {
    description: "Delete a Worker build trigger. Requires confirm_write=true.",
    inputSchema: { trigger_uuid: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ trigger_uuid, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => deleteBuildTrigger(env, trigger_uuid));
  });

  server.registerTool("cloudflare_worker_build_run", {
    description: "Start a Workers Build for exactly one branch or tag. Requires confirm_write=true.",
    inputSchema: { trigger_uuid: z.string().min(1), branch: z.string().optional(), tag: z.string().optional(), confirm_write: z.boolean().optional() },
  }, async ({ trigger_uuid, branch, tag, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => triggerBuild(env, trigger_uuid, { branch, tag }));
  });

  server.registerTool("cloudflare_api_search", {
    description: "Search Cloudflare's official full API MCP OpenAPI catalog.",
    inputSchema: { code: z.string().min(1) },
  }, async ({ code }) => safe(() => searchCloudflareApiMcp(env, code)));

  server.registerTool("cloudflare_api_execute", {
    description: "Execute through Cloudflare's full API MCP. Privileged; requires confirm_write=true.",
    inputSchema: { code: z.string().min(1), confirm_write: z.boolean().optional() },
  }, async ({ code, confirm_write }) => {
    const denied = writeRequired(confirm_write); if (denied) return asToolResult(denied);
    return safe(() => executeCloudflareApiMcp(env, code));
  });

  return server;
}

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function locked() {
  return Response.json({
    error: "gateway_locked",
    message: "MCP_GATEWAY_TOKEN is not configured. The MCP endpoint is intentionally unavailable.",
  }, { status: 503 });
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
        workers_control_configured: workersConfigured(env),
        workers_builds_configured: buildsConfigured(env),
      });
    }

    if (url.pathname !== "/mcp") return Response.json({ error: "not_found" }, { status: 404 });
    if (!env.MCP_GATEWAY_TOKEN) return locked();

    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${env.MCP_GATEWAY_TOKEN}`) return unauthorized();

    const handler = createMcpHandler(() => createServer(env), { legacy: "stateless" });
    return handler(request, env, ctx);
  },
};
