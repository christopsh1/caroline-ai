# Caroline Cloudflare development wiring

This wiring exists only to prove the refactored phone/runtime spine before choosing the permanent persistence backend.

## Worker topology

ElevenLabs non-live branch -> `caroline-phone-dev` -> `caroline-core-mock-dev`

Post-call webhook -> `caroline-phone-dev` -> R2 staging -> Queue -> `caroline-core-mock-dev/v1/events/elevenlabs`

The mock core is a contract harness, not the future database.

## Shared secret relationships

### `caroline-phone-dev`
- `CAROLINE_RUNTIME_KEY`: authenticates ElevenLabs init/retrieval/action calls to the edge.
- `ELEVENLABS_WEBHOOK_SECRET`: verifies ElevenLabs post-call webhook signatures.
- `CORE_RUNTIME_KEY`: HMAC key for edge <-> core requests/responses.
- `EVENT_SINK_KEY`: separate HMAC key for queued event delivery.
- `CORE_RUNTIME_URL`: HTTPS origin of `caroline-core-mock-dev`.
- `EVENT_SINK_URL`: `${CORE_RUNTIME_URL}/v1/events/elevenlabs`.
- `PHONE_TOOL_POLICY_JSON`: stable ElevenLabs tool IDs by capability bucket after the dev tools are created.

### `caroline-core-mock-dev`
- `CORE_RUNTIME_KEY`: exactly the same development value as the edge.
- `EVENT_SINK_KEY`: exactly the same development value as the edge.
- `MOCK_STATE`: isolated R2 bucket `caroline-core-mock-state-dev`.

Never reuse production secrets in this development pair.

## Edge resource bindings

- KV `CAROLINE_PHONE`: operational receipt metadata only.
- R2 `CAROLINE_PAYLOADS`: `caroline-phone-payloads-dev`.
- Queue producer/consumer `CAROLINE_EVENTS`: `caroline-phone-events-dev`.
- DLQ: `caroline-phone-events-dev-dlq`.

## Deployment order

1. Create/confirm the dev R2 buckets, Queue, DLQ, and `Caroline_Phone` KV namespace.
2. Deploy `caroline-core-mock-dev` with its isolated `MOCK_STATE` R2 binding.
3. Set the mock core's `CORE_RUNTIME_KEY` and `EVENT_SINK_KEY`.
4. Deploy `caroline-phone-dev` with KV/R2/Queue bindings and `CORE_RUNTIME_URL`/`EVENT_SINK_URL` pointing to the mock core.
5. Set edge secrets.
6. Run `/health` and authenticated `/status` checks.
7. Run `npm run smoke:integration` against the edge.
8. Create the stable ElevenLabs dev tools against the edge URL. Every retrieval/action tool must include `system__conversation_id` as `conversation_id`; retrieval also uses `system__caller_id` as `caller_phone`.
9. Put those stable tool IDs into `PHONE_TOOL_POLICY_JSON`, redeploy edge, and rerun smoke tests.
10. Change only the non-live ElevenLabs `cloudflare-refactor` branch initiation/retrieval URLs to the dev edge and run the curated agent regression suite.
11. Do not assign the production phone number or alter Main traffic in this phase.
