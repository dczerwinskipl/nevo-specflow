---
id: ideas.specflow-runtime.ai-adapters.migration-inspection-map
type: reference
title: Legacy adapter migration inspection map
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - migration
  - legacy
  - providers
  - inspection
read_when:
  - migrating legacy Nevo provider behavior into SpecFlow Runtime
  - deciding which legacy behavior to preserve, harden, or deliberately drop
summary: >
  Concrete legacy Nevo files and symbols worth inspecting during provider migration, grouped by
  hardening concern so an implementation agent can go directly to the relevant behavior instead
  of rediscovering it from historical logs.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
---

# Legacy adapter migration inspection map

This document is observational and intentionally thin. Legacy code is **evidence of existing
behavior**, not an authoritative architecture source. It points an implementation agent to the
places that need inspection; the linked idea documents own candidate interpretation.

Target repository architecture wins when the legacy implementation conflicts with current SpecFlow
documents.

## Error classification

### Claude

Legacy file:

```text
tools/dashboard/server/ai/providers/claude/provider.mjs
```

Inspect:

- `mapClaudeError`;
- handling of terminal `result` / `error` events;
- use of `api_error_status`;
- stderr handling on process close.

Review against:

- [Evidence-based provider error classification](error-classification.md);
- [Provider error and limit evidence](provider-error-examples.md).

Focus on evidence provenance, provider-private status/code details, and which legacy semantic
categories still fit the target architecture.

### Antigravity/Gemini-style adapter

Legacy file:

```text
tools/dashboard/server/ai/providers/antigravity/provider.mjs
```

Inspect:

- `mapAntigravityError`;
- `error_message` step handling;
- repeated-empty-error-message stall detection;
- terminal `ERROR` reclassification when a substantive non-echoed response exists.

Review the observed special cases against
[Provider error and limit evidence](provider-error-examples.md); do not re-derive the target mapping
from this inspection map.

## Availability, authentication, and readiness

Legacy files:

```text
tools/dashboard/server/ai/providers/registry.mjs
tools/dashboard/server/ai/providers/claude/provider.mjs
tools/dashboard/server/ai/providers/codex/provider.mjs
tools/dashboard/server/ai/providers/antigravity/provider.mjs
```

Inspect:

- `AgentProviderRegistry.descriptors()` propagation of `installed`, `status`, `version`,
  `authenticated`, and `unavailableReason`;
- each provider's `isAvailable()`;
- executable/version probes;
- legacy startup failure mapping to the authentication-failure category
  (legacy code: `AI_AUTH_FAILED`).

Legacy evidence includes an optional `authenticated` health dimension and a registry capable of
propagating it, while legacy `isAvailable()` implementations mostly prove executable availability.
The target contract is not yet defined.

See [Provider readiness and authentication](provider-readiness-and-auth.md) for the candidate
migration direction.

## Model selection and reasoning effort

Legacy files:

```text
tools/dashboard/server/ai/model/model-catalog.mjs
tools/dashboard/server/ai/providers/claude/provider.mjs
tools/dashboard/server/ai/providers/codex/provider.mjs
tools/dashboard/server/ai/providers/codex/app-server-client.mjs
tools/dashboard/server/ai/providers/antigravity/provider.mjs
```

Inspect:

- `AgentModelDescriptor` / model trait validation;
- Claude curated/configured catalog;
- Codex native `model/list` mapping;
- Antigravity `agy models` parsing;
- Turn-level normalization of `effort` / legacy `reasoningEffort`.

Inspect which fields are actually evidenced by each source rather than copying the legacy
descriptor mechanically.

See [Model selection and reasoning effort](model-selection-and-effort.md), especially the
field-specific provenance rules.

## Commentary / final answer / reasoning

### Claude

Legacy file:

```text
tools/dashboard/server/ai/providers/claude/provider.mjs
```

Inspect the stream parser around:

- `pendingCommentary`;
- `activeTools`;
- `thinking` / `thinking_delta`;
- `content_block_start`;
- `content_block_delta`;
- terminal `result`.

Compare this behavior with [Provider output semantics](output-semantics.md) and
[Provider protocol mapping examples](protocol-examples.md).

### Codex

Legacy file:

```text
tools/dashboard/server/ai/providers/codex/provider.mjs
```

Inspect:

- `AGENT_MESSAGE_PHASES`;
- `#agentMessageDelta`;
- `#itemCompleted`;
- `#beginAgentMessage`;
- `#publishSupersededUnphasedMessages`;
- `#publishTerminalUnphasedMessages`;
- reasoning notification handlers.

