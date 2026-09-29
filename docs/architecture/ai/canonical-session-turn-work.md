---
id: architecture.ai.canonical-session-turn-work
type: architecture
title: Canonical AI Session, Turn, and Work model
status: current
read_when:
  - implementing AI sessions or turn lifecycle
  - persisting or projecting provider execution
  - adding AI interactions, tools, reasoning, or commentary
  - computing current activity, attention, or session readiness
summary: >
  AI execution is represented by a provider-neutral Session -> Turn -> Work -> ToolAction
  hierarchy. Terminal turns are immutable, one non-terminal turn is admitted per session,
  ordered work is canonical, and Runtime owns semantic readiness/current-activity
  projections rather than UI heuristics.
related:
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
  - architecture.principles.enforceable-invariants
  - product.specflow.ui.ai-session-ux
  - architecture.principles.normative-language
---

# Canonical AI Session, Turn, and Work model

Nevo SpecFlow models AI execution as structured work, not as a provider transcript.

Provider protocols differ substantially. The canonical model is the product/runtime contract that
those protocols map into.

## Hierarchy

```text
Session
└── Turn
    ├── Work: commentary
    ├── Work: reasoning
    ├── Work: interaction
    └── Work: tool
        ├── ToolAction
        └── ToolAction
```

### Session

A Session represents a provider-backed conversation/execution context.

A Session is the canonical product concept. Until an application-owned session ID is introduced,
its canonical provider-backed locator is `ProviderSessionRef = (provider, providerSessionId)`.
`providerSessionId` alone MUST NOT be treated as globally unique identity, and display name, file
path, task order, or UI route MUST NOT be used as session identity.

### Turn

A Turn is one logical execution boundary initiated by a user/application request.

A Turn owns:

- immutable identity;
- the user-visible request;
- execution mode/capabilities relevant to the operation;
- ordered Work;
- lifecycle state;
- optional final answer;
- optional terminal outcome.

A terminal Turn is immutable. Late provider events MAY be retained as diagnostics but MUST NOT
resurrect the Turn or append new canonical Work after terminalization.

### Work

Work is ordered, typed execution activity inside a Turn.

Typical kinds are:

- commentary/progress;
- reasoning;
- tool invocation;
- user interaction/question/permission.

Work items MUST have stable ordering and MUST NOT change kind after creation.

### ToolAction

A tool Work item may contain nested actions when one provider-level tool represents a compound
operation. Nested actions preserve detail without pretending each low-level action is a new
top-level Turn activity.

## Lifecycle

Canonical lifecycle semantics are provider-independent.

The model distinguishes:

- active execution;
- waiting without user action;
- requiring user attention;
- cancellation in progress;
- terminal completion, failure, cancellation, or interruption;
- unknown/unavailable when authoritative state cannot be established.

Provider strings such as "running", "blocked", "idle", or SDK-specific statuses are adapter input,
not product state.

## Admission

For one canonical provider/session identity, the Runtime admits at most one active non-terminal
Turn unless a future explicit concurrency model says otherwise.

Retries of the same logical start MUST be idempotent. A different conflicting start MUST fail
explicitly rather than race another Turn.

## Semantic projections are Runtime-owned

The UI MUST NOT infer canonical semantics by inspecting raw Work arrays or provider events.

Runtime/application code MUST compute canonical projections such as:

- current activity;
- whether user attention is required;
- summarized phase/status;
- session readiness (`ready`, `busy`, `requiresAttention`, `unavailable`).

All surfaces MUST consume the same projection logic and MUST NOT implement competing readiness,
attention, or current-activity heuristics.

## Interactions

User questions/permissions are first-class Work, with canonical interaction identity.

Provider-private request IDs MUST NOT leak into UI contracts. The adapter/runtime maps provider
correlation into stable canonical interaction IDs and validates responses against the active Turn.

An interaction that depended on a live provider operation MUST NOT remain falsely answerable after
that operation disappears. Restart recovery MUST either reconstruct it from authoritative state or
interrupt it.

## Persistence and replay

The Runtime MUST persist enough canonical execution state to rebuild an equivalent settled view
and to reconcile interrupted active work.

Persistence is not required to clone the provider's entire authoritative conversation history.
Provider history and SpecFlow execution state have different ownership.

Replay/live transport choices are adapters. The canonical model MUST NOT depend on SSE, WebSocket,
or a particular UI library.
