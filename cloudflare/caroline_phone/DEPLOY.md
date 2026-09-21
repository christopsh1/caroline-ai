# Deployment sequence

1. Read the live Cloudflare account inventory through the authenticated Cloudflare API bridge.
2. Confirm there are no existing `caroline_phone` Worker deployments that would be overwritten.
3. Read the namespace ID for the Cloudflare KV namespace named `Caroline_Phone`.
4. Add that ID to `wrangler.toml` as binding `CAROLINE_PHONE`.
5. Create a development Worker environment/deployment first (`caroline_phone-dev`).
6. Add development Worker secrets without committing their values.
7. Run `npm run check`, then verify `/health` and authenticated `/status` on the deployed development Worker.
8. Verify ElevenLabs HMAC handling with synthetic signed fixtures before changing any live webhook URL.
9. Select the replacement backend contract, then configure `EVENT_SINK_URL` and `EVENT_SINK_KEY` and verify the Caroline-signed event envelope end to end.
10. Do not enable Twilio ingress until Twilio's supported request validator is wired against the exact Cloudflare callback URL. The current route must remain fail-closed.
11. Run replay, malformed-payload, stale-signature, oversized-body, downstream-failure, and duplicate-delivery regression tests.
12. Only after regression testing, change live provider endpoints one at a time with rollback values documented.
13. Rotate the Cloudflare API token used during setup if it was ever passed as an action parameter.

## Production cutover rule

A development success does not authorize production cutover. `caroline_phone` production routing is changed only after the replacement event sink is selected, authenticated, idempotent by `event_id`, and regression-tested.
