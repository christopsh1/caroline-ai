# Caroline Core Mock

Development-only contract harness for the Caroline Cloudflare refactor. It is not a production database and is not intended to become one.

It implements the signed downstream contracts expected by `caroline-phone-dev`:

- `POST /v1/init`
- `POST /v1/retrieve`
- `POST /v1/phone/contact-resolve`
- `POST /v1/phone/sms`
- `POST /v1/phone/calendar-read`
- `POST /v1/phone/hold`
- `POST /v1/phone/reentry-ack`
- `POST /v1/events/elevenlabs`

## Security model

All edge-to-core requests and core responses use the shared development `CORE_RUNTIME_KEY` HMAC contract. Event delivery uses a separate `EVENT_SINK_KEY` HMAC contract. Phone/retrieval authorization is resolved from development session state keyed by `conversation_id`; action payloads never authorize themselves.

## Development state

Bind an isolated R2 bucket as `MOCK_STATE`. `/v1/init` writes a synthetic session record. Subsequent retrieval and phone actions load that session by `conversation_id`. Event sink delivery stores receipt metadata only; raw transcripts are not persisted by this mock.

## Built-in dummy fixtures

The default fixtures use reserved-style dummy `+1555...` numbers only:

- `+15550000001` owner
- `+15550000002` verified personal contact
- `+15550000003` verified professional with busy-only calendar
- `+15550000004` restricted caller
- `+15550000005` allowed caller with one-time re-entry notice
- all other values: unknown/unverified

Optional `MOCK_CALLER_PROFILES_JSON` may override these using development/test data only.
