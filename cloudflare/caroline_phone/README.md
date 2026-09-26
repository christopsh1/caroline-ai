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
  <-> approved Supabase / CRM / RAG / scheduling backend

Call ends
  -> verified ElevenLabs post-call webhook
  -> caroline-phone Worker
  -> caroline-post-call Queue
  -> fetch full conversation from ElevenLabs
  -> approved backend post-call processor
  -> summaries / memory / CRM / analytics
```

Outbound:

```text
authorized backend/admin trigger
  -> POST /twilio/outbound (JSON + OUTBOUND_ADMIN_TOKEN)
  -> Twilio outbound call with AMD enabled
  -> Twilio invokes /twilio/outbound as a signed voice webhook
  -> ElevenLabs Register Call API
  -> ElevenLabs-native outbound Caroline agent + native LLM
```

Cloudflare never proxies chat completions for a live call. There is intentionally no `/v1/chat/completions` route and no OpenRouter dependency in this package.

## ElevenLabs agents

- Inbound: `agent_8001m2ba4rmder6t7wq270ntj43j`
- Outbound: `agent_0501m31c1xv6e40ayeab7bn67vet`

Both agents were verified using the ElevenLabs-native `gpt-5.6-terra` model. Do not configure a Custom LLM URL, provider API key, or OpenAI-compatible model endpoint on either agent.

## Worker routes

Twilio:
- `POST /twilio/inbound`
- `POST /twilio/outbound` — JSON requests are the authorized admin trigger; form requests are the signed Twilio voice leg
- `POST /twilio/status`
- `POST /twilio/amd`

ElevenLabs tools:
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

At call creation/registration the Worker generates an opaque `call_context_id` and stores the server-side mapping between that ID, Twilio `CallSid`, direction, selected agent, ElevenLabs conversation ID when known, lifecycle state and expiry.

Only this value is passed to ElevenLabs at call start:

```json
{ "call_context_id": "opaque-id" }
```

Do not place raw database rows, credentials, verification secrets, complete history, caller permissions or protected customer data in dynamic variables. Caller ID is a lookup hint, not proof of identity.

## Security

- Twilio form callbacks verify `X-Twilio-Signature` before processing.
- The outbound admin trigger requires `OUTBOUND_ADMIN_TOKEN` and validates E.164 numbers.
- ElevenLabs tool routes require `ELEVENLABS_TOOL_SECRET` via Bearer auth or `X-Caroline-Tool-Key`.
- Provider/application credentials live in Infisical Development and are resolved at runtime through `secrets-gateway`; application Workers do not store those credentials directly as Cloudflare secrets.
- Tools send bounded server-side call context to the approved backend and return allow-listed model-safe fields only.
- `prepare-action` returns a short-lived HMAC confirmation token. `commit-action` and `transfer` require explicit `confirmed=true`, the prepared `action_id`, and a valid non-expired token.
- Post-call webhooks verify `ElevenLabs-Signature` using HMAC-SHA256 over `timestamp.raw_body`, reject stale/bad signatures, and use `EVENT_LEDGER` for idempotency.
- Queue messages contain only compact event/correlation metadata, not the transcript. The queue consumer fetches the full conversation from ElevenLabs asynchronously and sends it to the approved backend post-call processor.

## Secrets architecture

**Source of truth:** Infisical, Development environment, project `4643c8b4-eb45-45dd-87e4-80cdec6ae6ab`.

**Runtime broker:** `secrets-gateway` Cloudflare Worker. The gateway scopes the returned secret set by `WORKER_NAME` and owns the 5-minute gateway cache.

The only two Cloudflare secret bindings permitted on `caroline-phone` are:

- `GATEWAY_TOKEN`
- `GATEWAY_URL`

Twilio, ElevenLabs, backend, Neon, OpenAI, Cohere, and other provider/application credentials must not be added directly as Cloudflare Worker secrets.

Non-secret Worker variables include:
- `WORKER_NAME=caroline-phone`
- `ENVIRONMENT=production`
- `CAROLINE_PHONE_PUBLIC_URL=https://caroline-phone.customerservice-882.workers.dev`
- `CALL_CONTEXT_TTL_SECONDS=7200`
- inbound/outbound ElevenLabs agent IDs

The deployed source must call `getSecrets(env)`/the typed equivalent before any route that needs protected runtime credentials. Gateway failure is fail-closed; there is no hardcoded or direct-Cloudflare credential fallback.

## Cloudflare bindings

- Durable Object `CALL_SESSION` -> `CallSession`
- Durable Object `EVENT_LEDGER` -> `EventLedger`
- Queue producer/consumer `POST_CALL_QUEUE` -> `caroline-post-call`

Do not substitute the older generic event-delivery queue for the dedicated post-call queue.

## Direct deployment only

Caroline Phone has no Git-based deployment or validation workflow. Do not connect it to a hosted source repository or repository-triggered Cloudflare Build.

### Cloudflare Dashboard

Use Workers & Pages -> `caroline-phone` -> Edit Code / Quick Edit for direct code deployment when appropriate. Manage bindings and non-secret variables in Worker settings. The only application Worker secrets allowed there are `GATEWAY_TOKEN` and `GATEWAY_URL`.

If a source repository is connected under Settings -> Builds, select **Disconnect**. Disconnecting the build integration must not delete the existing Worker deployment.

### Standalone local Wrangler

From a standalone copy of this folder outside any Git working tree:

```bash
npm install
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

Authenticate Wrangler locally or through Cloudflare login. Do not store account tokens in the project folder.

## Outbound call behavior

The authorized JSON trigger creates the Twilio call with:
- `MachineDetection=Enable`
- `AsyncAmd=true`
- AMD callback -> `/twilio/amd`
- status callback -> `/twilio/status`
- status events -> initiated, ringing, answered, completed
- recording explicitly off

Inbound does not use AMD.

## Local backup policy

Keep periodic standalone archives of this folder outside any Git working tree. Include source, tests, `wrangler.toml`, `package.json`, `.env.example`, the audit, and this runbook. Never include secret values in backups.
