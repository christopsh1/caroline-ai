# Agent-run audit pattern

## Problem solved
Provide traceable evidence of agent/workflow execution, evaluation and improvement without treating debug payloads as permanent production state.

## Sanitized legacy source area
Agent run status/timing/tool usage, evaluation scores, improvement lifecycle and creator-run audit metadata. Free-form payloads and excluded RAG content are not copied into the template.

## Reusable concept
Record run identity, trigger, bounded tool/connection usage, outcome, error class, timing, evaluation linkage and approved improvement/rollback linkage.

## Unsafe/obsolete legacy coupling removed
Do not require Supabase tables/views or store unrestricted input/output payloads by default.

## Future implementation guidance
Separate operational telemetry from sensitive content. Define retention by field class. Make evaluation/improvement changes attributable and reversible.

## Privacy implications
Run logs can leak prompts, personal content and provider identifiers. Prefer structured metadata over raw payload logging.

## Security implications
Audit records should be append-oriented and protected from the runtime they are auditing where practical.

## Failure behavior
A failed run still emits a minimal audit record with stable ID, timing and error class.

## Required acceptance tests
- successful/failed runs both produce audit evidence;
- raw credentials are never logged;
- evaluation is linked to the correct run;
- improvement records include actor/status/rollback evidence.
