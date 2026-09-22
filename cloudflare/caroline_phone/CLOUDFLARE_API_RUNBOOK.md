# Cloudflare API Runbook — Caroline Phone

This runbook is for the authenticated `cloudflare_api_request` bridge. Keep the API token in the connected action/secret layer; never commit or log it.

Use `$ACCOUNT_ID` as the account identifier supplied by the connected Cloudflare account.

## Phase 1 — read-only inventory

Run these first and save the returned IDs/names before creating anything.

1. Workers
   - `GET accounts/$ACCOUNT_ID/workers/scripts`
2. KV namespaces
   - `GET accounts/$ACCOUNT_ID/storage/kv/namespaces`
   - Find the existing namespace whose title is exactly `Caroline_Phone` and record its ID.
3. R2 buckets
   - `GET accounts/$ACCOUNT_ID/r2/buckets`
4. Queues
   - `GET accounts/$ACCOUNT_ID/queues`

Expected before first deployment:
- no production `caroline-phone` Worker unless explicitly created after this runbook;
- an existing `Caroline_Phone` KV namespace may already exist;
- dev R2/Queue/DLQ resources may or may not exist.

Never create a second `Caroline_Phone` namespace if the exact title already exists.

## Phase 2 — create only missing development resources

### R2 payload bucket

If missing:
- `POST accounts/$ACCOUNT_ID/r2/buckets`
- JSON body:
```json
{
  "name": "caroline-phone-payloads-dev"
}
```

### Development event queue

If missing:
- `POST accounts/$ACCOUNT_ID/queues`
- JSON body:
```json
{
  "queue_name": "caroline-phone-events-dev"
}
```

### Development dead-letter queue

If missing:
- `POST accounts/$ACCOUNT_ID/queues`
- JSON body:
```json
{
  "queue_name": "caroline-phone-events-dev-dlq"
}
```

Re-list R2 and Queues after creation and record the authoritative returned names/IDs.

## Phase 3 — update development Wrangler bindings

Only after inventory is confirmed, set the development bindings in `wrangler.toml`:

```toml
[[env.dev.kv_namespaces]]
binding = "CAROLINE_PHONE"
id = "<CONFIRMED_CAROLINE_PHONE_KV_ID>"

[[env.dev.r2_buckets]]
binding = "CAROLINE_PAYLOADS"
bucket_name = "caroline-phone-payloads-dev"

[[env.dev.queues.producers]]
binding = "CAROLINE_EVENTS"
queue = "caroline-phone-events-dev"

[[env.dev.queues.consumers]]
queue = "caroline-phone-events-dev"
max_batch_size = 5
max_batch_timeout = 2
max_retries = 5
dead_letter_queue = "caroline-phone-events-dev-dlq"
retry_delay = 30
```

Do not uncomment or populate production bindings during the development deployment.

## Phase 4 — development Worker deployment

Target Worker name: `caroline-phone-dev`.

Preferred deployment path is the checked-in Wrangler project so module uploads, bindings, Queue consumer configuration, compatibility date, and source maps remain source-controlled together. Do not manually upload a one-off Worker body through the API unless Wrangler/Git-backed deployment is unavailable.

After deployment, verify:
- `GET accounts/$ACCOUNT_ID/workers/scripts` contains `caroline-phone-dev`;
- `GET accounts/$ACCOUNT_ID/workers/scripts/caroline-phone-dev/subdomain` confirms the development Worker exposure needed for testing;
- no `caroline-phone` production Worker was modified.

## Phase 5 — runtime configuration

Development configuration must be supplied outside Git:
- `CAROLINE_RUNTIME_KEY`
- `CORE_RUNTIME_URL`
- `CORE_RUNTIME_KEY`
- `PHONE_TOOL_POLICY_JSON`
- `ELEVENLABS_WEBHOOK_SECRET`
- `EVENT_SINK_URL`
- `EVENT_SINK_KEY`

Twilio remains disabled:
- `TWILIO_INGRESS_ENABLED=false`
- do not configure a production Twilio callback yet.

## Phase 6 — development smoke order

Once the development HTTPS URL exists:
1. `GET /health` → service `caroline_phone`, release `3.6.0`.
2. `GET /status` without runtime key → `401`.
3. `GET /status` with runtime key → runtime/config readiness only; no secret values.
4. Synthetic `/runtime/init` allowed caller → only capability-policy tool IDs.
5. Synthetic `/runtime/init` restricted/banned/waitlisted caller → zero custom tools + edge-owned blocked-call first message.
6. Synthetic `/runtime/retrieve` → signed/sanitized response only.
7. Synthetic ElevenLabs webhook with invalid HMAC → reject.
8. Synthetic ElevenLabs webhook with valid HMAC → stage in R2 and enqueue pointer.
9. Queue consumer success → downstream delivery acknowledged and staged payload removed.
10. Queue consumer failure → retry; after configured retries, DLQ behavior verified.
11. KV contains receipt/operational metadata only, never raw transcript payloads.

## Phase 7 — ElevenLabs development wiring

Only after the development Worker URL passes the smoke sequence:
- register the five stable phone tools from `config/phone-action-contracts.example.json`;
- capture their exact stable ElevenLabs tool IDs;
- build `PHONE_TOOL_POLICY_JSON` from those IDs;
- update only the non-live `cloudflare-refactor` branch initiation/retrieval URLs to the dev Worker;
- run the curated vendor-neutral regression set plus the new `CLOUDFLARE REFACTOR — Verified personal register` test.

Do not move the production phone assignment or Main branch traffic during this phase.

## Phase 8 — Twilio later

Twilio ingress remains fail-closed until the exact public Cloudflare callback URL exists and official Twilio request-signature validation is implemented against that exact externally visible URL.

## Production gate

Production resources (`caroline-phone-payloads`, `caroline-phone-events`, `caroline-phone-events-dlq`, `caroline-phone`) are not created or wired merely because development succeeds. Create them only during the explicit production-cutover phase, with rollback endpoints documented first.
