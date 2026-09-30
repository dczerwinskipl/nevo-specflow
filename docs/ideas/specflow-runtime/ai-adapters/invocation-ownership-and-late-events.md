---
id: ideas.specflow-runtime.ai-adapters.invocation-ownership
type: engineering
title: Invocation ownership and late-event fencing
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - lifecycle
  - concurrency
  - cancellation
  - session-identity
read_when:
  - implementing provider start/cancel lifecycle
  - binding a provider-native session id after a turn has started
  - handling callbacks that may arrive after cancellation or replacement
summary: >
  Give each provider invocation an ownership generation/fence so callbacks from cancelled,
  terminal, or superseded invocations cannot mutate canonical aliases, session identity, Work,
  or lifecycle state.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.canonical-session-turn-work
  - architecture.runtime.ownership-and-lifecycle
---

# Invocation ownership and late-event fencing

## Problem

Provider-native session identity is often established asynchronously. A turn can be cancelled or
terminal before the provider reports its native session ID or another late callback resolves.

A legacy failure shape is:

1. start Turn without native `providerSessionId`;
2. register the Turn as active;
3. user cancels / Runtime terminalizes and removes active aliases;
4. provider later invokes session-established callback;
5. callback writes `providerSessionId` and re-adds a provider/session active alias;
6. a terminal Turn is now reachable through an "active" lookup again.

A simple `if (finished) return` check reduces risk but is not a complete ownership model when an
operation can be retried/replaced and callbacks from an older attempt still exist.

## Proposed pattern: invocation fence

Each live provider start receives an opaque invocation generation/token owned by the Runtime.

Conceptually:

```text
begin invocation -> generation N
callbacks capture N
terminal/cancel/replace invalidates N
callback may mutate only if N is still current owner
```

The token does not need to cross provider protocol boundaries.

## Mutations that require ownership validation

At minimum fence:

- provider-native session ID binding;
- active session alias registration;
- canonical Work append/update;
- final-answer emission;
- provider error settlement;
- interaction registration/correlation;
- provider-private operation-handle replacement;
- any callback that changes durable/canonical state.

Late raw diagnostic capture MAY remain allowed because it is not canonical state, but it should be
tagged as late/ignored where practical.

## Settlement interaction

Terminalization should invalidate canonical mutation rights before asynchronous cleanup can produce
more callbacks.

Recommended ordering:

1. atomically claim terminal settlement;
2. invalidate invocation mutation rights;
3. persist/emit canonical terminal outcome;
4. detach active aliases/interactions;
5. perform best-effort cleanup;
6. accept any later callback only as diagnostics.

Exact sequencing should be reconciled with the Runtime lifecycle owner.

## Retry/replacement semantics

A new provider attempt for the same logical operation obtains a new generation.

A callback from generation N MUST NOT mutate generation N+1 even if:

- it carries the same provider session ID;
- it arrives after N+1 started;
- it looks like successful session establishment;
- it is a cleanup/stopped receipt from an earlier process.

This is the important property missing from a single shared boolean such as `finished`.

## Provider session establishment

When the current invocation establishes native identity:

- bind it to the canonical Session/Turn according to current architecture;
- add provider/session correlation only if the invocation still owns the Turn;
- make same-value rebinding idempotent;
- reject conflicting native identity rather than silently replacing it.

## Verification cases

Use deterministic deferred promises/fake providers:

1. provider start blocks before native session establishment;
2. Runtime cancels and terminalizes;
3. provider later reports native ID;
4. assert terminal state unchanged;
5. assert active alias was not restored;
6. assert no canonical Work was appended;
7. assert a new Turn for the same Session can be admitted.

Also test replacement:

1. invocation N starts;
2. N is invalidated and N+1 starts;
3. late callback from N arrives;
4. N+1 remains the sole owner.

And positive behavior:

- current invocation can establish native identity normally;
- duplicate same-generation establishment is idempotent;
- conflicting establishment fails explicitly.

## Migration note

Apply this at the neutral Runtime/provider orchestration boundary rather than implementing a
different ad-hoc late-callback guard inside every adapter.
