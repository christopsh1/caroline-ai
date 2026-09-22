# Caroline Phone Cloudflare Architecture — v3.10

## Runtime boundary
`caroline-phone` is the security/orchestration boundary. It does not fabricate canonical identity, permissions, memory, calendar data, contact resolution, SMS persistence, or cross-call admission state.

## Call initialization
1. Validate method, credential, content type, and body size.
2. Read `conversation_id` and bounded provider metadata.
3. Call explicit canonical adapter interfaces.
4. While Neon is not implemented, adapters return `PENDING_NEON_INTEGRATION`.
5. Build a fail-closed ElevenLabs client-data response: unknown identity, no permissions, `canonical_pending`, zero tools, fixed safe first message.
6. Persist the session snapshot to `CarolineSession` Durable Object storage.
7. Return only after persistence succeeds.

## Durable session state
Each conversation maps to one Durable Object name: `conversation:<conversation_id>`.
The object performs no external identity inference. All important state is in `ctx.storage`, so eviction/restart cannot reset call truth.

## Tool/action policy
Tool exposure is decided by Worker code plus deployment-time tool-ID mapping. Unverified callers cannot be granted custom tools by configuration. Outbound tool exposure additionally requires an explicit canonical owner-authorization marker. Runtime phone actions re-check the Durable Object permission snapshot; possessing the runtime key alone is not sufficient for an action.

## KV
Workers KV is never active-call or permission truth. Its only allowed role is non-critical cache/config/diagnostic metadata. Event receipt records are cache copies only and never short-circuit ingestion.

## ElevenLabs events
After raw-body signature verification, the full event envelope is written to R2 and a pointer is sent to Queue. Ingestion no longer waits for a canonical sink to exist. `deliverCanonicalEvent()` is explicitly pending Neon; failed delivery retries and leaves the R2 object intact.

## Twilio
Twilio validation uses the exact incoming request URL, HMAC-SHA1 form-signature rules, and JSON `bodySHA256` where applicable. Invalid requests receive generic 403. Routing remains disabled after validation because no Twilio business-routing contract was requested in this phase.
