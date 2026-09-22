# Deployment sequence — v3.2

1. Read live Cloudflare Workers, KV, R2, Queues and routes through the authenticated API bridge.
2. Confirm no production `caroline-phone` Worker will be overwritten.
3. Read the live `Caroline_Phone` KV namespace ID.
4. Create/confirm `caroline-phone-payloads` R2, `caroline-phone-events` Queue, and `caroline-phone-events-dlq`.
5. Bind KV/R2/Queue resources in the development environment first.
6. Configure development secrets without committing values.
7. Configure and verify the replacement event sink; it must enforce Caroline HMAC and idempotency by `event_id`.
8. Run `npm run check`; deploy `caroline_phone-dev`.
9. Verify `/health`, authenticated `/status`, signed synthetic ElevenLabs ingress, R2 staging, Queue consumption, retries, DLQ path, and cleanup.
10. Point only the non-live ElevenLabs `cloudflare-refactor` branch at the development Worker and run regression tests.
11. Implement Twilio request validation against the exact Cloudflare callback URL before enabling any Twilio edge route.
12. Change production provider endpoints only after regression success, one route at a time, with rollback values documented.
13. Rotate the Cloudflare setup API token if it was passed as an action parameter.
