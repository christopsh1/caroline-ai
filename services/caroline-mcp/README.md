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
- `MCP_GATEWAY_TOKEN` is not a direct Cloudflare Worker secret; it is resolved from Infisical through `secrets-gateway` for `WORKER_NAME=caroline-mcp`.
- If the secrets gateway is unavailable, the entrypoint fails closed with `503 secrets_unavailable`.
- If the hydrated `MCP_GATEWAY_TOKEN` is absent, the existing MCP endpoint authorization remains locked.
- Read tools do not require per-call mutation approval.
- Create/edit/delete/cancel/run/configuration tools require `confirm_write=true`.
- The generic `cloudflare_api_execute` surface is always treated as privileged/write-capable.
- Existing Caroline production Workers are not implicitly targeted; every mutation requires an explicit Worker, trigger, build, or connection identifier.

## Runtime credentials

All runtime credentials live in Infisical Development and are delivered through `secrets-gateway` with per-worker scoping. The `caroline-mcp` gateway response may contain the runtime values needed by the control plane, including:

```text
MCP_GATEWAY_TOKEN
CLOUDFLARE_CONTROL_TOKEN
CLOUDFLARE_BUILDS_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Fallback Cloudflare authentication shapes supported by the existing control-plane modules can also be hydrated when explicitly tagged for `caroline-mcp`.

The only two Cloudflare Worker secrets permitted on `caroline-mcp` are:

```text
GATEWAY_TOKEN
GATEWAY_URL
```

`WORKER_NAME=caroline-mcp`, `ENVIRONMENT`, and `CLOUDFLARE_MCP_URL` are non-secret Worker variables.

Keep the runtime credential purposes separate:

- `MCP_GATEWAY_TOKEN` authenticates callers to Caroline MCP.
- `CLOUDFLARE_CONTROL_TOKEN` is used for Workers Scripts management and the official Cloudflare API MCP.
- `CLOUDFLARE_BUILDS_TOKEN` is used only for the Workers Builds REST API.
- `CLOUDFLARE_ACCOUNT_ID` identifies the account.

Do not commit secret values or bulk-upload these runtime credentials directly to the Worker.

## Provisioning

The ordinary deployment workflow is:

```text
.github/workflows/deploy-caroline-mcp.yml
```

It validates the service on pull requests and deploys only `caroline-mcp` after changes land on `main`.

The deployment workflow intentionally does **not** run `wrangler secret bulk` for provider/application/runtime credentials. Before cutover, the live Worker must already have only `GATEWAY_TOKEN` and `GATEWAY_URL` configured as its Cloudflare secrets, and Infisical must have the required `caroline-mcp`-tagged runtime secret set.

Deployment-process Cloudflare credentials used by CI are separate from Worker runtime credentials and must never be uploaded to `caroline-mcp` as runtime secrets.

## Endpoints

- `GET /health` — public service health/status without secret values; the entrypoint first resolves the worker-scoped runtime secret set
- `/mcp` — authenticated stateless Streamable HTTP MCP endpoint

The health response exposes whether the hydrated MCP gateway and Cloudflare control surfaces are configured, but never returns credential values.

## Full Cloudflare API

Two additional tools expose Cloudflare's official API MCP:

- `cloudflare_api_search` — search the API catalog
- `cloudflare_api_execute` — execute API code, requiring `confirm_write=true`

The dedicated Worker/Build tools should be preferred for normal Worker engineering because they have narrower schemas and clearer mutation boundaries.

## Deferred provider adapters

GitHub direct MCP, Railway, ElevenLabs, and Docker remain separate provider adapters for subsequent rollout. GitHub is already usable indirectly by Workers Builds for repository-backed Worker build/deploy once its Cloudflare GitHub installation is connected.
