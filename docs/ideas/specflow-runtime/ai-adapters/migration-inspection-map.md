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

This document is observational. Legacy code is **evidence of existing behavior**, not an
authoritative architecture source.

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

What to preserve:

- canonical error categories that still fit current architecture;
- provider-specific status/code details.

What to replace/harden:

- flattening arbitrary failure text into one `message` before classification;
- broad regex matching without evidence provenance;
- quota/rate-limit token coverage.

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

Important evidence:

- an empty `error_message` step can be routine diagnostic noise;
- a sustained sequence of those steps with no other progress may represent a stall;
- `status: ERROR` has historically carried advisory/stale diagnostics beside a valid response;
- `FAILED`, `TIMEOUT`, and bare error-only cases should not be generalized from that special
  `ERROR` behavior.

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
- startup failure mapping to `AI_AUTH_FAILED`.

Known migration gap:

- the neutral health contract already supports `authenticated?: boolean`;
- the registry already propagates an adapter-provided authentication state;
- current provider `isAvailable()` implementations primarily prove executable availability and do
  not establish login readiness.

Migration objective:

- preserve a cheap installation check;
- add an explicit bounded readiness/environment test for auth and selected configuration;
- fail early when fresh evidence says login is required;
- retain `startTurn()` as the final authoritative auth guard;
- never turn quota/rate-limit into `installed: false` or `authenticated: false`.

See [Provider readiness and authentication](provider-readiness-and-auth.md).

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

Important migration facts:

- Codex already has authoritative per-model `supportedReasoningEfforts` and
  `defaultReasoningEffort`; preserve this instead of replacing it with a static Cartesian model
  list;
- Claude can keep curated/configured effort metadata, but installed CLI support/version should be
  checked separately;
- Antigravity model IDs must remain opaque because `agy models` currently proves ID/label only;
  suffixes such as `-high` must not be stripped without provider evidence.

See [Model selection and reasoning effort](model-selection-and-effort.md).

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

Behavior worth preserving conceptually:

- thinking is reasoning;
- tool start proves preceding pending assistant text is commentary;
- text during active tool orchestration is commentary;
- remaining pending assistant text can become final on authoritative successful terminal;
- terminal `result` is a fallback, not a second duplicate answer.

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

Behavior worth preserving:

- explicit `commentary` / `final_answer` phase wins;
- reasoning remains separate;
- superseded unphased messages become commentary;
- only the final remaining unphased message may become legacy final-answer fallback;
- one agent message cannot be published under two canonical phases.

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

Specific risky sequence to regression-test before porting behavior:

1. start new Turn without native session ID;
2. provider has not established identity yet;
3. cancel/terminalize Turn;
4. provider later returns/callbacks native ID;
5. ensure no active alias is restored and no canonical mutation occurs.

Do not solve only at the binding-service layer; the concern is **invocation ownership**.

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

Known migration concern:

- flush waits for queues but legacy bookkeeping has no explicit per-session release path;
- preserve path traversal, reserved-name, length, hashing, and case-collision safeguards;
- add explicit memory release and bounded on-disk retention.

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

Behavior already worth preserving:

- POSIX process-group ownership and signalling;
- Windows tree-aware `taskkill.exe /PID ... /T /F`;
- bounded escalation;
- post-termination liveness verification;
- explicit separation between OS process death and semantic provider outcome.

This area is primarily a **do-not-regress** migration concern, not a request for a new abstraction
for its own sake.

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
