# Caroline Phone Worker

Cloudflare control plane for Twilio voice calls using ElevenLabs' `POST /v1/convai/twilio/register-call` integration.

This Worker is intentionally separate from the existing `caroline-event-worker` package.

## Routes

- `GET /health` — non-secret readiness state.
- `POST /twilio/inbound` — Twilio inbound voice webhook; verifies `X-Twilio-Signature`, stores per-call state, and returns ElevenLabs TwiML.
- `POST /twilio/outbound` — Twilio voice webhook for calls created by the control endpoint; verifies Twilio and returns ElevenLabs TwiML.
- `POST /twilio/status` — verified Twilio call-status callback.
- `POST /twilio/amd` — verified asynchronous answering-machine-detection callback.
- `POST /calls/outbound` — Caroline control-plane endpoint to create an outbound Twilio call. Requires `x-caroline-key`.

## Cloudflare state

`CALL_SESSIONS` is a SQLite-backed Durable Object namespace. Each Twilio `CallSid` gets its own object. Active/important call state is never stored only in process globals or KV.

## Required Worker secrets

Set these in Cloudflare; never commit their values:

- `ELEVENLABS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `CAROLINE_KEY`

`ELEVENLABS_AGENT_ID` is a non-secret Wrangler variable. `AMD_HANGUP_MACHINE` defaults to `false`; machine detection is only enabled for an outbound request when `machine_detection: true` is supplied.

## Safety defaults

Register-call initiation data starts callers as unknown / Tier 0 with no permissions or calendar share. Spoken identity never upgrades authorization. Provider failures return generic TwiML and do not expose internal errors.

## Cutover sequence

1. `npm install`
2. `npm run check`
3. Deploy `caroline-phone` and verify `/health`.
4. Confirm Worker secrets are present.
5. Synthetic signed Twilio webhook tests against the deployed Worker.
6. Confirm ElevenLabs still uses `ulaw_8000` input and output.
7. Replace remaining legacy runtime dependencies in the live ElevenLabs agent before declaring the Cloudflare path backend-independent.
8. Only then point the Twilio voice webhook to `/twilio/inbound`.

No Twilio number webhook is changed by merging this package.
