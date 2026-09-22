# Caroline Refactor Test Migration

The Cloudflare refactor deliberately separates durable security/contract tests from legacy backend-specific probes. A red legacy test is not a reason to restore the old persistence architecture.

## Primary tests — keep and expand

### Cloudflare local contract suite
Covers request authentication, signed core traffic, initialization whitelisting, least-privilege tool selection, deterministic blocked-call admission, retrieval sanitization, stable phone actions, R2 staging, Queue pointer delivery, consumer retry/integrity behavior, and payload cleanup. These are the primary runtime security tests.

### ElevenLabs behavior suite
Keep tests that exercise vendor-neutral caller behavior: Tier-0 privacy, verbal-identity non-elevation, calendar disclosure levels, professional/personal registers, persona behavior, ordinary-profanity handling, owner/non-owner SMS discipline, caller-hold warning/exit behavior, and safe fallback behavior.

## Retire or replace

### Legacy Supabase probe tests
Tests whose success depends on `__caroline_regression_probe`, Supabase Edge Function names, Supabase table shapes, or old dynamic tool documents are retired for the new architecture. Recreate their useful security assertions against Cloudflare/core contracts rather than making the refactor emulate Supabase.

### Stale identity fixtures
The old Nikki/Nicole simulation expects a verified personal-contact register but does not inject authoritative verified identity/tier/persona context. It must be replaced with a fixture that explicitly supplies the verified runtime context. Unknown callers must never receive friend-level familiarity merely to satisfy a stale test.

### Restricted-caller model-only fixture
The old restricted-caller simulation starts with the normal agent greeting and relies on the model to notice a variable later. v3.7 moves the primary control to `/runtime/init`: blocked states receive an edge-owned first message and zero custom tools before normal conversation begins. Keep a prompt-level check only as defense in depth.

## Deferred until dev deployment

- Exact Cloudflare HTTPS endpoint smoke tests.
- Stable ElevenLabs phone-tool registration and tool-ID policy binding.
- ElevenLabs initiation/retrieval URL migration to the dev Worker.
- End-to-end signed core integration.
- Twilio signature validation against the exact Cloudflare callback URL.
- Queue retry/DLQ verification against live Cloudflare resources.

## Cutover rule

No legacy test is allowed to force a weaker identity, privacy, or authorization design. Production cutover requires the current Cloudflare contract suite plus a curated vendor-neutral ElevenLabs regression set to pass against the development deployment.

## Replacement personal-register fixture

The clean ElevenLabs test `CLOUDFLARE REFACTOR — Verified personal register` (`test_3401m350e50gfz1tb2qgp67j85m1`) passes on the non-live `cloudflare-refactor` branch. It supplies authoritative verified-personal runtime context and does not pre-start unrelated procedures. Use it in the curated refactor suite instead of the stale personal-register fixture.

- v3.7 adds conversation-bound retrieval: `/runtime/retrieve` rejects any request without `conversation_id`; ElevenLabs retrieval tools must source it from `system__conversation_id`.
