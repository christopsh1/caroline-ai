# Capability registry / component-route pattern

## Problem solved
Describe what the system can do without conflating persistent identity, runtime surface, implementation and provider.

## Sanitized legacy source area
System components, capabilities, component-capability assignments and routes, excluding legacy RAG-specific rows/content.

## Reusable concept
`identity/runtime profile → allowed capability → implementation binding → target`, with route contracts carrying channel and policy constraints.

## Unsafe/obsolete legacy coupling removed
Do not turn the old `system_*` tables into mandatory Neon schema. Do not embed provider endpoints, secret references or Supabase implementation assumptions in the capability definition.

## Future implementation guidance
Keep a portable declarative registry in version control, with environment-specific bindings supplied outside the contract.

## Privacy implications
Capabilities should declare what sensitivity classes they can read/write and under whose authority.

## Security implications
Least privilege is expressed both in declaration and runtime enforcement.

## Failure behavior
Missing implementation binding makes a capability unavailable; it must not fall back to a broader tool automatically.

## Required acceptance tests
- capability and implementation can be independently versioned;
- missing binding fails closed;
- channel/owner scope is respected;
- provider swap does not change the business capability contract.
