# Caroline MCP Control Plane

A Cloudflare Worker exposing one authenticated MCP endpoint for Caroline with an explicit, policy-controlled Cloudflare management surface.

## v0.1 Worker management surface

The first version can manage Worker source as well as Git-backed Cloudflare Workers Builds.

### Direct Worker operations

- `cloudflare_workers_list` — list Workers
- `cloudflare_worker_get_settings` — read Worker settings/bindings
- `cloudflare_worker_read_code` — read deployed code/bundle
- `cloudflare_worker_deploy_code` — create/replace a single-module Worker
- `cloudflare_worker_deploy_modules` — create/replace a multi-file Worker upload
- `cloudflare_worker_delete` — delete a Worker

### Workers Builds operations

- `cloudflare_builds_list` — list builds, optionally by Worker tag
- `cloudflare_build_logs` — read build logs
- `cloudflare_build_cancel` — cancel a build
- `cloudflare_build_tokens_list` / `cloudflare_build_token_create`
- `cloudflare_builds_github_installations`
- `cloudflare_builds_github_repositories`
- `cloudflare_builds_repo_connections_list`
- `cloudflare_builds_repo_connection_create` / `cloudflare_builds_repo_connection_delete`
- `cloudflare_worker_build_triggers_list`
- `cloudflare_worker_build_trigger_create`
- `cloudflare_worker_build_trigger_update`
- `cloudflare_worker_build_trigger_delete`
- `cloudflare_worker_build_run`

A normal Git-backed lifecycle is therefore:

```text
GitHub repository
  -> Cloudflare repo connection
  -> Worker build trigger
  -> build command
  -> deploy command
  -> build record/logs
  -> production Worker
```

The direct module deploy path remains useful for small generated Workers that do not need npm/TypeScript compilation. Full projects with package dependencies should use Workers Builds.

## Safety model

- `/mcp` requires `Authorization: Bearer <MCP_GATEWAY_TOKEN>`.
- If `MCP_GATEWAY_TOKEN` is not present, the MCP endpoint fails closed with `503 gateway_locked`.
- Read tools do not require per-call mutation approval.
- Create/edit/delete/cancel/run/configuration tools require `confirm_write=true`.
- The generic `cloudflare_api_execute` surface is always treated as privileged/write-capable.
- Existing Caroline production Workers are not implicitly targeted; every mutation requires an explicit Worker, trigger, build, or connection identifier.

## Runtime credentials

The deployed Worker expects four runtime values:

```text
MCP_GATEWAY_TOKEN
CLOUDFLARE_CONTROL_TOKEN
CLOUDFLARE_BUILDS_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Keep the tokens separate:

- `MCP_GATEWAY_TOKEN` authenticates callers to Caroline MCP.
- `CLOUDFLARE_CONTROL_TOKEN` is used for Workers Scripts management and the official Cloudflare API MCP.
- `CLOUDFLARE_BUILDS_TOKEN` is used only for the Workers Builds REST API. Give it Workers Builds configuration permissions and, when GitHub installation discovery is needed, the user-scoped permission required by Cloudflare.
- `CLOUDFLARE_ACCOUNT_ID` identifies the account and is supplied to the runtime without hard-coding it into source.

Do not commit token values.

## Provisioning

The ordinary deployment workflow is:

```text
.github/workflows/deploy-caroline-mcp.yml
```

It validates the service on pull requests and deploys only `caroline-mcp` after changes land on `main`.

Dedicated runtime secrets are provisioned by:

```text
.github/workflows/provision-caroline-mcp-runtime.yml
```

That workflow intentionally refuses to run if any dedicated runtime secret is missing and then deploys `caroline-mcp` with those Worker secrets. It does not reuse `CLOUDFLARE_API_TOKEN` as the runtime management token.

## Endpoints

- `GET /health` — public service health/status without secret values
- `/mcp` — authenticated stateless Streamable HTTP MCP endpoint

The health response exposes whether the gateway, Workers control token, and Workers Builds token are configured, but never returns their values.

## Full Cloudflare API

Two additional tools expose Cloudflare's official API MCP:

- `cloudflare_api_search` — search the API catalog
- `cloudflare_api_execute` — execute API code, requiring `confirm_write=true`

The dedicated Worker/Build tools should be preferred for normal Worker engineering because they have narrower schemas and clearer mutation boundaries.

## Deferred provider adapters

GitHub direct MCP, Railway, ElevenLabs, and Docker remain separate provider adapters for subsequent rollout. GitHub is already usable indirectly by Workers Builds for repository-backed Worker build/deploy once its Cloudflare GitHub installation is connected.
