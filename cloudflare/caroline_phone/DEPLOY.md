# Deployment sequence

1. Read the live Cloudflare account inventory through the authenticated Cloudflare API bridge.
2. Confirm there are no existing `caroline_phone` Worker deployments that would be overwritten.
3. Read the namespace ID for the Cloudflare KV namespace named `Caroline_Phone`.
4. Add that ID to `wrangler.toml` as binding `CAROLINE_PHONE`.
5. Create a development Worker environment/deployment first.
6. Add Worker secrets without committing their values.
7. Verify `/health` and authenticated `/status`.
8. Verify ElevenLabs HMAC handling with synthetic signed fixtures before changing any live webhook URL.
9. Configure and verify `EVENT_SINK_URL` only after the replacement backend contract is selected.
10. Do not enable Twilio ingress until Twilio's official request validation is wired against the exact Cloudflare callback URL.
11. Only after regression testing, change live provider endpoints one at a time with rollback values documented.
12. Rotate the Cloudflare API token used during setup if it was ever passed as an action parameter.
