# Asynchronous transcript projection pattern

## Problem solved
Keep authoritative communications durable even when normalization, analytics or other derived processing fails.

## Sanitized legacy source area
Call history, normalized turns, ingestion job/retry state and provenance identifiers. Excluded legacy RAG tables are not source material for this template.

## Reusable concept
`authoritative communication → normalized turns → durable async job → rebuildable derived projections`

## Unsafe/obsolete legacy coupling removed
Do not require minute-level database cron, database triggers as the sole queue mechanism, or a specific embedding/vector subsystem.

## Future implementation guidance
Persist the authoritative communication first. Enqueue downstream projection asynchronously. Preserve source IDs and projection version. Make projections replaceable/rebuildable.

## Privacy implications
Transcript-derived systems inherit transcript sensitivity. Derived records must not weaken the source access policy.

## Security implications
Queue payloads should carry stable references rather than duplicate sensitive transcript bodies where avoidable.

## Failure behavior
Projection failure never deletes or invalidates the authoritative transcript. Retry state is explicit and bounded.

## Required acceptance tests
- transcript persists when downstream processing fails;
- retry does not duplicate the authoritative record;
- projection can be rebuilt from source;
- provenance survives normalization;
- failed job remains observable.
