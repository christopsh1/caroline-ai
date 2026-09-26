# Caroline Phone — Verified Production State

Date: 2026-09-25 (America/New_York)
Status: PRE-CUTOVER / NOT YET ROUTED FROM TWILIO

This file records only state that was directly verified against the connected providers during the 2026-09-25 production build. It is not a design document and should not be read as evidence for anything not listed here.

## Cloudflare — `caroline-phone`

- Worker exists and is deployed.
- `workers.dev` subdomain is disabled.
- Twilio production routing has not been changed to this Worker.
- Current deployment is version 5:
  - version id: `c0dab331-c3c1-459b-a510-2f0e64893b89`
  - deployment id: `a1492421-6071-42af-96d6-11b7422c9580`
- Previous code-upload deployment is version 2:
  - version id: `a2cd4e94-9130-4d47-abc6-f91eb7c4c739`
  - deployment id: `40e27cd5-0e5c-4c22-bfdc-1deeb64ed0a8`
- Durable Objects are bound:
  - `CALL_SESSION` → class `CallSession`
  - `EVENT_LEDGER` → class `EventLedger`
- Queue producer is bound:
  - `POST_CALL_QUEUE` → `caroline-post-call`
- R2 transcript bucket is bound:
  - `CAROLINE_TRANSCRIPTS` → `caroline-transcripts`
- Observability and invocation logs are enabled.

### Deployed-code architecture audit

The deployed bundle was checked directly and currently contains:

- `/twilio/inbound`
- `/twilio/outbound`
- `/twilio/status`
- `/twilio/amd`
- `/elevenlabs/tools/customer-lookup`
- `/elevenlabs/tools/search-knowledge`
- `/elevenlabs/tools/get-availability`
- `/elevenlabs/tools/prepare-action`
- `/elevenlabs/tools/commit-action`
- `/elevenlabs/tools/transfer`
- `/elevenlabs/webhooks/post-call`
- ElevenLabs native Register Call integration
- OpenAI `text-embedding-3-small` embedding path
- direct Neon HTTP SQL path

The same audit found no deployed references to:

- `/v1/chat/completions`
- `/v1/responses`
- OpenRouter
- Supabase
- Railway
- Infisical
- generic `CAROLINE_BACKEND_*` proxying

This confirms the deployed phone Worker matches the approved runtime boundary: ElevenLabs is the live conversation runtime; Cloudflare is policy/orchestration; OpenAI is embedding-only.

## Cloudflare secret/binding state

Currently bound secret names:

- `ELEVENLABS_TOOL_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`
- `OUTBOUND_ADMIN_TOKEN`

The deployed code also references the following names that were not bound at the checkpoint:

- `DATABASE_URL`
- `ELEVENLABS_API_KEY`
- `OPENAI_EMBEDDINGS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_API_KEY_SID`
- `TWILIO_AUTH_TOKEN`

Do not make the Worker public or route Twilio traffic to it until the required production credential mode is resolved and the effective required bindings are present.

## Post-call Queue

`caroline-post-call` is fully wired:

- producer: `caroline-phone`
- consumer: `caroline-phone`
- batch size: 5
- max retries: 5
- max wait: 5000 ms
- DLQ: `caroline-post-call-dlq`
- verified backlog at checkpoint: 0 messages / 0 bytes

## R2 retention — applied and verified

All four Caroline R2 buckets now have explicit lifecycle expiration rules while preserving the default 7-day multipart-upload abort rule.

- `caroline-events-raw`: delete after 90 days (`7776000` seconds)
- `caroline-transcripts`: delete after 1 year (`31536000` seconds)
- `caroline-artifacts`: delete after 1 year (`31536000` seconds)
- `caroline-media`: delete after 6 months (`15552000` seconds)

## Legacy event-delivery drift — repaired

The architecture spec names a `caroline-event-worker`, but the live producer/handler is actually the existing `caroline-ai` Worker.

