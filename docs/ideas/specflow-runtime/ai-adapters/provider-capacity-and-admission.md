---
id: ideas.specflow-runtime.ai-adapters.provider-capacity-admission
type: engineering
title: Provider capacity and admission
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - quota
  - admission
  - scheduling
read_when:
  - preventing repeated automatic Turns against a known-exhausted provider
  - using provider limit windows or reset times in admission
summary: >
  Open item: let fresh, trustworthy capacity evidence (retryNotBefore, limit windows) defer
  automatic Turn admission for the affected scope, without turning quota into readiness or
  authentication failure.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - reference.api.session-telemetry
  - architecture.ai.provider-boundary
---

# Provider capacity and admission

Implemented today: provider limit windows are observed as Session telemetry (`limits` group, native
push for Claude, read-only refresh for Codex), gated by `session.view-provider-limits`
([telemetry API](../../../reference/api/session-telemetry.md)). Admission ignores them, so automatic
work can repeatedly start doomed Turns until a reset.

## Admission from `retryNotBefore`

When fresh authoritative evidence (a structured reset time from a
[classified quota failure](error-classification.md) or an observed limit window) says capacity
returns at `T`, Runtime could refuse or defer a new **automatic** Turn against the same capacity
scope until `T`.

- Scope matters: provider-wide versus model-specific, account/authentication source, short burst
  throttle versus long-window quota. One ambiguous message must not block all provider work.
- Evidence expires: at the reset time, on account/authentication or configuration change, on model
  change for a model-specific limit, after a successful Turn, or when a newer window is reported.
- Explicit user retries are a product decision (block, warn and allow, or allow); the adapter only
  supplies evidence.
- Capacity probing stays isolated: bounded, same account/environment as execution, failure means
  `unknown`, never "provider unavailable", and one provider's failure never blocks another.

## Verification cases

1. fresh long-window quota prevents repeated automatic admission until reset;
2. reset expiry or a successful Turn removes the hold;
3. an account change does not inherit an unrelated hold;
4. a model-specific limit does not block other models;
5. capacity failure never becomes "not installed" or "not authenticated".
