# Deployment sequence — v3.7

1. Read live Cloudflare Workers, KV, R2, Queues and routes through the authenticated API bridge.
2. Confirm no production `caroline-phone` Worker will be overwritten.
3. Read the live `Caroline_Phone` KV namespace ID.
4. Create/confirm dev R2, Queue and DLQ resources.
5. Bind KV/R2/Queue resources in the development environment first.
6. Register stable ElevenLabs workspace tools for each phone capability; never reuse legacy transient dynamic IDs. Populate `PHONE_TOOL_POLICY_JSON` with those stable IDs. Configure development secrets/config without committing values: runtime key, ElevenLabs webhook secret, core URL/key, tool policy, event-sink URL/key.
7. Deploy or connect a development core runtime that implements signed `/v1/init` and `/v1/retrieve` responses and downstream idempotency.
8. Run `npm run check`; current v3.7 local baseline must pass the complete local contract suite before deployment.
9. Deploy `caroline-phone-dev`.
10. Verify `/health`, authenticated `/status`, `/runtime/init`, `/runtime/retrieve`, signed synthetic ElevenLabs event ingress, R2 staging, Queue consumption, retries, DLQ path, and cleanup.
11. Point only the non-live ElevenLabs `cloudflare-refactor` branch at the development Worker; configure its environment/tool headers and run regression tests.
12. Implement Twilio request validation against the exact Cloudflare callback URL before enabling any Twilio edge route.
13. Change production provider endpoints only after regression success, one route at a time, with rollback values documented.
14. Rotate the Cloudflare setup API token if it was passed as an action parameter.

## v3.5 phone tool registration

Do not register or attach the stable ElevenLabs phone tools until the development Worker is deployed and its exact HTTPS base URL is known. Create separate stable tool documents for the five `/runtime/phone/*` routes and bind `system__conversation_id` into every request body. Do not send caller identity as an authorization credential.

After registration, populate `PHONE_TOOL_POLICY_JSON` with the exact stable tool IDs. Keep the production phone assignment on the current main branch until synthetic init/action regression passes against the development Worker.

## v3.7 blocked-call init gate

Before any provider cutover, verify synthetic `/runtime/init` fixtures for every blocked admission state. Each must return zero custom tool IDs and the edge-owned blocked-call first message, regardless of what `first_message` or restriction detail the core attempts to return. This gate replaces legacy model-only restricted-caller tests as the primary security control.
