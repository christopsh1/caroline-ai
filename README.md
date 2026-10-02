# Caroline AI

This repository is a historical/source snapshot for Caroline components that still use it. It is not the deployment authority for Caroline Phone.

## Caroline Phone operations exception

`caroline-phone` is explicitly managed outside repository-hosted deployment automation.

- The live Worker is managed directly in Cloudflare.
- Deployment is through Cloudflare Dashboard/Quick Edit or a standalone local Wrangler copy.
- Cloudflare Worker Secrets and dashboard-managed bindings/variables are authoritative for the Worker runtime.
- Twilio Console, ElevenLabs dashboard/API, and the database provider remain authoritative for their respective production configuration.
- No push, branch, pull request, hosted CI workflow, repository secret, or repository-connected Cloudflare Build is part of the Caroline Phone deployment path.
- Standalone Caroline Phone source backups should be stored outside any Git working tree and must not contain secret values.

The copy under `cloudflare/caroline_phone/` is transitional/reference material only and must not be treated as an automatic production source.

## Initial authority model for legacy snapshot material

- ElevenLabs and Supabase production remain authoritative for the original import.
- The baseline is observational unless a component-specific runbook explicitly states otherwise.
- Runtime table rows, conversation transcripts, call recordings, and secret values are intentionally excluded.
- Secret references and environment-variable names are retained where needed for documentation.

## Snapshot contents

- `elevenlabs/agent.json` — historical Caroline agent snapshot.
- `elevenlabs/branches.json` — historical branch inventory and traffic allocation snapshot.
- `elevenlabs/tools/` — historical workspace tool definitions.
- `elevenlabs/knowledge/` — historical knowledge-base snapshot.
- `elevenlabs/procedures/` — historical procedure snapshot.
- `elevenlabs/tests/` — historical ElevenLabs test snapshot.
- `supabase/functions/` — legacy Edge Function source snapshot.
- `supabase/catalog/` — legacy schema and metadata snapshot.
- `supabase/types/database.types.ts` — generated TypeScript database types snapshot.

## Production identifiers

- ElevenLabs inbound agent: `agent_8001m2ba4rmder6t7wq270ntj43j`
- ElevenLabs inbound Main branch: `agtbrch_0301m2ba4v10exarksax30ye678x`
- Supabase project: `drsyygxqwxuyoyjbsaqs`
- Original snapshot date: `2026-09-18` UTC

## Safety

Do not automatically apply snapshot files to production. For Caroline Phone specifically, follow `cloudflare/caroline_phone/README.md` and use direct Cloudflare deployment only.

## Tooling references

- [OpenCode + GitHub Copilot](docs/tooling/opencode-copilot.md) — Marketplace integration, setup notes, and Caroline-specific usage guidance.
- [Desktop Commander MCP](docs/tooling/desktop-commander.md) — terminal/filesystem MCP, remote-device access, setup notes, and Caroline operations guidance.

## Cloudflare MCP

The project-level `.mcp.json` remains a development convenience for other Caroline work. It is not part of the Caroline Phone production runtime or deployment path.

## Context7 MCP

`.mcp.json` also declares a `context7` server pointing at the official remote endpoint `https://mcp.context7.com/mcp`, giving MCP-aware tools (for example `resolve-library-id` and `query-docs`) live access to up-to-date library and GitHub repo documentation. Replace the `Authorization` header placeholder in `.mcp.json` with your own Context7 API key formatted as an HTTP bearer credential, and never commit a real key. This repo file cannot configure a separate tool's personal config (such as Codex CLI's `~/.codex/config.toml`, which lives on your own machine outside this repository) — set that up locally yourself, using the same URL and header shown here.
