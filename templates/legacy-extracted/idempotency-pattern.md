# Phone / event idempotency pattern

## Problem solved
Prevent duplicate provider/webhook deliveries and worker retries from creating duplicate logical actions.

## Sanitized legacy source area
Event IDs, conversation/call IDs, scheduled-action idempotency keys and processing status ledgers.

## Reusable concept
Derive a deterministic event identity at ingress, persist one logical event, and make every downstream side effect safe to retry.

## Unsafe/obsolete legacy coupling removed
Do not require a particular Supabase trigger, `pg_net`, `pg_cron`, or Edge Function implementation.

## Future implementation guidance
Use unique constraints/atomic claims in the future authoritative store. Provider delivery IDs are evidence, not sole business identity when provider retry semantics require a composite key.

## Privacy implications
Idempotency records should contain the minimum identifiers required to reconcile an event, not duplicated transcript/personal payloads.

## Security implications
An attacker must not be able to choose a key that overwrites another event; create-only/unique semantics are required.

## Failure behavior
Duplicates return the prior logical result or a deterministic duplicate status. Partial failures remain retryable without repeating external side effects.

## Required acceptance tests
- repeated provider event produces one logical event;
- concurrent duplicates produce one reserved side effect;
- retry after crash resumes safely;
- conflicting payload under same immutable event identity is surfaced for review.
