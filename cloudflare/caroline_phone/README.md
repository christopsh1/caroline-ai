# Caroline Phone Edge (Cloudflare) v3.2

A provider-authenticated, backend-neutral Cloudflare edge for Caroline.

## Runtime path
`ElevenLabs -> HMAC verify -> R2 stage -> Queue pointer -> consumer -> Caroline HMAC -> event sink`

The queue never contains the full transcript/event payload. Full envelopes are staged in R2 and deleted only after confirmed downstream delivery.

## Routes
- `GET /health`
- `GET /status` — `x-caroline-key`
- `POST /webhook/elevenlabs`
- `/webhook/twilio*` — deliberately fail-closed

## Required runtime resources
- KV binding `CAROLINE_PHONE` (receipt metadata)
- R2 binding `CAROLINE_PAYLOADS`
- Queue producer binding `CAROLINE_EVENTS`
- Queue consumer for `caroline-phone-events`
- DLQ `caroline-phone-events-dlq`

## Required secrets
- `CAROLINE_RUNTIME_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`
- `EVENT_SINK_URL`
- `EVENT_SINK_KEY`

Twilio remains gated behind `TWILIO_AUTH_TOKEN` and `TWILIO_PUBLIC_BASE_URL` plus a completed validator.
