# Scheduling / approval / reservation pattern

## Problem solved
Execute delayed or immediate external actions exactly once under provable owner authority.

## Sanitized legacy source area
Scheduled-action lifecycle, owner instruction authority, reservation/attempt state, completion reconciliation and contact target references.

## Reusable concept
`authorized instruction → durable scheduled intent → atomic reservation → refreshed execution context → provider action → completion reconciliation`

## Unsafe/obsolete legacy coupling removed
Do not require `pg_cron`, Supabase Edge Functions, Airtable mirroring or a specific provider transport.

## Future implementation guidance
Store purpose and structured action inputs separately from ephemeral execution context. Claim atomically. Use an idempotency key at provider boundary. Reconcile asynchronous completion.

## Privacy implications
Scheduled intents can contain private facts and communications. Minimize retained execution snapshots and define retention.

## Security implications
Only an explicitly authorized owner channel may create privileged external actions. Worker possession of a queue item does not grant broader authority.

## Failure behavior
Reservation timeout/retry must not duplicate the external action. Failed actions remain reviewable with bounded retry policy.

## Required acceptance tests
- unauthorized creator rejected;
- competing workers yield one reservation;
- retry does not duplicate call/message;
- execution uses current approved target data;
- completion event reconciles to the originating action.
