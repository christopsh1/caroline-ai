# Caroline MCP Control Plane

A Cloudflare Worker that exposes one authenticated MCP endpoint for Caroline and presents a small, policy-controlled capability surface instead of directly exposing every upstream provider tool.

## Current state

Version `0.1.0` is intentionally fail-closed at the gateway, but Cloudflare Worker management is implemented in the first release.

- Streamable HTTP MCP endpoint: `/mcp`
- Health endpoint: `/health`
- Authentication: bearer token from the Worker secret `MCP_GATEWAY_TOKEN`
- Execution policy: deny by default; explicit confirmation for writes
- Cloudflare Worker list/read/settings operations: implemented
- Cloudflare Worker create/update code deployment: implemented and write-gated
- Cloudflare Worker delete: implemented and write-gated
- Official Cloudflare API MCP `search` pass-through: implemented
- Official Cloudflare API MCP `execute` pass-through: implemented and privileged/write-gated
- GitHub, Railway, ElevenLabs, and Docker adapters remain registered for later connection

If `MCP_GATEWAY_TOKEN` is missing, `/mcp` returns `503 gateway_locked`. This makes an accidental deployment safe by default.

## MCP tools

Core tools:

- `caroline_system_status`
- `caroline_capabilities_search`
- `caroline_capabilities_describe`
- `caroline_capabilities_execute`

Cloudflare tools:

- `cloudflare_workers_list`
- `cloudflare_worker_get_settings`
- `cloudflare_worker_read_code`
- `cloudflare_worker_deploy_code`
- `cloudflare_worker_delete`
- `cloudflare_api_search`
- `cloudflare_api_execute`

The capability registry exposes the same Cloudflare operations under IDs such as `cloudflare.workers.read_code`, `cloudflare.workers.deploy_code`, `cloudflare.api.search`, and `cloudflare.api.execute`.

## Cloudflare permissions

The Worker expects these runtime secrets:

```text
MCP_GATEWAY_TOKEN
CLOUDFLARE_CONTROL_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`CLOUDFLARE_CONTROL_TOKEN` is intentionally separate from the GitHub Actions deployment token. Give it only the Cloudflare permissions you want Caroline to have. For Worker management, it needs the relevant Workers Scripts read/edit permissions. Broader permissions expand what the `cloudflare_api_search` / `cloudflare_api_execute` path can access.

Cloudflare's official API MCP is called at:

```text
https://mcp.cloudflare.com/mcp
```

and receives the control token as a bearer token. That upstream exposes Cloudflare's API through its `search` and `execute` tools.

## Deploy

The repository workflow `.github/workflows/deploy-caroline-mcp.yml` deploys only this service when files under `services/caroline-mcp/**` change. It reuses the repository's existing GitHub Actions deployment credentials to deploy the Worker, but it does not copy those credentials into the running Worker.

Set the gateway secret:

```bash
cd services/caroline-mcp
npx wrangler secret put MCP_GATEWAY_TOKEN
```

Set the Cloudflare runtime control token:

```bash
npx wrangler secret put CLOUDFLARE_CONTROL_TOKEN
```

Set the account ID as a secret or environment variable available to the Worker:

```bash
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

Use a long random `MCP_GATEWAY_TOKEN` and send it to the MCP endpoint as:

```text
Authorization: Bearer <token>
```

Do not store any runtime token in Git, `wrangler.toml`, or source files.

## Worker code behavior

`cloudflare_worker_deploy_code` creates or replaces a Worker using the stable Workers Scripts upload API. It accepts ES-module JavaScript source, a main module name, compatibility date/flags, and optional bindings metadata. It requires `confirm_write=true`.

`cloudflare_worker_read_code` returns the deployed source or bundle content and its content type. Multi-module/bundled Workers may be returned as multipart content; the read path does not alter it.

For broader Cloudflare operations beyond the dedicated Worker helpers, use `cloudflare_api_search` followed by `cloudflare_api_execute`. The generic execute surface is deliberately confirmation-gated because the official Cloudflare API MCP can reach both read and mutation endpoints depending on the control token's scopes.

## Next provider rollout

1. Verify the Cloudflare Worker tools against a non-production test Worker.
2. Attach Cloudflare Access or another owner identity layer in front of `/mcp`.
3. Connect GitHub read/write adapter.
4. Connect Railway adapter.
5. Connect ElevenLabs adapter.
6. Connect Docker/Fly execution adapter for container-only MCP servers.
