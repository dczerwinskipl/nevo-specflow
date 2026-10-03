---
id: ideas.specflow-runtime.ai-adapters.correlation-identity
type: engineering
title: Provider correlation identity
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - session-identity
  - interactions
  - mcp
  - correlation
read_when:
  - indexing active turns or interactions by provider session
  - implementing MCP/provider correlation
  - migrating legacy maps keyed by providerSessionId
summary: >
  Use composite provider/session identity consistently for every provider-native lookup and keep
  canonical Session identity separate, preventing collisions between providers and avoiding
  parallel identity rules in interaction registries.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.invocation-ownership
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
---

# Provider correlation identity

## Existing architectural rule

Provider-native identity is composite:

```text
ProviderSessionRef = (provider, providerSessionId)
```

A bare `providerSessionId` is not globally unique and should never become a canonical Session ID
by accident.

## Legacy inconsistency to avoid during migration

A legacy interaction registry uses a composite key for active turns:

```text
provider:providerSessionId
```

but indexes pending interactions by `providerSessionId` alone, and its session-cancel API accepts
only that bare value.

That creates two identity rules in one registry. Even if collisions are rare today, the structure
allows provider A and provider B to collide if they happen to issue the same native session string.

## Proposed rule

Every provider-native map/query uses one shared composite key/value type.

Examples:

- active turn by provider session;
- pending interactions by provider session;
- cancellation by provider session;
- provider-operation registry;
- raw diagnostic correlation metadata;
- compatibility lookup routes.

Prefer a typed/value-object helper over repeated string concatenation when TypeScript implementation
lands, so accidental bare-session indexing is harder to write.

## Canonical vs provider-native lookup

Keep separate APIs for:

- canonical `sessionId`;
- `ProviderSessionRef`;
- `turnId`;
- short-lived interaction/correlation token.

Do not overload one string parameter to mean multiple identity kinds based on what happens to match.

## Cancellation

A provider-session cancellation API should require:

```text
provider
providerSessionId
```

or an explicit `ProviderSessionRef`.

If product logic already knows canonical `sessionId`, prefer canonical cancellation and resolve the
provider reference internally.

## Interaction cleanup

When a pending interaction is resolved/cancelled:

- remove it from the primary interaction map;
- remove its turn index;
- remove its composite provider-session index;
- delete empty index sets;
- repeated cleanup is harmless.

Turn unregistration should reject orphaned pending waiters before releasing transport resources.

## Verification cases

1. same native session ID under two providers does not collide;
2. cancelling provider A/session X does not cancel provider B/session X;
3. resolving an interaction removes every index;
4. unregistering a terminal Turn removes active provider-session alias and pending waiters;
5. bare providerSessionId cannot compile/call the composite-key API once typed implementation lands;
6. late session establishment from an invalid invocation cannot insert a new composite alias.
