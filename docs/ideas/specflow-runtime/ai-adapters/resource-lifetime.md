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
  - ideas.specflow-runtime.ai-adapters.session-resume-recovery
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

## Semantic terminal does not release process ownership

A provider can emit an authoritative semantic terminal result before its CLI/process tree exits.
Canonical Turn settlement and OS process cleanup are therefore separate responsibilities.

A candidate policy can:

1. settle canonical outcome from authoritative provider evidence;
2. keep the process resource owned by the invocation scope;
3. allow a short bounded drain/grace period;
4. terminate the process tree if it remains alive beyond the policy;
5. record cleanup disposition without rewriting the already-proven Turn outcome.

Do **not** arm post-terminal cleanup from any event merely named `result`. Real provider protocols
can emit non-terminal/notification result-like events during resume/startup. The terminal predicate
must be provider-specific, fixture-backed, and semantically authoritative.

The resource scope remains responsible until verified exit/termination even after canonical
settlement.

## Process stream bounds and backpressure

Legacy inspection found mixed protection:

- Codex keeps only a bounded stderr tail;
- Antigravity accumulates a full `stderrBuffer` for the Turn;
- Claude, Codex and Antigravity keep residual line buffers until a newline arrives;
- async per-line processing queues can grow if provider output arrives faster than parsing/persistence.

Migration should avoid turning provider output into unbounded process memory.

Candidate protections:

- bound residual line/frame size and fail explicitly on an impossible/oversized protocol frame;
- use a bounded tail/excerpt when whole stderr is needed only for diagnostics/classification;
- stream raw capture instead of accumulating a second complete stdout copy;
- put a bound/backpressure policy between child streams and asynchronous log/raw-capture sinks;
- when a sink is slower than the provider, either pause/resume the readable stream or use an
  explicitly bounded queue with a visible truncation/drop marker;
- never silently discard a protocol-terminal frame because a diagnostic capture limit was reached.

A byte cap is a safety limit, not a provider protocol assumption. Keep protocol parsing and
diagnostic retention limits separate where necessary.

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
