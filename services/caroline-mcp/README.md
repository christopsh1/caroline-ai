# Caroline MCP Control Plane

A Cloudflare Worker that exposes one authenticated MCP endpoint for Caroline and presents a small, policy-controlled capability surface instead of directly exposing every upstream provider tool.

## Current state

Version `0.1.0` is intentionally fail-closed.

- Streamable HTTP MCP endpoint: `/mcp`
- Health endpoint: `/health`
- Authentication: bearer token from the Cloudflare secret `MCP_GATEWAY_TOKEN`
- Execution policy: deny by default
- Local capabilities enabled: status, search, describe
- Cloudflare, GitHub, Railway, ElevenLabs, and Docker adapters are registered but disabled until their credentials and execution adapters are configured
- Write-class capabilities require explicit owner confirmation at the policy layer

If `MCP_GATEWAY_TOKEN` is missing, `/mcp` returns `503 gateway_locked`. This makes an accidental deployment safe by default.

## MCP tools

- `caroline_system_status`
- `caroline_capabilities_search`
- `caroline_capabilities_describe`
- `caroline_capabilities_execute`

Capability IDs are separate from MCP tool names. Examples include `cloudflare.api.search`, `cloudflare.api.execute`, `github.repo.read`, and `elevenlabs.agent.write`.

## Deploy

The repository workflow `.github/workflows/deploy-caroline-mcp.yml` deploys only this service when files under `services/caroline-mcp/**` change. It reuses the repository's existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub Actions secrets.

Before unlocking the MCP endpoint, create the Worker secret:

```bash
cd services/caroline-mcp
npx wrangler secret put MCP_GATEWAY_TOKEN
```

Use a long random token and send it as:

```text
Authorization: Bearer <token>
```

Do not store the token in Git, `wrangler.toml`, or source files.

## Provider rollout

Provider adapters should be enabled one at a time:

1. Cloudflare API MCP read/search path.
2. Cloudflare writes behind explicit approval.
3. GitHub read/write adapter.
4. Railway adapter.
5. ElevenLabs adapter.
6. Docker/Fly execution adapter for container-only MCP servers.

Each adapter must keep credentials in Worker secrets, enforce per-capability policy, and fail closed when configuration is missing.
