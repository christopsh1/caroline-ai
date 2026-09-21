# Caroline Phone Edge Architecture

## Role

`caroline_phone` is a security and transport boundary. It is not Caroline's memory store, business database, owner-control UI, or conversational brain.

## Ingress contract

Provider-specific handlers must:

1. enforce method and content-type expectations;
2. cap request size before business processing;
3. authenticate the provider against the raw request;
4. parse only after authentication;
5. derive a deterministic event identifier;
6. produce a provider-neutral Caroline event envelope;
7. deliver the envelope to the configured event sink over HTTPS;
8. authenticate the edge-to-sink hop with a Caroline-owned HMAC;
9. store only non-sensitive receipt metadata in KV after successful delivery.

No handler may log raw webhook bodies, authorization headers, secrets, transcripts, or caller message content.

## Idempotency

Cloudflare Workers KV is eventually consistent. `Caroline_Phone` therefore acts only as a short-lived receipt/replay optimization. It is not the authoritative exact-once barrier.

Every downstream consumer must make `event_id` idempotent. A future need for strong edge-side coordination should use Durable Objects or another strongly consistent primitive rather than pretending KV provides atomicity.

## Downstream envelope

The edge emits schema version `1` with:

- `event_id`
- `request_id`
- `environment`
- `source`
- `source_event_type`
- `source_event_timestamp`
- `received_at`
- `payload_sha256`
- `payload`

The serialized envelope is signed using `EVENT_SINK_KEY` and sent in `X-Caroline-Signature` as `t=<unix>,v1=<hmac-sha256>` over `<timestamp>.<raw-envelope-body>`.

This gives the replacement backend a stable Caroline-owned contract instead of forcing it to understand every provider's webhook signature scheme.

## Provider status

### ElevenLabs

Implemented and fail-closed. HMAC-SHA256 signature verification uses the raw body and rejects signatures older than 30 minutes. The body limit is 256 KiB.

### Twilio

Not enabled. The route deliberately returns `503` even if the enable flag is set. Enablement requires the exact public callback URL and Twilio's supported request validator. This prevents an incomplete custom validator from silently becoming production authentication.

## Environment isolation

- `wrangler deploy --env dev` targets `caroline_phone-dev`.
- `wrangler deploy --env production` targets `caroline_phone`.
- Worker-owned KV keys are prefixed with `ENVIRONMENT`.
- Secrets are configured independently per environment.

## Explicit non-goals

- no generic service-role proxy;
- no arbitrary webhook bucket;
- no raw webhook archive in KV/R2;
- no database-vendor dependency;
- no replacement owner UI;
- no production provider cutover from this branch without the deployment gates in `DEPLOY.md`.
