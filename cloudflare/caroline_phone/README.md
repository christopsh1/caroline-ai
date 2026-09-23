# Caroline Phone Control Worker

This package implements the phone architecture exactly as defined for the current build:

- Cloudflare is the telephony control layer.
- Twilio remains the PSTN carrier/router.
- ElevenLabs remains the conversational runtime through server-side `POST /v1/convai/twilio/register-call`.
- Active-call truth is persisted per `CallSid` in a SQLite-backed Durable Object.
- KV is not used for identity, permissions, bans, revocation, or active-call truth.
- Supabase is not a runtime dependency.
- Neon is the future canonical backend and is represented only by the explicit pending boundary in `src/canonical.ts`.
- The standalone `cloudflare/` event worker is separate and must remain untouched.

## Routes

All `/twilio/*` routes are POST-only and verify `X-Twilio-Signature` against the exact public request URL and form parameters.

- `POST /twilio/inbound` — inbound PSTN call. AMD is off. Registers the call with ElevenLabs using `direction=inbound` and returns ElevenLabs TwiML directly to Twilio.
- `POST /twilio/outbound` — Twilio's webhook for an already-created outbound PSTN leg. Registers with ElevenLabs using `direction=outbound` and returns ElevenLabs TwiML.
- `POST /twilio/status` — persists lifecycle status to the per-call Durable Object.
- `POST /twilio/amd` — persists asynchronous answering-machine detection result to the per-call Durable Object.
- `GET /health` — non-Twilio health endpoint.

## Outbound Twilio call creation contract

The component that creates an outbound Twilio Call must use these settings:

- `Url = https://<caroline-phone-host>/twilio/outbound`
- `Method = POST`
- `MachineDetection = Enable`
- `AsyncAmd = true`
- `AsyncAmdStatusCallback = https://<caroline-phone-host>/twilio/amd`
- `AsyncAmdStatusCallbackMethod = POST`
- `StatusCallback = https://<caroline-phone-host>/twilio/status`
- `StatusCallbackEvent = initiated, ringing, answered, completed`
- Recording remains off unless a separate approved decision changes it.

Inbound calls do not enable AMD.

## ElevenLabs test target

Register-call currently pins conversation initiation to the existing non-live `cloudflare-refactor` agent branch. That branch already uses the native ElevenLabs model and has the old Supabase initiation fetch disabled. Main is not changed by this package.

The register-call payload includes the full set of dynamic-variable keys currently defined by that branch, but only compact scalar/default values. There is no large history or RAG payload at call start. Canonical identity, permissions, relationships, admission/ban state, memory/RAG context, availability, and outbound briefs remain pending Neon integration.

Because canonical admission data is not built yet, this package is not a claim of full ban/owner/contact parity. That is a production-cutover parity gate, not something to fake with KV or D1.

## Required secrets

Cloudflare Worker secrets:

- `TWILIO_AUTH_TOKEN`
- `ELEVENLABS_API_KEY`

Non-secret Worker vars in `wrangler.toml` select the Caroline agent and the non-live Cloudflare refactor branch used for testing.

## Validation and cutover order

1. Typecheck and run synthetic tests.
2. Dry-run Wrangler config.
3. Deploy `caroline-phone` with required secrets; do not change the Twilio number yet.
4. Verify signed synthetic/integration requests for inbound, outbound, status, AMD, and ElevenLabs register-call/TwiML.
5. Close canonical admission/context parity required for production (Neon boundary).
6. Point the Twilio inbound webhook to `/twilio/inbound`.
7. Verify live routing.
8. Only then remove the native ElevenLabs phone-number path.

## Known ElevenLabs register-call limitation

ElevenLabs documents that the advanced register-call integration does not provide its native call-transfer capability. This package does not redesign around that limitation; it is simply recorded as an explicit architectural tradeoff for later discussion if call transfer becomes a requirement.
