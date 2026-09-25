# Caroline Phone

Caroline Phone is a Cloudflare Worker that orchestrates Twilio telephony around ElevenLabs. ElevenLabs is the sole live conversational-agent and LLM runtime.

## Runtime architecture

```text
Inbound caller
  -> Twilio
  -> caroline-phone Worker
  -> ElevenLabs Register Call API
  -> ElevenLabs-native Caroline agent + ElevenLabs-native LLM
  <-> ElevenLabs Webhook Tools
  <-> caroline-phone Worker
  <-> approved database / CRM / RAG / scheduling backends

Call ends
  -> ElevenLabs post-call webhook
  -> caroline-phone Worker
  -> post-call Queue
  -> summaries / memory / CRM / analytics workers
```

Outbound calls follow the same live conversation boundary:

```text
authorized backend/admin trigger
  -> caroline-phone
  -> Twilio outbound call
  -> /twilio/outbound
  -> ElevenLabs Register Call API
  -> ElevenLabs-native outbound Caroline agent + native LLM
```

Cloudflare never proxies chat completions for a live call. There is intentionally no `/v1/chat/completions` route and no OpenRouter dependency in this package.

## ElevenLabs agents

- Inbound: `agent_8001m2ba4rmder6t7wq270ntj43j`
- Outbound: `agent_0501m31c1xv6e40ayeab7bn67vet`

Both agents must use an ElevenLabs-supported native LLM. Do not configure a Custom LLM URL, provider API key, or OpenAI-compatible model endpoint on either agent.

## Worker routes

Twilio routes:

- `POST /twilio/inbound`
- `POST /twilio/outbound`
- `POST /twilio/status`
- `POST /twilio/amd`

ElevenLabs tool routes:

- `POST /elevenlabs/tools/customer-lookup`
- `POST /elevenlabs/tools/search-knowledge`
- `POST /elevenlabs/tools/get-availability`
- `POST /elevenlabs/tools/prepare-action`
- `POST /elevenlabs/tools/commit-action`
- `POST /elevenlabs/tools/transfer`

Post-call:

- `POST /elevenlabs/webhooks/post-call`

Health:

- `GET /health`

## Call-context boundary

At call registration the Worker generates an opaque `call_context_id` and stores the server-side mapping between that ID, Twilio `CallSid`, direction, selected agent, lifecycle state and expiry.

Only this value is passed to ElevenLabs at call start:

```json
{
  "call_context_id": "opaque-id"
}
```

Do not place raw database rows, credentials, verification secrets, complete history, caller permissions or protected customer data in dynamic variables. Caller ID is a lookup hint, not proof of identity.

## Security

Twilio endpoints verify the exact `X-Twilio-Signature` before processing form data.

ElevenLabs tool routes require a Worker-held `ELEVENLABS_TOOL_SECRET`. The current backend adapter is deliberately fail-closed: protected lookup/action routes return `backend_not_configured` until an approved backend adapter is attached. The customer-lookup scaffold returns only non-sensitive verification state and never echoes the caller's phone number.

Post-call webhooks verify `ElevenLabs-Signature` using HMAC-SHA256 over `timestamp.raw_body`, reject stale signatures, claim a deterministic event ID for idempotency, and enqueue only after successful verification. If the post-call queue is not configured, the route returns a retryable error instead of silently dropping the event.

Write actions must eventually use `prepare-action` followed by `commit-action` with a short-lived server-issued confirmation token. Until that backend implementation exists, both routes remain fail-closed.

## Required Worker secrets

Configure these only in Cloudflare Worker Secrets:

- `TWILIO_AUTH_TOKEN`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TOOL_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`

Do not expose those values in prompts, dynamic variables, tool output, browser code, logs, local source files or documentation.

No OpenRouter secret is required by Caroline Phone.

## Direct deployment only

Caroline Phone has no Git-based deployment or validation workflow. Do not connect it to a hosted source repository or repository-triggered Cloudflare build.

### Cloudflare Dashboard

Use Workers & Pages -> `caroline-phone` -> Edit Code / Quick Edit for direct code changes when appropriate. Manage bindings, variables and secrets in the Worker settings. Preserve the existing Worker name, routes, Durable Objects and production secrets.

### Local Wrangler

From a standalone local copy of this folder that is not inside a Git working tree:

```bash
npm install
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

Authenticate Wrangler locally or use the Cloudflare login flow. Do not store account tokens inside the project folder.

Secrets can be set directly:

```bash
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_TOOL_SECRET
npx wrangler secret put ELEVENLABS_WEBHOOK_SECRET
```

## Outbound Twilio settings

The component creating an outbound Twilio call should use:

- `Url = https://<caroline-phone-host>/twilio/outbound`
- `Method = POST`
- `MachineDetection = Enable`
- `AsyncAmd = true`
- `AsyncAmdStatusCallback = https://<caroline-phone-host>/twilio/amd`
- `AsyncAmdStatusCallbackMethod = POST`
- `StatusCallback = https://<caroline-phone-host>/twilio/status`
- `StatusCallbackEvent = initiated, ringing, answered, completed`

Inbound does not use AMD. Recording remains off unless separately approved.

## Post-call queue

`EVENT_LEDGER` provides idempotency for verified ElevenLabs events. `POST_CALL_QUEUE` is intentionally not bound until a dedicated post-call consumer exists. Do not point it at the existing generic event-delivery consumer because that consumer does not yet perform transcript, memory, CRM or analytics work.

When the dedicated consumer is ready, add a producer binding named `POST_CALL_QUEUE` in Cloudflare and keep the heavy work out of the webhook request path.

## Local backup policy

Keep periodic standalone archives of the `caroline_phone` folder outside any Git working tree. Include source, tests, `wrangler.toml`, `package.json` and this runbook. Never include secret values in backups.
