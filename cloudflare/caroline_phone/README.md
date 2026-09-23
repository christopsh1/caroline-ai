# Caroline Phone Edge — Cloudflare v3.10

`caroline-phone` is the authenticated provider/runtime boundary for Caroline.

Current Cloudflare responsibilities:
- validate ElevenLabs, Twilio, and runtime credentials before trusting request data;
- orchestrate call initialization;
- enforce tool/admission/action policy in Worker code;
- persist active call/session truth in the `CarolineSession` Durable Object;
- keep KV non-authoritative and eventually-consistent only;
- stage verified ElevenLabs events in R2 before Queue enqueue;
- expose explicit `PENDING_NEON_INTEGRATION` boundaries for canonical data/actions.

No Neon schema, query, or completed Neon behavior exists in this Worker.

## Fail-closed behavior before Neon
A valid `/runtime/init` request creates/persists a Durable Object session, but canonical identity/permissions are marked pending. The returned ElevenLabs init payload uses `call_answering_status=canonical_pending`, zero custom tools, and a fixed safe unavailable message. This prevents Cloudflare from inventing caller authorization.

## Cloudflare storage placement
See `RUNTIME_STORAGE_MAP.md`.

## Routes
- `GET /health`
- `GET /status` — requires `x-caroline-key`
- `POST /runtime/init`
- `POST /runtime/retrieve`
- `POST /runtime/phone/contact-resolve`
- `POST /runtime/phone/sms`
- `POST /runtime/phone/calendar-read`
- `POST /runtime/phone/hold`
- `POST /runtime/phone/reentry-ack`
- `POST /webhook/elevenlabs`
- `/webhook/twilio*` — signature validation active; business routing disabled

## Required Worker secrets
- `CAROLINE_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`
- `TWILIO_AUTH_TOKEN`

Secret values are never committed. `wrangler.toml` declares required secret names only.
