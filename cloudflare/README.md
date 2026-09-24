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

The event API stores event state in KV and sends only an event pointer to the queue. The queue consumer updates delivery state and can optionally forward each event to a Supabase Edge Function for downstream processing.

## Endpoints

### Health

```bash
curl https://caroline-event-worker.customerservice-882.workers.dev/health
```

### Create an event

```bash
curl -X POST https://caroline-event-worker.customerservice-882.workers.dev/events \
  -H "Content-Type: application/json" \
  -H "x-caroline-key: <runtime key>" \
  -d '{"type":"order.created","payload":{"order_id":"12345","customer":"Caroline"}}'
```

### Retrieve an event

```bash
curl https://caroline-event-worker.customerservice-882.workers.dev/events/<event_id> \
  -H "x-caroline-key: <runtime key>"
```

After the queue consumer runs, the event should report `status: "delivered"`. If downstream delivery is failing, it reports `status: "delivery_retrying"` with `last_delivery_error`.

## Request contract

- Runtime auth is required on `/events` and `/events/<event_id>` using `x-caroline-key`.
- Event `type` must be a non-empty string (max 120 chars) containing only letters, numbers, `.`, `_`, `:`, or `-`.
- Body must be a JSON object.

## Local validation

```bash
npm install
npm run check
```

## Deploy

```bash
npm run deploy
```

The Worker runtime secret values must be configured in Cloudflare, not committed to this repository. Use `.env.example` only as the name inventory.

Runtime secret names:

- `CAROLINE_KEY`
- `CORE_RUNTIME_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`
- `TWILIO_AUTH_TOKEN`
- `OPEN_ROUTER_KEY`
- `SUPABASE_EVENT_INGEST_KEY` (optional override key used for downstream ingest calls)

Runtime variable names:

- `SUPABASE_EVENT_INGEST_URL` (optional downstream ingest endpoint)

Deployment credentials:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Security note

`/events` is now runtime-key protected. Keep runtime keys in Cloudflare secrets only and never commit values to this repository.
