# Caroline Phone Edge Architecture — v3.3

## Role
`caroline-phone` is Caroline's provider security, runtime-facade, and transport boundary. It is not the memory store, business database, owner UI, or conversational brain.

## Runtime facade
Two synchronous, latency-sensitive endpoints sit in front of the future Caroline core:

- `POST /runtime/init` — ElevenLabs conversation-init context.
- `POST /runtime/retrieve` — authorized contextual retrieval.

Both require `x-caroline-key`. The edge calls a backend-neutral `CORE_RUNTIME_URL` over HTTPS and signs every request with `CORE_RUNTIME_KEY`. The core must sign every successful response with the same Caroline HMAC contract; unsigned, stale, oversized, malformed, or non-HTTPS responses fail closed.

### Init trust boundary
The core does **not** get arbitrary control of ElevenLabs configuration. Cloudflare:

1. accepts only the documented init request shape;
2. forwards it to `/v1/init` on the core;
3. whitelists Caroline's known dynamic variables and fills missing values with privacy-safe defaults;
4. derives phone role from the returned verified identity/access variables;
5. chooses tool IDs from edge-owned `PHONE_TOOL_POLICY_JSON`;
6. permits only a bounded `first_message` override;
7. emits the exact ElevenLabs `conversation_initiation_client_data` shape under 256 KiB.

The core cannot inject a replacement prompt, LLM, arbitrary tool IDs, credentials, or internal fields through the init response.

### Retrieval trust boundary
`/runtime/retrieve` validates bounded request fields and the allowed interaction modes (`inbound_owner`, `inbound_external`, `outbound`). The core remains responsible for identity/scope authorization. The edge returns only a small sanitized envelope: `authorized`, `context`, and bounded text results. Internal IDs/debug fields are discarded.

## LLM path
The non-live ElevenLabs refactor branch uses ElevenLabs-hosted GPT-5.6 Terra with a native fallback rather than the old custom-LLM proxy. Cloudflare is intentionally not in the token-stream path.

## ElevenLabs event ingress
1. enforce POST + JSON and a 2 MiB body cap;
2. verify `ElevenLabs-Signature` against the raw body before parsing;
3. derive a deterministic `event_id` and Caroline-owned envelope;
4. persist the full envelope to strongly consistent R2;
5. enqueue only a small pointer on Cloudflare Queues;
6. return HTTP 200 after R2 persistence + successful enqueue.

## Async delivery
The Queue consumer reads R2, verifies SHA-256 against the queued pointer, validates envelope identity, signs the edge-to-sink body, and delivers it over HTTPS. Failures call `retry()` and can flow to a configured DLQ. The R2 object is deleted only after confirmed downstream delivery.

## Storage semantics
- R2: durable short-lived raw event-envelope staging.
- Queue: pointer/retry transport only; never full transcripts.
- KV `Caroline_Phone`: non-sensitive successful-delivery receipt metadata only; not exact-once authority.
- downstream/core: must be idempotent by `event_id`.

## Security invariants
- no raw payload logging;
- no generic proxy or arbitrary webhook endpoint;
- no database service-role credential in the Worker;
- provider auth before JSON trust;
- edge↔core requests and successful responses are mutually HMAC authenticated;
- tool exposure is edge policy, not backend suggestion;
- Twilio remains fail-closed until exact public callback validation is implemented.
