# Caroline Phone Edge (Cloudflare) v3.7

Backend-neutral Cloudflare edge and runtime facade for Caroline.

## Synchronous runtime path
`ElevenLabs -> x-caroline-key -> Cloudflare validation/policy -> Caroline HMAC -> core runtime`

Routes:
- `POST /runtime/init`
- `POST /runtime/retrieve` — requires trusted `system__conversation_id` plus caller phone/mode; the core authorizes against conversation-bound state.

The core is reached through `CORE_RUNTIME_URL`; both directions are authenticated with `CORE_RUNTIME_KEY`. Init data is whitelisted and phone tools are selected from `PHONE_TOOL_POLICY_JSON` at the edge.

## Async event path
`ElevenLabs -> HMAC verify -> R2 stage -> Queue pointer -> consumer -> Caroline HMAC -> event sink`

The queue never contains the full transcript/event payload. Full envelopes are staged in R2 and deleted only after confirmed downstream delivery.

## Other routes
- `GET /health`
- `GET /status` — requires `x-caroline-key`
- `POST /webhook/elevenlabs`
- `/webhook/twilio*` — deliberately fail-closed

## Required runtime configuration
- `CAROLINE_RUNTIME_KEY`
- `CORE_RUNTIME_URL` — HTTPS base origin for the replacement core
- `CORE_RUNTIME_KEY`
- `PHONE_TOOL_POLICY_JSON`
- `ELEVENLABS_WEBHOOK_SECRET`
- `EVENT_SINK_URL`
- `EVENT_SINK_KEY`
- KV binding `CAROLINE_PHONE`
- R2 binding `CAROLINE_PAYLOADS`
- Queue producer binding `CAROLINE_EVENTS`

Twilio remains gated behind `TWILIO_AUTH_TOKEN` and `TWILIO_PUBLIC_BASE_URL` plus a completed validator.

## Phone tool policy
The init facade uses composable least-privilege capability buckets. See `PHONE_TOOL_POLICY.md` and `config/phone-tool-policy.example.json`. Restricted/waitlisted/banned calls receive zero custom tools; calendar and re-entry tools are conditional.

### Stable phone actions (v3.5)

The edge now exposes five narrow action contracts under `/runtime/phone/*`: contact resolution, owner SMS, permission-aware calendar read, caller hold, and one-time re-entry acknowledgement. These routes are deliberately not a generic proxy. All require edge authentication, bounded JSON bodies, a `conversation_id`, a signed core response, and response sanitization.

The core authorization contract is conversation-bound: it must derive caller identity and permissions from authoritative server-side state keyed by `conversation_id`. Model-supplied phone/identity fields are never sufficient authorization.

## Deterministic blocked-call admission (v3.7)

Call admission is enforced at the Cloudflare initialization boundary, before the model receives a custom tool surface. If the core returns `restricted`, `restricted_by_owner`, `banned`, or `waitlisted`, the edge forces an empty custom-tool list and replaces any backend-supplied first message with fixed minimal Caroline-owned wording. Internal restriction reasons are never spoken automatically, and the edge does not claim that Chris was notified unless a future explicit contract proves that fact.

This is defense in depth: the ElevenLabs prompt still respects admission state, but privacy does not depend on the model remembering that rule.
