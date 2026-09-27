# Caller / policy context envelope pattern

## Problem solved
Provide a channel runtime only the identity, permissions, privacy state, caller policy and tool authority it needs for the current interaction.

## Sanitized legacy source area
Identity bindings, contact permissions, caller restrictions, calendar sharing, availability, channel/runtime profiles and tool scope metadata. No legacy RAG content is used.

## Reusable concept
Resolve trusted identity first, derive authorization/privacy second, assemble a compact versioned context envelope third, and expose capabilities last.

## Unsafe/obsolete legacy coupling removed
Do not depend on Supabase Edge Function chaining, service-role access, hard-coded provider tool IDs, database rows as external API contracts, or caller-supplied owner authority.

## Future implementation guidance
Define a versioned envelope contract independent of database schema. Separate policy facts from provider/resource bindings. Fail closed when identity or permission state is unavailable.

## Privacy implications
Relationship, availability and personal details must be disclosed only under explicit authorization. Unknown/unverified identities receive minimal context.

## Security implications
Owner authority must be server-bound. Capability selection is enforced at the backend, not only in model prompting.

## Failure behavior
Identity/policy resolution failure returns the minimum safe profile with restricted capabilities; it must never broaden access.

## Required acceptance tests
- unknown caller cannot receive private context;
- known identity cannot inherit owner authority;
- restriction state removes disallowed tools;
- calendar/privacy level is enforced server-side;
- caller-provided fields cannot escalate privilege.
