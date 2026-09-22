# Caroline Phone Edge Architecture — v3.2

## Role
`caroline-phone` is Caroline's provider security and transport boundary. It is not the memory store, business database, owner UI, or conversational brain.

## ElevenLabs ingress
1. enforce POST + JSON and a 2 MiB body cap;
2. verify `ElevenLabs-Signature` against the raw body before parsing;
3. derive a deterministic `event_id` and Caroline-owned envelope;
4. persist the full envelope to strongly consistent R2;
5. enqueue only a small pointer on Cloudflare Queues;
6. return HTTP 200 after R2 persistence + successful enqueue.

This keeps ElevenLabs independent from downstream backend latency and keeps Queue messages well under Cloudflare's 128 KB message limit.

## Async delivery
The Queue consumer reads the R2 object, verifies its SHA-256 against the queued pointer, validates the envelope identity, signs the edge-to-sink body with `EVENT_SINK_KEY`, and delivers it over HTTPS. Failures call `retry()` and eventually follow the configured DLQ policy. The R2 object is deleted only after downstream delivery succeeds.

## Storage semantics
- R2: durable short-lived raw event-envelope staging; strongly consistent.
- Queue: pointer/retry transport only; never carries full transcripts.
- KV `Caroline_Phone`: non-sensitive successful-delivery receipt metadata only; not an exact-once authority.
- downstream: must be idempotent by `event_id`.

## Security invariants
- no raw payload logging;
- no generic proxy or arbitrary webhook endpoint;
- no database service-role credential in the Worker;
- provider auth happens before JSON trust;
- downstream hop is separately Caroline-HMAC authenticated;
- Twilio remains fail-closed until exact public callback validation is implemented.
