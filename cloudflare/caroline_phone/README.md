# caroline-phone

Production Cloudflare Worker for Caroline voice calls using **our own Twilio infrastructure** and ElevenLabs Conversational AI.

## Architecture

- Twilio owns telephony and the phone number.
- Cloudflare Worker owns webhook validation, policy, routing, defensive validation, minimal operational logging, and safe failure behavior.
- ElevenLabs owns the live voice-agent conversation.
- Inbound calls use ElevenLabs `POST /v1/convai/twilio/register-call` and return the resulting TwiML directly to Twilio.
- Outbound calls use ElevenLabs `POST /v1/convai/twilio/outbound-call`.
- No database is required for this version. The status callback boundary is intentionally isolated so persistence can be added later.

## Routes

- `GET /health`
- `POST /twilio/inbound`
- `POST /calls/outbound`
- `POST /twilio/status`

Unknown routes return `404`; unsupported methods on known routes return `405`.

## Runtime secrets

Runtime credentials are read only from the Worker environment. No secret values belong in source, tests, examples, logs, or `wrangler.toml`.

Required by this implementation:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_AGENT_PHONE_NUMBER_ID`
- `TWILIO_AUTH_TOKEN` — Twilio webhook signature verification uses the account Auth Token, not the API Key Secret.
- `OUTBOUND_API_TOKEN` — protects `POST /calls/outbound`. During migration, an existing `CAROLINE_KEY` is accepted as a compatibility fallback when `OUTBOUND_API_TOKEN` is not present.

Existing Twilio account/API-key credentials may remain in Cloudflare for other operations, but this Worker does not use them to originate calls because outbound calls are intentionally created through ElevenLabs.

## Twilio configuration

Configure the Twilio voice number to send inbound voice requests by HTTPS `POST` to:

`/twilio/inbound`

Configure Twilio call status callbacks by HTTPS `POST` to:

`/twilio/status`

Both endpoints reject invalid `X-Twilio-Signature` values with `403`.

## Outbound authorization

`POST /calls/outbound` requires either:

- `Authorization: Bearer <outbound token>`, or
- `x-caroline-key` for compatibility with the existing Caroline control plane.

The request body is:

```json
{
  "to": "+12155550123",
  "first_message": "optional string",
  "metadata": {}
}
```

`metadata` is validated and reserved for later policy/audit persistence; arbitrary metadata is not forwarded into ElevenLabs dynamic variables.

## ElevenLabs agent prerequisite

For register-call with Twilio, keep the agent telephony audio formats set to μ-law 8000 Hz for input and output.

## Validation

Run:

```bash
npm install
npm run check
```

`npm run check` performs TypeScript type checking, synthetic tests, and a Wrangler dry-run. Deployment uses `wrangler deploy --keep-vars` so Cloudflare-managed runtime secrets are preserved.
