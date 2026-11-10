---
id: ideas.specflow-runtime.ai-adapters.provider-readiness-auth
type: engineering
title: Provider readiness and authentication follow-ups
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
  - security
tags:
  - providers
  - authentication
  - availability
  - diagnostics
read_when:
  - adding a user-triggered provider environment test
  - designing quota-aware provider readiness
summary: >
  Open readiness work beyond the implemented discovery/validate/start guards: an explicit
  layer-2 diagnose lane with independent machine-readable checks, and readiness that keeps
  quota exhaustion distinct from installation and authentication.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - ideas.specflow-runtime.ai-adapters.provider-capacity-admission
  - reference.protocols.session-provider-driver
  - architecture.ai.provider-boundary
---

# Provider readiness and authentication follow-ups

Implemented today (see the [driver protocol](../../../reference/protocols/session-provider-driver.md)
and [provider references](../../../reference/providers/README.md)): cached no-input discovery,
`validate` before admission, start as the final authoritative guard, `authenticationRequired`
readiness with explicit recheck, and invalidation on authoritative authentication failure. Two
items remain open.

## Layer 2: explicit diagnose lane

Discovery answers "can this provider launch and initialize with this account?". A richer,
user-triggered `diagnose()` / environment test would verify the same command and configuration path
a real run uses, reporting independent checks rather than one boolean:

```text
checks: executable, version, authentication, protocol, workspace, interactionBridge,
        model, effort
overall: ready | degraded | unavailable
```

Each check carries a stable code (for example `provider_command_missing`,
`provider_auth_required`, `provider_probe_timed_out`, `provider_model_incompatible`), a short safe
message, optional bounded detail and a remediation hint. It runs on demand or after configuration
changes, never on every descriptor read, may be cached briefly and reused as preflight evidence.
It uses the same environment projection as execution, sends no paid inference unless no
zero-inference check exists (then a bounded explicit "hello" probe), and never returns raw probe
stdout/stderr. See [diagnostics and replay](diagnostics-and-replay.md).

## Quota-exhausted readiness

There is no readiness state for "authenticated but quota exhausted": the provider stays `ready`
and the next Turn fails with a structured provider failure. A quota signal MUST NOT become
`authenticationRequired` or unavailable-installation. Candidate direction: a separate capacity
dimension (degraded with a reset time when known) fed by
[capacity evidence](provider-capacity-and-admission.md), expiring at the reset time or on account
change. A transient 429 or overload is not quota exhaustion.

## Verification cases

1. valid login plus quota exhaustion keeps authentication ready and installation present;
2. transient 429/overload does not become authentication failure or quota;
3. a diagnose timeout leaves the affected check unknown;
4. assistant text containing "not logged in" never classifies authentication;
5. no secret or raw authentication payload appears in diagnose results.
