# Tool contract pattern

## Problem solved
Make tools/capabilities explicit, testable and independently enforceable across agent/channel runtimes.

## Sanitized legacy source area
Non-RAG tool registry structure: name, description, input/output schema, timeout, retry/fallback policy, channel scope and owner scope.

## Reusable concept
A tool contract declares interface shape, authority, failure behavior and implementation binding separately.

## Unsafe/obsolete legacy coupling removed
Do not bind contracts permanently to Supabase table names, provider IDs, n8n build state, or a single MCP/voice implementation.

## Future implementation guidance
Version schemas. Separate `capability` from `implementation`. Backend enforcement must match declared owner/channel scope.

## Privacy implications
Inputs/outputs require explicit sensitivity classification and minimum-data behavior.

## Security implications
Model-visible tool availability is not authorization. Runtime/tool backend performs final authorization.

## Failure behavior
Timeout, retry and fallback semantics are part of the contract rather than ad-hoc implementation behavior.

## Required acceptance tests
- invalid input fails schema validation;
- unauthorized owner/channel scope fails server-side;
- timeout/retry behavior is deterministic;
- implementation can change without altering stable capability intent.
