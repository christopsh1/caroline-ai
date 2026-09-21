# Caroline Phone Edge (Cloudflare)

Cloudflare Worker for Caroline's phone edge. This package is intentionally independent of any database vendor.

## Current scope

- Public health endpoint.
- Authenticated status endpoint.
- ElevenLabs webhook ingress with HMAC-SHA256 verification and timestamp validation.
- Optional short-lived receipt metadata in the Cloudflare KV namespace `Caroline_Phone` after successful downstream delivery.
- Fail-closed Twilio route until the exact Cloudflare callback URL and official Twilio request validation are configured.
- No generic arbitrary webhook route.
- No generic database/service-role proxy.
- No notification system competing with Caroline's owner control plane.
- No Supabase or Neon dependency.

## Routes

- `GET /health`
- `GET /status` — requires `x-caroline-key`
- `POST /webhook/elevenlabs`
- `/webhook/twilio*` — intentionally returns 503 until enabled safely

## Required secrets

- `CAROLINE_RUNTIME_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`

## Optional downstream delivery secrets/config

- `EVENT_SINK_URL`
- `EVENT_SINK_KEY`

`EVENT_SINK_URL` is deliberately unset until the replacement backend contract is chosen. The Worker does not acknowledge a verified ElevenLabs event as successful when there is no configured sink.

## KV

Bind the live namespace named `Caroline_Phone` to the Worker using the binding name `CAROLINE_PHONE`. Do not guess the namespace ID. The Worker stores only receipt metadata and a SHA-256 body hash for deduplication; it does not place raw transcripts or webhook headers into KV.

## Deploy gate

Do not wire production Twilio or ElevenLabs endpoints to this Worker until the development deployment is verified and the downstream event sink is configured.
