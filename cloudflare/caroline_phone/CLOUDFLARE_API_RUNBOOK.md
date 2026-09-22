# Cloudflare API Runbook — Caroline Phone

This runbook covers the development deployment path for the Caroline Cloudflare refactor. Keep Cloudflare API tokens in the connected action/secret layer; never commit or log them.

## Automated development inventory/provisioning

From `cloudflare/caroline_phone`:

```bash
CLOUDFLARE_ACCOUNT_ID=<account> CLOUDFLARE_API_TOKEN=<token> npm run provision:dev
```

This is inventory-only by default. It:
- lists Workers, KV, R2 and Queues;
- requires the existing KV namespace named exactly `Caroline_Phone` and prints its authoritative ID;
- reports missing development resources;
- never creates a substitute KV namespace;
- never touches production resources.

After reviewing the output, create only missing development R2/Queue resources with:

```bash
CLOUDFLARE_ACCOUNT_ID=<account> CLOUDFLARE_API_TOKEN=<token> npm run provision:dev -- --apply
```

The apply mode may create only:
- R2 `caroline-phone-payloads-dev`
- R2 `caroline-core-mock-state-dev`
- Queue `caroline-phone-events-dev`
- Queue/DLQ `caroline-phone-events-dev-dlq`

## Manual API bridge equivalents

If using the authenticated `cloudflare_api_request` bridge directly:

1. Workers: `GET accounts/$ACCOUNT_ID/workers/scripts`
2. KV: `GET accounts/$ACCOUNT_ID/storage/kv/namespaces`
3. R2: `GET accounts/$ACCOUNT_ID/r2/buckets`
4. Queues: `GET accounts/$ACCOUNT_ID/queues`

Find the existing KV namespace whose title is exactly `Caroline_Phone`; do not create a duplicate.

Create only missing dev R2 buckets with `POST accounts/$ACCOUNT_ID/r2/buckets` and body `{"name":"<bucket>"}`. Create only missing queues with `POST accounts/$ACCOUNT_ID/queues` and body `{"queue_name":"<queue>"}`.

## Development bindings

`caroline-core-mock-dev`:

```toml
[[env.dev.r2_buckets]]
binding = "MOCK_STATE"
bucket_name = "caroline-core-mock-state-dev"
```

`caroline-phone-dev`:

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

Do not populate production bindings during the development deployment.

## Deployment order

1. Run read-only inventory/provision preview.
2. Confirm the existing `Caroline_Phone` KV namespace ID.
3. Create only missing dev R2/Queue/DLQ resources.
4. Insert the confirmed bindings in the development Wrangler environments.
5. Deploy `caroline-core-mock-dev` first.
6. Set mock-core secrets: `CORE_RUNTIME_KEY` and `EVENT_SINK_KEY`.
7. Deploy `caroline-phone-dev`.
8. Set edge configuration/secrets outside Git: `CAROLINE_RUNTIME_KEY`, `CORE_RUNTIME_URL`, `CORE_RUNTIME_KEY`, `PHONE_TOOL_POLICY_JSON`, `ELEVENLABS_WEBHOOK_SECRET`, `EVENT_SINK_URL`, `EVENT_SINK_KEY`.
9. Keep `TWILIO_INGRESS_ENABLED=false` until the Twilio routing contract is explicitly enabled.

## Development smoke order — v3.8

Once the development HTTPS URLs exist:
1. `GET /health` on `caroline-phone-dev` → service `caroline_phone`, release `3.8.0`.
2. `GET /status` without runtime key → `401`.
3. `GET /status` with runtime key → readiness metadata only; no secret values.
4. Synthetic `/runtime/init` allowed caller → capability-policy tool IDs only.
5. Synthetic blocked `/runtime/init` → zero custom tools + edge-owned blocked-call first message.
6. Synthetic `/runtime/retrieve` includes trusted `conversation_id` and returns a signed/sanitized response.
7. Run `npm run smoke:integration` against the edge + mock core.
8. Invalid ElevenLabs HMAC → rejected.
9. Valid synthetic ElevenLabs webhook → R2 stage + Queue pointer.
10. Queue consumer success → signed event sink delivery + staged payload cleanup.
11. Queue consumer failure → retry, then DLQ after configured retries.
12. KV contains operational receipt metadata only, never raw transcript payloads.
13. Verify Twilio request-signature validation against the exact dev public URL while routing remains disabled.

## ElevenLabs development wiring

Only after the dev edge passes smoke tests:
- create the five stable workspace phone tools from `config/phone-action-contracts.example.json`;
- bind `system__conversation_id` into every retrieval/action request;
- capture the exact stable tool IDs and populate `PHONE_TOOL_POLICY_JSON`;
- point only the non-live `cloudflare-refactor` branch initiation/retrieval endpoints to `caroline-phone-dev`;
- run the curated vendor-neutral tests plus `CLOUDFLARE REFACTOR — Verified personal register`.

Do not move the production phone assignment or Main traffic during this phase.

## Production gate

Development success does not create or modify production `caroline-phone`, production R2 buckets, production Queues, provider routes, or the live phone assignment. Production cutover is a separate explicit phase with rollback endpoints documented first. Rotate any Cloudflare setup token that was ever passed as a normal action parameter.
