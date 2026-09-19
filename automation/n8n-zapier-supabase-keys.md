# n8n + Zapier MCP: Supabase API Key Management

Documents the automation path built to work around the n8n native Supabase credential bug (conflicting `apikey`/`Authorization` headers causing 401/403 errors) using Zapier MCP as the execution layer.

## Background

The built-in n8n Supabase node/credential sends both an `apikey` header and an `Authorization: Bearer <key>` header. Supabase's Kong gateway prioritizes `Authorization` and expects a user JWT there, not a service_role/secret key, causing auth failures even with valid keys. See: https://github.com/n8n-io/n8n/issues/30630 and https://github.com/n8n-io/n8n/issues/17020.

## Setup

1. **Zapier MCP** is connected inside n8n, giving workflows access to Zapier's action catalog, including the generic **Webhooks by Zapier -> Custom Request** action.
2. This bypasses the native Supabase node entirely. Instead of using n8n's Supabase credential type, workflows call Supabase's REST/Management API directly via Zapier's HTTP action, or via n8n's own HTTP Request / Postgres node.

## Supabase Project

- Project name: Caroline
- Project ref: `drsyygxqwxuyoyjbsaqs`
- Region: us-east-1

## Managing API keys via Zapier MCP / Custom Request

To delete a stale/test publishable API key from the Supabase project:

- Method: `DELETE`
- URL: `https://api.supabase.com/v1/projects/drsyygxqwxuyoyjbsaqs/api-keys/{key_id}`
- Header: `Authorization: Bearer {{ $env.SUPABASE_ACCESS_TOKEN }}`

The Supabase personal access token is generated at https://supabase.com/dashboard/account/tokens and stored only as an n8n environment variable / credential -- never hardcoded in workflow JSON or committed to this repo.

## Data API calls (REST/PostgREST)

For calling the project's Data API (tables, RPC) from n8n/Zapier instead of using the native Supabase node:

- URL pattern: `https://drsyygxqwxuyoyjbsaqs.supabase.co/rest/v1/{table}`
- Header: `apikey: {{ $env.SUPABASE_SECRET_KEY }}`
- Do not also set the `Authorization: Bearer` header to the same key -- this re-triggers the JWT-parsing conflict described above. Use `apikey` only for the secret key, or omit `Authorization` entirely.

## Notes

- Never commit the secret key, service_role key, or Supabase personal access token to this repository.
- Legacy `anon`/`service_role` keys remain valid until end of 2026; this project has migrated to `sb_publishable_...` / `sb_secret_...` key format.
- Test/duplicate publishable keys created during n8n troubleshooting (named n8nk, m9nk, m8nk, n8nn, n8nn8n, n8nchristopsh, chrisn8) should be revoked from Settings > API Keys once no longer needed.