Verified live state before repair:

- queue: `caroline-event-delivery`
- producer: `caroline-ai`
- consumer count: 0
- `caroline-ai` exports a compatible queue handler that consumes `event_id`, acknowledges invalid/missing events, marks valid events delivered, and retries exceptions.

Repair applied:

- consumer: `caroline-ai`
- batch size: 10
- max retries: 3
- max wait: 5000 ms
- verified backlog after repair: 0 messages / 0 bytes

No rename was performed. The live Worker remains named `caroline-ai`; documentation should treat `caroline-event-worker` as stale naming until an intentional rename/migration is performed.

## Neon status

Neon remains the hard production database gate.

Verified facts:

- Intended project name in project documentation: `caroline-ai-production`
- Intended database: `caroline_db`
- Intended region: `us-east-1`
- The connected Neon tool is not scoped to a project and cannot currently describe/apply to the intended project.
- A read-only in-place diagnostic was performed against the legacy `DATABASE_URL` already stored on the `caroline-ai` Worker.
- That diagnostic reported `database_target_not_neon`.
- Therefore the legacy Cloudflare database credential must not be reused for the new Caroline Phone system.
- No Caroline Phone Neon migration was applied during this checkpoint.
- Temporary diagnostic Worker code, Queue, KV keys, and D1 diagnostic table were removed after the probe; `caroline-ai` source was restored.

## ElevenLabs tool contracts — reconciled, still detached

The six Caroline webhook tools were audited against the deployed Worker and corrected where needed. They remain detached from the live inbound/outbound agents until Worker authentication and Neon are ready.

### `caroline_prepare_action`

- action types restricted to:
  - `callback_request`
  - `appointment_request`
  - `transfer_request`
- `action_request` is now a structured object instead of a freeform string.
- response assignments preserve hidden confirmation/idempotency variables.

### `caroline_commit_action`

- now includes required constant `confirmed=true`.
- continues to use hidden `prepared_confirmation_token` and `prepared_idempotency_key`.

### `caroline_transfer`

- old `transfer_class` / `reason` direct-transfer contract removed.
- now requires the prepared-action confirmation token and idempotency key plus constant `confirmed=true`.
- no arbitrary destination number is accepted from the model.

### Read-tool response filters

- `caroline_customer_lookup` now exposes `verification_required`.
- `caroline_search_knowledge` now exposes retrieval `status`, including `insufficient_evidence`.
- `caroline_get_availability` now exposes the approved bounded `slots` array.

The connected ElevenLabs management API does not currently expose workspace-secret creation or post-call webhook destination/signing management. Those are provider-control gates and were not bypassed or hard-coded.

## Cutover gates remaining

1. Scope the Neon connector to the actual `caroline-ai-production` project (or otherwise establish the exact approved Neon project identity).
2. Validate the migration on an isolated Neon branch before production application.
3. Apply the production schema and least-privilege runtime role/grants.
4. Bind the correct Neon `DATABASE_URL` to `caroline-phone`.
5. Bind the remaining required ElevenLabs/OpenAI/Twilio credentials using the selected production credential modes.
6. Configure ElevenLabs webhook-tool authentication using a provider-managed secret reference; do not hard-code the token.
7. Configure/verify the ElevenLabs post-call webhook destination and signing secret.
8. Run compile/unit checks and runtime smoke tests against the real bound environment.
9. Enable `caroline-phone` public routing only after the above gates pass.
10. Update the Twilio number/webhooks to the new `/twilio/*` routes and perform controlled inbound/outbound verification.
11. Attach the reconciled ElevenLabs tools only after the Worker is reachable and authenticated.

## Safety / rollback

- `caroline-phone` is private at this checkpoint.
- No Twilio cutover has occurred.
- No ElevenLabs phone-agent tool attachment has occurred.
- No Neon migration has occurred.
- Cloudflare rollback/version identifiers are recorded above.
