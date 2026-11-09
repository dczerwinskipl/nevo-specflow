---
id: ideas.specflow-runtime.ai-adapters.session-resume-recovery
type: engineering
title: Provider session resume and recovery follow-ups
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - resume
  - recovery
  - context
read_when:
  - handling a provider reporting that a native session no longer exists
  - designing provider context rotation
  - extending recovery of unknown Turns with provider evidence
summary: >
  Open resume/recovery work beyond exact-context continuation and conservative unknown recovery:
  explicit native-session-not-found reset, provider context rotation, and positive provider
  reconciliation.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.provider-migration-plan
  - architecture.ai.session-storage-and-lifecycle
  - architecture.ai.canonical-session-turn-work
---

# Provider session resume and recovery follow-ups

Implemented today: continuation uses only the exact persisted native context in the same
account/workspace, there is no resume-to-new fallback, and recovery follows
[positive evidence](../../../architecture/ai/session-storage-and-lifecycle.md#positive-evidence-and-operator-recovery).
Three items remain.

## Native-session-not-found reset

A provider may deterministically report that a native session is gone (`session not found`,
`unknown conversation`, incompatible/corrupted history). There is no reset path today; the binding
stays in place. Candidate explicit recovery for an evidenced stale-session class only:

1. invalidate the stale provider-native binding;
2. establish a fresh native context, without replaying the failed input unless replay safety is
   proven (the failure occurred before dispatch);
3. persist the new `ProviderSessionRef` and record "native continuity reset" with its reason in
   canonical history.

The canonical Session survives; prior Turns stay visible, and the next invocation may need canonical
handoff context because native hidden history is gone. Authentication, quota, invalid request and
transport loss with possibly executed work never trigger a reset.

## Context management and rotation

A capability such as `nativeContextManagement = confirmed | likely | unknown | none` would let
Runtime avoid rotating contexts the provider already compacts. For providers that do not manage
context, a configurable rotation policy (Turn count, accumulated input tokens, age, explicit
context-too-large signal) is a later decision; fixed external thresholds are not defaults.

## Positive reconciliation

Possibly dispatched execution without an authoritative outcome stays unknown. Provider-specific
positive evidence that the original invocation stopped and its actions have known disposition is
tracked as F19 in the [provider capability backlog](../provider-migration-plan.md#f19--positive-reconciliation-for-currently-unknown-execution).

## Verification cases

1. deterministic "session not found" can reset native continuity once, with a recorded reason;
2. authentication or quota failure never triggers a reset;
3. failure after possible tool execution stays unknown rather than auto-replayed;
4. a late result from an invalidated invocation cannot bind the new native context;
5. canonical history is reload-equivalent after a reset.
