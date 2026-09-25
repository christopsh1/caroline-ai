# Caroline Event Worker

Fresh standalone Cloudflare Worker configuration for Caroline event ingestion and delivery.

## Live resource bindings

- KV `CAROLINE_PHONE` → `85679a0030e846ee931226aa1a6e6332`
- R2 `CAROLINE_EVENTS_RAW` → `caroline-events-raw`
- R2 `CAROLINE_TRANSCRIPTS` → `caroline-transcripts`
- R2 `CAROLINE_ARTIFACTS` → `caroline-artifacts`
- R2 `CAROLINE_MEDIA` → `caroline-media`
- D1 `CAROLINE_DB` → `e350a176-c2be-4b5c-9975-bebb157e944a`
- Queue `EVENT_DELIVERY` → `caroline-event-delivery`

The event API currently stores event state in KV and sends only an event pointer to the queue. The queue consumer marks the stored event as delivered.

## Endpoints

### Health

```bash
curl https://caroline-event-worker.customerservice-882.workers.dev/health
```

### Create an event

```bash
curl -X POST https://caroline-event-worker.customerservice-882.workers.dev/events \
  -H "Content-Type: application/json" \
  -d '{"type":"order.created","payload":{"order_id":"12345","customer":"Caroline"}}'
```

### Retrieve an event

```bash
curl https://caroline-event-worker.customerservice-882.workers.dev/events/<event_id>
```

After the queue consumer runs, the event should report `status: "delivered"`.

## Local validation

```bash
npm install
npm run check
```

## Deploy

```bash
npm run deploy
```

Worker runtime secrets must be configured directly in Cloudflare and must not be stored in source files.

Runtime secret names used by current Cloudflare components include:

- `CAROLINE_KEY`
- `CORE_RUNTIME_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TOOL_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`
- `TWILIO_AUTH_TOKEN`

Caroline Phone does not require or use an OpenRouter key in its live-call runtime.

For local Wrangler authentication only, keep Cloudflare account credentials outside the project source directory.

## Security note

The current `/events` test contract is intentionally unauthenticated to match the existing smoke-test interface. Do not send sensitive payloads to it until request authentication is added to this fresh Worker path.
