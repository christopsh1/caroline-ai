# Caroline Phone

Caroline Phone is the Cloudflare orchestration and policy layer for Caroline's Twilio + ElevenLabs phone runtime.

> **Branch status:** `caroline-phone-neon-direct-20260925` is implementation work, not the current live deployment. Do not deploy it until the Neon project is scoped, migrations are validated on a Neon branch, Worker secrets/bindings are verified, and the test suite passes.

## Production architecture

```text
Inbound caller
  -> Twilio
  -> Cloudflare Worker: caroline-phone
  -> ElevenLabs Register Call API
  -> ElevenLabs-native Caroline agent + ElevenLabs-native LLM
  <-> ElevenLabs Webhook Tools
  <-> caroline-phone
  <-> Neon Postgres + pgvector

Outbound request
  -> authenticated POST /twilio/outbound
  -> DNC/policy check in Neon
  -> Twilio outbound call with async AMD
  -> signed Twilio voice webhook
  -> ElevenLabs Register Call API
  -> ElevenLabs-native outbound Caroline agent

Call ends
  -> verified ElevenLabs post-call webhook
  -> caroline-post-call Queue
  -> fetch full ElevenLabs conversation
  -> persist calls/transcript/turns/summary/audit in Neon
  -> archive conversation JSON to R2
```

ElevenLabs is the only live conversational model/runtime. Cloudflare does not proxy live chat completions. There is intentionally no `/v1/chat/completions`, `/v1/responses`, OpenRouter, or ElevenLabs Custom LLM path in this package.

Neon Postgres is the only database/system of record. R2 is archive/object storage, not the canonical relational state.

## ElevenLabs agents

- Inbound: `agent_8001m2ba4rmder6t7wq270ntj43j`
- Outbound: `agent_0501m31c1xv6e40ayeab7bn67vet`

Both agents are expected to remain ElevenLabs-native. Do not configure a Custom LLM URL or OpenAI-compatible chat endpoint.

## Worker routes

Twilio:
- `POST /twilio/inbound`
- `POST /twilio/outbound`
  - JSON + `OUTBOUND_ADMIN_TOKEN`: authorized outbound initiation
  - form-encoded + valid `X-Twilio-Signature`: Twilio outbound voice leg
- `POST /twilio/status`
- `POST /twilio/amd`

ElevenLabs webhook tools:
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

At call creation the Worker generates an opaque `call_context_id` and stores the server-side mapping between that ID, Twilio `CallSid`, direction, selected agent, lifecycle state, and expiry in the `CallSession` Durable Object.

Only the opaque correlation value is passed to ElevenLabs at call start:

```json
{ "call_context_id": "opaque-id" }
```

Do not place raw database rows, verification secrets, complete caller history, permissions, or protected customer data in ElevenLabs dynamic variables.

## Security model

- Twilio form callbacks verify `X-Twilio-Signature` before processing.
- The outbound JSON trigger requires `OUTBOUND_ADMIN_TOKEN`.
- Outbound requests fail closed when Neon policy/audit state is unavailable and reject active DNC records before dialing.
- ElevenLabs webhook tools authenticate with `ELEVENLABS_TOOL_SECRET` as a bearer token or `X-Caroline-Tool-Key` secret header.
- Tool requests must contain a live `call_context_id`; the Worker resolves the real server-side call context.
- Protected customer fields are withheld unless a current server-side `verification_sessions` row marks that caller verified.
- Consequential actions use prepare -> explicit caller confirmation -> one-time database-backed confirmation token -> commit.
- Transfer destinations are allow-listed in Neon; the model never supplies an arbitrary transfer phone number.
- ElevenLabs post-call webhooks verify the `ElevenLabs-Signature` HMAC before queueing.
- `EVENT_LEDGER` protects ingress idempotency; Neon stores durable post-call receipts and tool audit events.

## Neon schema

Migrations live in `migrations/`.