Compare the legacy phase/buffering behavior with
[Provider output semantics](output-semantics.md).

### Antigravity/Gemini-style adapter

Legacy file:

```text
tools/dashboard/server/ai/providers/antigravity/provider.mjs
```

Inspect:

- `pendingAssistantText`;
- `committedCommentary`;
- `flushPendingAsCommentary`;
- terminal response deduplication;
- `extractFinalResponse`.

## Late provider session identity / invocation race

Legacy file:

```text
tools/dashboard/server/ai/sessions/turns/runtime.mjs
```

Inspect:

- local `setProviderSessionId` callback inside turn admission;
- `#activeBySession`;
- `#registerActiveBySession`;
- terminal cleanup/removal;
- provider result path that may report `providerSessionId` after asynchronous execution.

Use [Invocation ownership and late-event fencing](invocation-ownership-and-late-events.md) for the
risky sequence, candidate fence, and regression cases. This map only identifies the legacy mutation
points.

## Canonical/provider correlation

Legacy file:

```text
tools/dashboard/server/ai/interactions/mcp/interaction-registry.mjs
```

Inspect:

- `#activeTurnsBySession`: currently composite provider + provider session;
- `#pendingBySession`: historically keyed by bare provider session ID;
- `cancelSession(providerSessionId)`;
- `#cleanup`.

Migration objective:

- one composite `ProviderSessionRef` rule for all provider-native indexing.

## Protocol silence / liveness

Legacy files:

```text
tools/dashboard/server/ai/sessions/turns/coordinator.mjs
tools/dashboard/server/ai/sessions/turns/runtime.mjs
```

Inspect:

- `#lastQualifyingActivityAt`;
- `checkProtocolSilence`;
- Runtime watchdog loop using `idleTimeoutMs`;
- suppression rules for terminal/unknown/interaction/tool states.

Question to answer during implementation:

> Can a long-running tool/subprocess be active while no canonical/provider protocol event qualifies
> as activity?

If yes, preserve protocol-silence semantics but add separate output/process activity evidence before
destructive timeout.

## Resource lifetime

Provider files to inspect:

```text
tools/dashboard/server/ai/providers/claude/provider.mjs
tools/dashboard/server/ai/providers/codex/provider.mjs
tools/dashboard/server/ai/providers/antigravity/provider.mjs
```

Search for acquisition and cleanup of:

- child processes;
- signal/abort listeners;
- temporary settings/config files;
- temporary MCP config;
- MCP interaction registrations;
- active operation maps;
- timers/watchdogs;
- raw capture;
- continuation/session bookkeeping.

The migration task is not to preserve every cleanup function. It is to identify **which resources
exist, who owns them, when ownership begins, and what must happen on partial startup** before
centralizing settlement.

## Raw capture

Legacy file:

```text
tools/dashboard/server/ai/providers/raw-capture.mjs
```

Inspect:

- `#sessionWriteQueues`;
- `#sessionDirMap`;
- `#loggedSessions`;
- `resolveSessionDirName`;
- `flushRawCapture`;
- `flushRawCaptureBounded`;
- `flushAllRawCapture`.

Review these structures against [Raw provider diagnostics retention](raw-diagnostics-retention.md),
including in-memory release and path-safety behavior.

## Process-tree termination

Legacy file:

```text
tools/dashboard/server/ai/providers/process-termination.mjs
```

Inspect before replacing anything:

- `getProcessTreeSpawnOptions`;
- `isProcessAlive`;
- `isProcessGroupAlive`;
- `waitForChildExit`;
- `terminateChildProcess`.

This is primarily a **do-not-regress** inspection area. Use
[Cross-platform provider process runtime](cross-platform-process-runtime.md) for the behavior and
portability guidance instead of duplicating it here.

## Tests worth mining for fixtures

Legacy tests:

```text
tools/dashboard/tests/claude-provider.test.mjs
tools/dashboard/tests/ai-turn-runtime.test.mjs
tools/dashboard/tests/final-answer-lifecycle.test.mjs
tools/dashboard/tests/binding-service.test.mjs
tools/dashboard/tests/session-task-bootstrap.test.mjs
```

Use them to discover already-protected behavior, then rewrite tests around the new package boundary.
Do not migrate test structure mechanically if the new architecture offers a cleaner fixture/replay
boundary.
