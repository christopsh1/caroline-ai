# Caroline Phone — Cloudflare Runtime/Storage Map v3.10

This file is the authoritative placement map for the Cloudflare layer while Neon is not built.

## Worker code — authoritative behavior
The Worker owns deterministic security and orchestration logic:
- request method/content-type/body-size validation;
- `x-caroline-key`, ElevenLabs HMAC, and Twilio signature validation;
- call-init orchestration;
- safe default/fail-closed behavior;
- role/action/tool-policy enforcement;
- response sanitization;
- R2-before-Queue event capture.

Security-sensitive behavior is code, not KV.

## Durable Object memory — cache only
No behavior depends on in-memory-only fields. A Durable Object instance may be warm, but eviction/restart cannot erase required call state because every authoritative session mutation is written to Durable Object storage.

## Durable Object storage — active-call truth
Binding: `CAROLINE_SESSIONS`
Class: `CarolineSession`
Storage backend: SQLite-backed Durable Object.
Object name: `conversation:<conversation_id>`.

Persisted session snapshot includes:
- conversation ID and interaction mode;
- hashed caller binding (never raw caller identity in session storage);
- verified role/identity/access snapshot when canonical integration exists;
- call-admission state;
- permission snapshot;
- granted tool IDs;
- current-session hold state;
- re-entry state;
- canonical-integration status;
- creation/update timestamps.

This is the only Cloudflare store allowed to act as active-call truth.

## Workers KV — non-critical only
Binding: `Caroline_Phone`
Namespace ID: `85679a0030e846ee931226aa1a6e6332`.

Allowed uses:
- non-critical cache/config metadata;
- diagnostic delivery-receipt cache;
- best-effort aggregate security telemetry.

Forbidden uses:
- caller identity authority;
- permission or revocation authority;
- active-call/session truth;
- exactly-once/idempotency authority;
- ban/re-entry truth.

KV values never authorize or deny a call/action.

## R2 — verified event payload staging
Binding: `CAROLINE_PAYLOADS`.
A verified ElevenLabs envelope is written to R2 before its Queue pointer is sent. Payloads remain in R2 until canonical downstream delivery succeeds. While Neon delivery is pending, Queue retries do not delete the R2 object.

## Queue — pointer/retry transport
Binding: `CAROLINE_EVENTS`.
Queue messages contain only an event pointer and integrity hash, never the full transcript payload. Failed canonical delivery is retryable and can reach the configured DLQ; R2 remains the payload source.

## PENDING_NEON_INTEGRATION boundaries
The following functions intentionally return `PENDING_NEON_INTEGRATION` and contain no fake data/query behavior:
- `getCanonicalCallerProfile()`
- `getCanonicalPermissions()`
- `getCanonicalRagContext()`
- `loadCanonicalConfig()`
- `resolveCanonicalContact()`
- `sendCanonicalSms()`
- `getCanonicalCalendar()`
- `deliverCanonicalEvent()`

Until those adapters are implemented against the real Neon system, `/runtime/init` persists a fail-closed session and returns a fixed unavailable message with zero custom tools. Retrieval and canonical phone actions do not pretend data exists.