`001_caroline_core.sql` creates the first production schema for:
- tenants and customers
- caller identity links
- contact preferences and DNC
- call contexts, calls, and lifecycle events
- verification sessions
- database-backed confirmation tokens and idempotency records
- approved transfer destinations
- appointments, availability slots, tasks, callbacks, transfers
- transcripts, call turns, and ElevenLabs summaries
- durable memory
- knowledge documents/chunks
- embedding-space metadata
- RAG retrieval audit
- tool audit events
- post-call event receipts

`002_seed_caroline_tenant.sql` creates/activates the canonical `caroline` tenant scope used by the Worker.

Do not apply these migrations to production until the connected Neon project ID/branch is verified. Test them on a Neon branch first.

## RAG / embeddings

OpenAI is used only for embeddings, never conversation generation.

Initial production embedding space:
- provider: OpenAI
- model: `text-embedding-3-small`
- dimensions: `1536`
- version: `openai:text-embedding-3-small:1536:v1`

Knowledge retrieval filters by provider, model, version, and dimensions before nearest-neighbor search. Do not mix vectors from different providers/models/versions/dimensions.

Cohere, if added, must use a separate versioned collection. Stored Cohere documents use `search_document`; Cohere retrieval queries use `search_query`. The rerank design is intentionally not finalized in this branch.

## Required Worker secrets

Configure only as Cloudflare Worker Secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `OUTBOUND_ADMIN_TOKEN`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TOOL_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`
- `DATABASE_URL`
- `OPENAI_API_KEY`

No OpenRouter secret and no generic backend token are required.

Non-secret Worker variables:
- `ENVIRONMENT=production`
- `CAROLINE_TENANT_KEY=caroline`
- `CAROLINE_PHONE_PUBLIC_URL=https://caroline-phone.customerservice-882.workers.dev`
- `CALL_CONTEXT_TTL_SECONDS=7200`
- inbound/outbound ElevenLabs agent IDs

## Cloudflare bindings

- Durable Object `CALL_SESSION` -> `CallSession`
- Durable Object `EVENT_LEDGER` -> `EventLedger`
- Queue producer/consumer `POST_CALL_QUEUE` -> `caroline-post-call`
- R2 `CAROLINE_TRANSCRIPTS` -> `caroline-transcripts`

No D1 database is part of the Caroline Phone system of record.

## Outbound behavior

The authorized outbound trigger creates Twilio calls with:
- `MachineDetection=Enable`
- `AsyncAmd=true`
- AMD callback -> `/twilio/amd`
- status callback -> `/twilio/status`
- status events -> initiated, ringing, answered, completed
- recording explicitly off

Inbound calls do not use AMD.

If the outbound call is created but the Worker cannot persist the auditable call context to Neon, the Worker attempts to terminate the new Twilio call and returns an error rather than allowing an untracked outbound call.

## Post-call processing

The webhook handler queues compact correlation metadata only. The queue consumer fetches the authoritative full conversation from ElevenLabs, then:
1. ensures call/correlation records exist in Neon;
2. upserts transcript JSON and normalized turns;
3. stores an ElevenLabs-provided summary when present;
4. archives the full conversation JSON to `caroline-transcripts` R2;
5. marks the durable post-call receipt complete.

No external chat model is used to summarize or extract memory. Durable-memory extraction remains policy-gated and is not fabricated in this branch.

## Deployment gate

Do not deploy this branch until all of the following are true:
1. Neon connector is scoped to the actual Caroline production project.
2. `001` and `002` are applied and tested on a temporary Neon branch.
3. Worker role/least-privilege grants are verified.
4. Cloudflare secret names and required bindings are verified live.
5. `npm run check` passes against this branch.
6. Worker dry-run/bundle validation passes.
7. A rollback target for the current `caroline-phone` version is recorded.
8. Worker is deployed before ElevenLabs webhook tools are attached to the live agents.
9. Inbound, outbound, DNC, tool, transfer, post-call, and queue tests pass in production verification.

The current live Worker must not be described as updated until those deployment and verification steps actually occur.
