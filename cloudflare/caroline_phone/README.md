# Caroline Phone Edge (Cloudflare)

Cloudflare Worker for Caroline's phone edge. This package is deliberately independent of the database/backend vendor.

## What it is

A narrow security and transport boundary for provider traffic. It authenticates provider requests, normalizes them into a Caroline-owned event contract, signs the edge-to-backend hop, and records non-sensitive delivery receipts.

## Current routes

- `GET /health`
- `GET /status` — requires `x-caroline-key`
- `POST /webhook/elevenlabs` — verified HMAC ingress
- `/webhook/twilio*` — deliberately fail-closed until the Twilio validation gate is completed

## Security posture

- raw provider body is verified before JSON parsing;
- ElevenLabs requests are capped at 256 KiB;
- no raw webhook body or transcript logging;
- no generic proxy or arbitrary webhook route;
- no database service-role credential;
- downstream event delivery requires HTTPS and a Caroline-owned HMAC;
- KV stores receipt metadata only;
- KV is not treated as a strict idempotency primitive.

## Required secrets

- `CAROLINE_RUNTIME_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`

Before downstream delivery is enabled:

- `EVENT_SINK_URL`
- `EVENT_SINK_KEY`

Reserved for the later Twilio gate:

- `TWILIO_AUTH_TOKEN`
- `TWILIO_PUBLIC_BASE_URL`

## Cloudflare KV

Bind the live namespace named `Caroline_Phone` as `CAROLINE_PHONE` after reading its namespace ID through the authenticated Cloudflare API bridge. Do not guess the ID.

KV keys are environment-prefixed and retain only successful-delivery receipt metadata for seven days.

## Development

```bash
npm install
npm run check
npm run dev
```

Development deploy:

```bash
npm run deploy:dev
```

Production deployment remains gated by `DEPLOY.md`.

See `ARCHITECTURE.md` for contracts and invariants.
