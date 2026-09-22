# Caroline phone tool policy

The Cloudflare init facade owns the phone tool surface. The core runtime supplies identity/permission facts, but it cannot inject arbitrary ElevenLabs tool IDs.

`PHONE_TOOL_POLICY_JSON` is a deployment-time mapping from stable capability buckets to stable ElevenLabs tool IDs:

- `owner`: owner-only phone actions and owner-scoped retrieval.
- `external`: verified external caller retrieval only.
- `unknown`: normally empty; never put private-data tools here.
- `outbound`: tools available only on an outbound call.
- `hold`: the narrow caller-conversation-hold action, exposed only while the call is admitted/allowed.
- `calendar_read`: read-only shared-calendar query, added only when `calendar_share_level != none`.
- `reentry`: one-time re-entry acknowledgement, added only when `call_reentry_notice_pending == true`.

If `call_answering_status` is anything except `allowed`, the edge returns an empty custom tool list. If the policy is absent or malformed, it also returns an empty custom tool list.

## Stable-tool rule

Never put transient tool IDs returned by an old init service into this policy. Each capability must correspond to an ElevenLabs workspace tool that can be fetched directly from the tool registry and whose URL points at the Cloudflare development/production facade. IDs are environment configuration, not source-code constants.

The September 2026 legacy path violated this rule: dynamically returned tool IDs later disappeared from the workspace registry and caused call-start failures. The refactor intentionally removes that failure mode.

## Stable phone action endpoints (v3.5)

The dynamic tool policy now points to stable ElevenLabs tool documents whose URLs terminate at the edge:

- `POST /runtime/phone/contact-resolve` — verified owner only.
- `POST /runtime/phone/sms` — verified owner only; immediate or scheduled SMS.
- `POST /runtime/phone/calendar-read` — only when the init context grants a non-`none` calendar share level.
- `POST /runtime/phone/hold` — admitted non-owner inbound callers only; never exposed to the verified owner.
- `POST /runtime/phone/reentry-ack` — only for the one call carrying a pending re-entry notice.

Every action includes `conversation_id`. The future core MUST resolve the authoritative conversation/session from that ID and derive caller identity, caller phone, admission state, permissions, and owner status from server-side state. It MUST NOT authorize from a caller-provided phone number or other model-supplied identity field.

The edge still sanitizes successful core responses and converts unauthorized results to fail-closed states. Dynamic tool exposure is defense-in-depth, not the authorization boundary.
