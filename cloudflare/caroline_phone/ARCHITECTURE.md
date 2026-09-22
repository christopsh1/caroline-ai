# Caroline Phone Edge Architecture — v3.8

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
`/runtime/retrieve` requires `conversation_id` plus bounded request fields and the allowed interaction modes (`inbound_owner`, `inbound_external`, `outbound`). The conversation ID must be supplied from ElevenLabs' trusted `system__conversation_id`; the core authorizes the retrieval against conversation-bound server state and never trusts caller phone alone. The edge returns only a small sanitized envelope: `authorized`, `context`, and bounded text results. Internal IDs/debug fields are discarded.

## Phone tool capability policy
The init facade selects tools from deployment-time capability buckets rather than trusting core-supplied IDs. Restricted/waitlisted/banned calls receive no custom tools. Admitted inbound calls receive only their verified role bucket plus narrowly conditional hold/calendar/re-entry capabilities. Outbound calls use a separate outbound bucket. Missing or malformed policy fails closed to an empty tool surface.

Stable ElevenLabs workspace tools are required: transient IDs produced by the legacy init path are forbidden as deployment policy because historical calls proved those IDs can disappear and fail call startup.

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
- Twilio signature validation is implemented, but routing remains fail-closed until the downstream call/SMS route is explicitly designed and tested.

## Stable phone-action facade

Version 3.5 replaces transient per-call action tool documents with stable edge endpoints. ElevenLabs tool IDs become deploy-time bindings in `PHONE_TOOL_POLICY_JSON`; capability selection remains driven by verified init context.

Action flow:

1. ElevenLabs calls a stable `/runtime/phone/*` endpoint using the edge runtime secret.
2. The edge validates a narrow per-action schema and requires `conversation_id`.
3. The edge signs the normalized request to the core.
4. The core resolves the authoritative conversation and derives identity/permissions server-side. It must never authorize based on a model-supplied phone number.
5. The core returns a signed response.
6. The edge verifies the signature, strips internal fields, reapplies privacy ceilings, and emits a bounded response.

There is no general-purpose `/proxy` route.

### Defense-in-depth response rules

- Unauthorized SMS always becomes `accepted=false, disposition=rejected`, even if an upstream payload claims `sent`.
- Unauthorized hold always becomes `held=false, state=rejected`.
- Calendar results are field-stripped again at the edge: `busy_only` cannot leak title, description, or location; `title` cannot leak description/location.
- Re-entry responses expose only a bounded acknowledgement message and only after the core confirms the pending one-time state.
- Owner calls never receive the caller-hold tool, preventing accidental self-restriction.

## Twilio validation boundary
Twilio requests are validated against the configured exact HTTPS public origin plus the raw incoming path/query. Form-urlencoded requests are verified using Twilio's HMAC-SHA1 parameter algorithm; JSON requests additionally verify `bodySHA256`. Successful authentication does not activate routing. The handler remains fail-closed until an explicit downstream Twilio call/SMS route is designed.
