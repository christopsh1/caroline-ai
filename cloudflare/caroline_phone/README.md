# Caroline Phone Edge (Cloudflare) v3.4

Backend-neutral Cloudflare edge and runtime facade for Caroline.

## Synchronous runtime path
`ElevenLabs -> x-caroline-key -> Cloudflare validation/policy -> Caroline HMAC -> core runtime`

Routes:
- `POST /runtime/init`
- `POST /runtime/retrieve`

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
