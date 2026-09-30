---
id: ideas.specflow-runtime.ai-adapters.resource-lifetime
type: engineering
title: Provider invocation resource lifetime
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - lifecycle
  - cleanup
  - resources
  - settlement
read_when:
  - implementing provider process/resource ownership
  - adding temporary files, listeners, timers, MCP registrations, or raw capture to an invocation
  - handling partial provider startup or cancellation cleanup
summary: >
  Centralize per-invocation resource ownership and cleanup so partial startup, success, failure,
  cancellation, and late callbacks converge on one idempotent settlement path instead of
  duplicating cleanup logic across branches.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.invocation-ownership
  - architecture.runtime.ownership-and-lifecycle
---

# Provider invocation resource lifetime

## Problem

A provider invocation can own many resources simultaneously:

- child process/process group;
- abort/signal listeners;
- temporary settings/config files;
- temporary MCP configuration;
- MCP interaction registration;
- active-operation registry entries;
- timers/watchdogs;
- stdout/stderr handlers;
- raw-capture write queues;
- provider-specific continuation/session bookkeeping.

If every early return, spawn error, terminal event, process close, cancellation callback, and parser
failure cleans these independently, one missed branch is enough to leak state or perform cleanup
twice.

## Proposed abstraction

Introduce a lightweight Runtime-owned scope, for example conceptually
`ProviderTurnScope` / `InvocationResourceScope`.

It should support:

- register a resource cleanup exactly once;
- distinguish startup-only rollback from resources promoted to full invocation lifetime;
- reverse-order cleanup;
- idempotent settlement;
- cleanup that continues even if one cleanup fails;
- aggregate/report cleanup errors without hiding the primary turn outcome;
- one-time transfer/claim into the settlement path;
- integration with the invocation fence.

Do not import a heavyweight generic framework if a small local abstraction preserves the required
invariants.

## Candidate lifetime scopes

### startup_rollback

Resources allocated before the invocation becomes fully live.

Examples:

- temporary config;
- just-created MCP registration;
- child process spawned but operation not yet registered.

If startup fails, unwind these.

### per_invocation

Resources that live until terminal settlement.

Examples:

- process/process-group owner;
- listeners;
- active-operation registry entry;
- watchdog;
- interaction registration;
- raw-capture active session handle.

A successful startup promotes relevant rollback resources into this lifetime.

### runtime

Long-lived shared resources are **not** owned by the invocation scope. They remain Runtime-owned and
are only referenced.

## Cleanup semantics

Recommended properties:

- cleanup registration is ordered;
- execution is reverse-order (LIFO) unless a resource explicitly requires another dependency order;
- every registered cleanup is attempted;
- cleanup failures are aggregated for diagnostics;
- cleanup is safe to request multiple times but executes each resource cleanup at most once;
- no cleanup callback can regain canonical mutation rights after settlement.

## Settlement vs outcome

Cleanup failure does not automatically rewrite a successfully established canonical provider
outcome into "provider failed".

Example:

- provider reports successful terminal answer;
- canonical Turn settles completed;
- deleting a temporary diagnostic file fails;
- report cleanup diagnostic, but do not fabricate a failed AI Turn unless that resource is itself
  part of the product contract.

Conversely, failure to terminate a process may require an operational diagnostic/escalation even
after canonical interruption/cancellation.

## Partial startup test matrix

At least inject failures after each acquisition step:

1. temp file created;
2. MCP registration created;
3. child spawned;
4. process handlers attached;
5. provider operation registered;
6. watchdog started;
7. session establishment callback installed.

For each injected failure assert:

- earlier resources are released;
- later resources never appear;
- cleanup runs once;
- active registries are empty;
- primary error is preserved;
- cleanup errors remain inspectable.

## Cross-platform note

Resource ownership must be platform-neutral even when individual cleanup implementations differ
(e.g. process-tree termination). The scope owns "terminate this process resource", not a POSIX signal
implementation.
