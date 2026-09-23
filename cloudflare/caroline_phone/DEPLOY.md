# Cloudflare Deployment Gate — v3.10

This repository is configured for Cloudflare-only runtime behavior. Canonical behavior is explicitly fail-closed as `PENDING_NEON_INTEGRATION` until the canonical backend exists.

1. Inventory the existing Cloudflare account resources read-only.
2. Confirm the existing KV namespace ID is `85679a0030e846ee931226aa1a6e6332`.
3. Confirm any R2/Queue names referenced by the selected environment exist before deploy; do not create substitutes from this project automation.
4. Configure secrets with `wrangler secret put --env <environment>`:
   - `CAROLINE_KEY`
   - `ELEVENLABS_WEBHOOK_SECRET`
   - `TWILIO_AUTH_TOKEN`
5. Run `npm run check`.
6. Deploy the development Worker with `npm run deploy:dev`.
7. Wrangler provisions/reconciles the SQLite-backed `CarolineSession` Durable Object export for the development Worker.
8. Verify `/health` and authenticated `/status`.
9. Verify `/runtime/init` persists session state and returns `canonical_pending` with zero tools.
10. Verify invalid runtime/Twilio/ElevenLabs credentials fail closed.
11. If R2/Queue are bound, verify signed ElevenLabs events persist to R2 before Queue enqueue and remain durable while canonical delivery is pending.
12. Do not move production phone/provider traffic during this Cloudflare-only validation phase.
