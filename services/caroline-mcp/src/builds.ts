import type { CloudflareEnv } from "./cloudflare";

export type CloudflareBuildsEnv = CloudflareEnv & {
  CLOUDFLARE_BUILDS_TOKEN?: string;
};

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

function requireBuilds(env: CloudflareBuildsEnv) {
  if (!env.CLOUDFLARE_BUILDS_TOKEN) {
    throw new Error("CLOUDFLARE_BUILDS_TOKEN is not configured");
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }
  return {
    token: env.CLOUDFLARE_BUILDS_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  };
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

async function buildsApi(
  env: CloudflareBuildsEnv,
  path: string,
  options: RequestOptions = {},
) {
  const { token, accountId } = requireBuilds(env);
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/builds${path}`,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });
  return parseResponse(response);
}

export function buildsConfigured(env: CloudflareBuildsEnv) {
  return Boolean(env.CLOUDFLARE_BUILDS_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}

export async function listBuilds(
  env: CloudflareBuildsEnv,
  input: { workerTag?: string; page?: number; perPage?: number } = {},
) {
  return buildsApi(env, "/builds", {
    query: {
      worker_tag: input.workerTag,
      page: input.page,
      per_page: input.perPage,
    },
  });
}

export async function getBuildLogs(env: CloudflareBuildsEnv, buildUuid: string) {
  return buildsApi(env, `/builds/${encodeURIComponent(buildUuid)}/logs`);
}

export async function cancelBuild(env: CloudflareBuildsEnv, buildUuid: string) {
  return buildsApi(env, `/builds/${encodeURIComponent(buildUuid)}/cancel`, {
    method: "PUT",
  });
}

export async function listBuildTokens(env: CloudflareBuildsEnv) {
  return buildsApi(env, "/tokens");
}

export async function createBuildToken(env: CloudflareBuildsEnv, name: string) {
  return buildsApi(env, "/tokens", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listGithubInstallations(env: CloudflareBuildsEnv) {
  return buildsApi(env, "/repos/providers/github/installations");
}

export async function listGithubInstallationRepositories(
  env: CloudflareBuildsEnv,
  installationId: string,
) {
  return buildsApi(
    env,
    `/repos/providers/github/installations/${encodeURIComponent(installationId)}/repositories`,
  );
}

export async function listRepoConnections(env: CloudflareBuildsEnv) {
  return buildsApi(env, "/repos/connections");
}

export async function createRepoConnection(
  env: CloudflareBuildsEnv,
  input: {
    providerAccountId: string;
    providerAccountName: string;
    providerRepoId: string;
    providerRepoName: string;
  },
) {
  return buildsApi(env, "/repos/connections", {
    method: "PUT",
    body: JSON.stringify({
      stack: "workers",
      provider_type: "github",
      provider_account_id: input.providerAccountId,
      provider_account_name: input.providerAccountName,
      provider_repo_id: input.providerRepoId,
      provider_repo_name: input.providerRepoName,
    }),
  });
}

export async function deleteRepoConnection(
  env: CloudflareBuildsEnv,
  connectionUuid: string,
) {
  return buildsApi(env, `/repos/connections/${encodeURIComponent(connectionUuid)}`, {
    method: "DELETE",
  });
}

export async function listWorkerBuildTriggers(
  env: CloudflareBuildsEnv,
  workerTag: string,
) {
  return buildsApi(env, `/workers/${encodeURIComponent(workerTag)}/triggers`);
}

export type BuildTriggerInput = {
  repoConnectionUuid: string;
  workerTag: string;
  buildCommand?: string;
  deployCommand?: string;
  rootDir?: string;
  branchIncludes?: string[];
  branchExcludes?: string[];
  buildCachingEnabled?: boolean;
  buildTokenUuid?: string;
  previewBranchIncludes?: string[];
  previewBranchExcludes?: string[];
  previewScriptName?: string;
  previewUrls?: boolean;
};

function buildTriggerBody(input: BuildTriggerInput) {
  const body: Record<string, unknown> = {
    repo_connection_uuid: input.repoConnectionUuid,
    worker_tag: input.workerTag,
    build_command: input.buildCommand ?? "npm run check",
    deploy_command: input.deployCommand ?? "npm run deploy",
    root_dir: input.rootDir ?? "",
    branch_includes: input.branchIncludes ?? ["main"],
    branch_excludes: input.branchExcludes ?? [],
    build_caching_enabled: input.buildCachingEnabled ?? true,
  };
  if (input.buildTokenUuid) body.build_token_uuid = input.buildTokenUuid;
  if (input.previewBranchIncludes) body.preview_branch_includes = input.previewBranchIncludes;
  if (input.previewBranchExcludes) body.preview_branch_excludes = input.previewBranchExcludes;
  if (input.previewScriptName) body.preview_script_name = input.previewScriptName;
  if (input.previewUrls !== undefined) body.preview_urls = input.previewUrls;
  return body;
}

export async function createBuildTrigger(
  env: CloudflareBuildsEnv,
  input: BuildTriggerInput,
) {
  return buildsApi(env, "/triggers", {
    method: "POST",
    body: JSON.stringify(buildTriggerBody(input)),
  });
}

export async function updateBuildTrigger(
  env: CloudflareBuildsEnv,
  triggerUuid: string,
  patch: Partial<BuildTriggerInput>,
) {
  const body: Record<string, unknown> = {};
  if (patch.repoConnectionUuid !== undefined) body.repo_connection_uuid = patch.repoConnectionUuid;
  if (patch.workerTag !== undefined) body.worker_tag = patch.workerTag;
  if (patch.buildCommand !== undefined) body.build_command = patch.buildCommand;
  if (patch.deployCommand !== undefined) body.deploy_command = patch.deployCommand;
  if (patch.rootDir !== undefined) body.root_dir = patch.rootDir;
  if (patch.branchIncludes !== undefined) body.branch_includes = patch.branchIncludes;
  if (patch.branchExcludes !== undefined) body.branch_excludes = patch.branchExcludes;
  if (patch.buildCachingEnabled !== undefined) body.build_caching_enabled = patch.buildCachingEnabled;
  if (patch.buildTokenUuid !== undefined) body.build_token_uuid = patch.buildTokenUuid;
  if (patch.previewBranchIncludes !== undefined) body.preview_branch_includes = patch.previewBranchIncludes;
  if (patch.previewBranchExcludes !== undefined) body.preview_branch_excludes = patch.previewBranchExcludes;
  if (patch.previewScriptName !== undefined) body.preview_script_name = patch.previewScriptName;
  if (patch.previewUrls !== undefined) body.preview_urls = patch.previewUrls;

  return buildsApi(env, `/triggers/${encodeURIComponent(triggerUuid)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteBuildTrigger(
  env: CloudflareBuildsEnv,
  triggerUuid: string,
) {
  return buildsApi(env, `/triggers/${encodeURIComponent(triggerUuid)}`, {
    method: "DELETE",
  });
}

export async function triggerBuild(
  env: CloudflareBuildsEnv,
  triggerUuid: string,
  input: { branch?: string; tag?: string },
) {
  const hasBranch = Boolean(input.branch);
  const hasTag = Boolean(input.tag);
  if (hasBranch === hasTag) {
    throw new Error("Provide exactly one of branch or tag");
  }
  return buildsApi(env, `/triggers/${encodeURIComponent(triggerUuid)}/builds`, {
    method: "POST",
    body: JSON.stringify(input.branch ? { branch: input.branch } : { tag: input.tag }),
  });
}
