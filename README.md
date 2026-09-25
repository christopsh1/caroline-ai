# Caroline AI

This repository is the source-controlled baseline of the Caroline production system.

## Initial authority model

- ElevenLabs and Supabase production remain authoritative for this initial import.
- The baseline is observational: no production configuration, schema, data, or deployment was changed.
- Runtime table rows, conversation transcripts, call recordings, and secret values are intentionally excluded.
- Secret references and environment-variable names are retained where needed to preserve deployable configuration.

## Snapshot contents

- `elevenlabs/agent.json` — live Caroline agent configuration.
- `elevenlabs/branches.json` — branch inventory and live traffic allocation.
- `elevenlabs/tools/` — workspace tool definitions used by Caroline.
- `elevenlabs/knowledge/` — attached knowledge-base documents.
- `elevenlabs/procedures/` — live main-branch procedures.
- `elevenlabs/tests/` — 145 ElevenLabs test definitions and their paginated index.
- `supabase/functions/` — source for all 28 active Edge Functions.
- `supabase/catalog/` — schema, migration, extension, policy, trigger, index, view, and function metadata.
- `supabase/types/database.types.ts` — generated TypeScript database types.

## Production identifiers

- ElevenLabs agent: `agent_8001m2ba4rmder6t7wq270ntj43j`
- ElevenLabs live branch: `agtbrch_0301m2ba4v10exarksax30ye678x` (Main, 100% live)
- Supabase project: `drsyygxqwxuyoyjbsaqs` (Caroline)
- Snapshot date: `2026-09-18` UTC

## Safety

Do not apply files from this repository to production automatically. Stabilization work should occur on explicit non-production branches and be reviewed before any promotion.

## Secret management

- **Source of truth:** Infisical stores all secret values; this repository stores only secret names/placeholders.
- **Cloudflare deploy sync:** `.github/workflows/deploy-caroline-event-worker.yml` and `.github/workflows/deploy-caroline-phone.yml` load secrets from Infisical at runtime, then deploy with Wrangler using those in-memory values.
- **GitHub bootstrap inputs:** workflows require `INFISICAL_TOKEN` (GitHub secret), `INFISICAL_PROJECT_ID` (GitHub variable), and an environment slug (`workflow_dispatch` input `infisical_env` or `INFISICAL_ENV_SLUG` variable).
- **Cloudflare runtime sync:** Worker runtime secrets are pushed during deploy through Wrangler secret sync (`secrets:`), while non-secret settings remain in `wrangler.toml`.
- **Supabase alignment:** keep Supabase Edge Function secrets in Infisical and sync them via CI/release automation (or controlled manual sync), never by committing secret values.
- **Rotation:** rotate in Infisical first, then trigger the relevant deploy/sync workflow (start in non-production, validate, then promote to production).

## Cloudflare MCP

The repository connects MCP-compatible clients to Cloudflare's full API server through
the project-level [`.mcp.json`](.mcp.json) configuration. The server uses Cloudflare
OAuth, so each developer must complete the browser authorization flow presented by
their MCP client; no API token or account credential is stored in this repository.

Restart or reload the MCP client after cloning, then enable the `cloudflare` server.
Access remains limited to the accounts, zones, and permissions granted during OAuth.
