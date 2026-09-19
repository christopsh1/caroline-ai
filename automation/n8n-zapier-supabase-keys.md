# n8n + Zapier MCP: Supabase API Key Management

Documents the automation path built to work around the n8n native Supabase credential bug (conflicting `apikey`/`Authorization` headers causing 401/403 errors) using Zapier MCP as the execution layer.

## Background

The built-in n8n Supabase node/credential sends both an `apikey` header and an `Authorization: Bearer <key>` header. Supabase's Kong gateway prioritizes `Authorization` and expects a user JWT there, not a service_role/secret key, causing auth failures even with valid keys. See: https://github.com/n8n-io/n8n/issues/30630 and https://github.com/n8n-io/n8n/issues/17020.

## Zapier MCP basics

Zapier MCP exposes connected Zapier apps/actions as callable tools to any MCP client. Setup is: create the MCP server on Zapier's side, which issues a unique server URL and credential. Inside n8n, the **MCP Client Tool** node connects to that URL and lists whatever actions were enabled on the Zapier side.

For this project, the relevant Zapier action is the generic **Webhooks by Zapier -> Custom Request** action, which sends arbitrary HTTP requests. This is used because Zapier has no native "delete Supabase API key" action -- the Custom Request action lets the workflow hit Supabase's Management API directly.

MCP servers are additive: n8n can have multiple MCP Client nodes pointed at different servers in the same instance (e.g., Zapier MCP for generic/multi-service actions, plus a separate Twilio MCP server later for Twilio-native operations). Connecting one does not require disconnecting another.

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

## Bulk-delete loop workflow (run once for all leftover keys)

Workflow structure in n8n:

1. **Manual Trigger** (or Schedule Trigger) -- starts the workflow.
2. **Set/Code node** -- holds the key IDs to delete as a JSON array, e.g.:
   ```json
   ["67067d75-4d8e-433f-8355-4b5288ffd78a","e3baf4bf-1bed-470a-ba72-722ebabb7d9e","e98aaddb-62a6-44f5-ac56-96745f1b20f4","1d62ca93-d9f7-4d57-bd19-24c208e6e437","f78565e8-4cfb-4c58-8898-774175178771","8c006604-ec17-4b25-a2d0-0a4fcd828b5c","cc22d84e-8bc9-4792-b309-eabf267426fa"]
   ```
3. **Split Out** node -- turns the array into individual items, one per key ID, so the workflow fans out execution automatically without an explicit loop node.
4. **MCP Client Tool** node (Zapier MCP, Custom Request action) -- configured per item:
   - Method: `DELETE`
   - URL: `https://api.supabase.com/v1/projects/drsyygxqwxuyoyjbsaqs/api-keys/{{ $json.id }}`
   - Header: `Authorization: Bearer {{ $env.SUPABASE_ACCESS_TOKEN }}`

Running this workflow once processes all leftover keys in a single execution.

## Data API calls (REST/PostgREST)

For calling the project's Data API (tables, RPC) from n8n/Zapier instead of using the native Supabase node:

- URL pattern: `https://drsyygxqwxuyoyjbsaqs.supabase.co/rest/v1/{table}`
- Header: `apikey: {{ $env.SUPABASE_SECRET_KEY }}`
- Do not also set the `Authorization: Bearer` header to the same key -- this re-triggers the JWT-parsing conflict described above. Use `apikey` only for the secret key, or omit `Authorization` entirely.

## Notes

- Never commit the secret key, service_role key, Supabase personal access token, or Zapier MCP credentials to this repository.
- Legacy `anon`/`service_role` keys remain valid until end of 2026; this project has migrated to `sb_publishable_...` / `sb_secret_...` key format.
- Test/duplicate publishable keys created during n8n troubleshooting (named n8nk, m9nk, m8nk, n8nn, n8nn8n, n8nchristopsh, chrisn8) are the targets of the bulk-delete workflow above. Delete them once the workflow runs successfully.
- After cleanup, retrieve the project's secret key from Settings > API Keys in the Supabase dashboard for use in n8n's actual data-access workflows (this cannot be retrieved programmatically for security reasons).
