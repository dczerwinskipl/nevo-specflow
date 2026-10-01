---
id: ideas.specflow-runtime.ai-adapters.provider-capacity-admission
type: engineering
title: Provider capacity and admission
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - ui
  - testing
tags:
  - quota
  - rate-limit
  - admission
  - retry
  - providers
read_when:
  - handling provider quota or usage-window limits
  - deciding whether to start a Turn after a known provider limit
  - showing provider capacity/reset information
  - implementing retryNotBefore
summary: >
  Treat provider capacity as optional structured evidence, preserve usage/reset windows when safely
  available, and apply a fresh authoritative retryNotBefore at Turn admission so known exhausted
  providers are not repeatedly invoked before their reset.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.usage-accounting
  - architecture.ai.provider-boundary
---

# Provider capacity and admission

## Problem

Correctly classifying quota is not enough if Runtime immediately starts another doomed Turn against
the same known-exhausted provider.

A recurring external failure pattern is:

```text
provider says limit reached, retry at T
-> adapter parses retryNotBefore=T
-> metadata is stored
-> admission ignores it
-> repeated runs fail until T
```

The useful idea is to decide whether fresh capacity evidence belongs in **admission**, not only in
error rendering.

## Keep three concepts distinct

### Burst/transient rate limit

Examples:

- request/minute or token/minute throttle;
- short provider overload;
- `429` with short backoff.

### Account/session quota window

Examples:

- 5-hour usage window;
- weekly limit;
- credit/extra-usage exhaustion;
- provider account capacity.

### General provider readiness

Installed, authenticated and transport/upstream usable.

Quota exhaustion should not turn installation/auth state false.

## Candidate capacity snapshot

Where a provider exposes a safe structured source, an adapter may expose conceptually:

```text
ProviderCapacitySnapshot
  observedAt
  source
  windows[]
    kind/label
    usedPercent?
    resetsAt?
    valueLabel?
  retryNotBefore?
  provenance?
```

This is an optional capability, not a requirement for every provider.

## Prefer structured/native sources

Useful sources for a particular field include:

- structured provider failure payload with reset timestamp;
- provider usage/quota API intended for the active auth mode;
- safe native CLI/RPC status command;
- narrowly-scoped trusted failure text.

Avoid scraping an interactive terminal UI when a stable structured source exists.

A quota probe that launches a heavyweight interactive process can leak processes, consume resources,
or break when CLI flags change.

## Probe isolation

Capacity discovery should not become a dependency of normal provider availability.

Candidate rules:

- bounded timeout;
- provider failures isolated independently;
- failed capacity fetch means "unknown", not "provider unavailable";
- timeout leaves no PTY/child process behind;
- polling cadence is bounded;
- probe uses the same provider account/auth source as execution.

## Admission from retryNotBefore

When fresh authoritative evidence says:

```text
retryNotBefore = T
```

Runtime can refuse/defer a new **automatic** Turn against the same relevant capacity scope until `T`.

The scope matters:

- provider-wide or model-specific?
- account/auth-source-specific?
- Session-specific?
- short burst throttle or long-window quota?

Do not globally block all provider work because one ambiguous text message mentioned a limit.

## Freshness and invalidation

Capacity evidence expires.

Re-evaluate when:

- reset timestamp passes;
- auth/account changes;
- provider configuration changes;
- model changes for a model-specific limit;
- successful Turn proves the prior hold stale;
- provider reports a newer window.

One quota failure must not become an indefinite provider-health state.

## Explicit user retry vs automation

For automatic scheduler/orchestration work, respecting a trustworthy `retryNotBefore` prevents error
storms and wasted provider invocations.

For an explicit user-triggered retry, product behavior may choose to block, warn/allow override, or
allow retry when evidence confidence is low. That is a later product/spec decision; the adapter
supplies evidence.

## Multiple providers

Capacity discovery should isolate providers independently.

One provider's quota endpoint failing must not fail a providers page or block another provider.

## Security

Capacity APIs may require bearer credentials.

- use the same auth boundary as provider execution;
- never persist/log credential values;
- bound error-response excerpts;
- sanitize response diagnostics;
- distinguish auth-refresh failure from quota failure.

## Verification cases

1. structured reset timestamp becomes `retryNotBefore`;
2. ambiguous reset text does not invent a timestamp;
3. fresh long-window quota prevents repeated automatic doomed admission;
4. reset expiry removes the hold;
5. account/auth-source change does not inherit an unrelated hold;
6. model-specific capacity does not globally block all models;
7. quota probe timeout leaves capacity unknown and cleans resources;
8. one provider capacity failure does not fail aggregation for others;
9. successful Turn invalidates stale capacity block;
10. capacity failure never becomes "not installed".

## Migration note

The valuable MVP idea is **capacity evidence influencing admission**, not a large quota dashboard.
The first implementation can consume `retryNotBefore` from real provider failures and add richer
quota-window discovery later.
