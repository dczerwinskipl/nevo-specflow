---
id: ideas.specflow-runtime.ai-adapters.liveness-watchdog
type: engineering
title: Provider liveness and watchdogs
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - liveness
  - timeout
  - process
  - cross-platform
read_when:
  - implementing provider idle/protocol-silence timeouts
  - debugging turns that hang during long-running tools or subprocesses
  - deciding whether silence proves an invocation is stuck
summary: >
  Separate protocol/output silence from underlying process activity and absolute runtime limits,
  using platform-specific process telemetry only as optional evidence so long-running tools are
  not killed merely because the provider protocol is quiet.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.runtime.ownership-and-lifecycle
  - ideas.specflow-runtime.ai-adapters.protocol-examples
---

# Provider liveness and watchdogs

## Problem

A provider may legitimately emit no protocol events while a child tool is doing real work:

- tests;
- build/compile;
- dependency restore;
- repository scan;
- formatter/linter;
- another CPU/IO-heavy subprocess.

A single "no canonical event for N minutes => kill" rule can therefore confuse **protocol silence**
with **operation inactivity**.

The legacy Runtime has a protocol-silence watchdog driven by qualifying canonical activity. That is
useful, but migration is a good point to separate evidence dimensions.

## Proposed liveness model

Track at least:

```text
protocolLastActivityAt
outputLastActivityAt
processLastActivityAt?   // optional/unknown where unavailable
spawnedAt
```

The exact storage may differ; the key is not to collapse all of these into one timestamp.

## Liveness is not progress

Process/output activity answers **"is something still alive or producing bytes?"**, not **"is the
Turn making useful semantic progress?"**.

Examples:

- a CPU spin can keep process counters changing forever;
- a subprocess can repeatedly write the same warning to stderr;
- a broken provider can emit heartbeats without moving the Turn forward.

Therefore process/output activity may delay an immediate "dead/hung" conclusion, but should not
reset an unbounded semantic-progress deadline forever. The target policy should keep liveness
evidence, progress/stall policy, and an optional hard runtime ceiling as separate concepts.

## Evidence sources

### Protocol activity

Strong semantic signal:

- parsed provider event;
- reasoning/commentary delta;
- tool transition;
- usage update;
- interaction event;
- terminal event.

### Raw output activity

Weaker liveness signal:

- non-empty stdout chunk;
- non-empty stderr chunk.

It proves the process stack is producing output, but does not itself prove semantic progress.

### Process activity

Optional supporting signal:

- CPU usage increased;
- process/tree IO counters increased;
- process membership changed because a child started/exited.

On Linux a practical sampler can use `/proc/<pid>/stat`, `/proc/<pid>/io`, and process-group
membership. This is useful evidence, not a cross-platform contract.

## Decision logic direction

Prefer a layered decision instead of one timer:

1. **protocol/progress silence threshold** marks the Turn as suspicious;
2. recent output/process activity is evidence that the process tree is alive and may justify a
   bounded grace period rather than immediate destructive termination;
3. if protocol plus all available liveness signals are stale, request timeout/cancellation;
4. if process/output activity continues without semantic progress, a separate stall policy may
   still time out the Turn;
5. an optional absolute maximum-runtime ceiling protects against CPU spin, noisy stderr loops, and
   other indefinitely-live failures.

These timeout reasons answer different questions and should remain distinguishable in diagnostics.

## Unknown is not inactive

If process telemetry is unavailable on a platform, permission is denied, or sampling fails:

- represent process activity as **unknown**;
- do not silently convert unknown to "no activity";
- fall back to cross-platform protocol/output evidence and a conservative timeout policy.

This prevents a Linux-only optimization from becoming a hidden correctness dependency.

## Tool awareness

An open tool should not automatically disable all watchdogs forever.

Instead:

- an open tool explains why provider protocol may be quiet;
- tool/process/output activity proves liveness, not necessarily forward progress;
- a tool with no protocol/output/process evidence for a sustained period can become dead/hung;
- a tool with continuing low-level activity but no semantic progress can still hit a stall policy;
- an absolute max runtime can remain as a final guard if configured.

## Diagnostics on watchdog fire

Record enough bounded metadata to debug false positives:

```text
spawnedAt
protocolLastActivityAt
outputLastActivityAt
processLastActivityAt or unknown
openToolCount
outputChunkCount
parsedEventCount
processActivityCount
platform
timeoutKind
```

Do not persist an unbounded process trace just to support the watchdog.

## Cross-platform strategy

### Linux

Optional rich process sampler via `/proc`:

- CPU ticks from process stat;
- read/write bytes from proc IO;
- process-group members.

### Windows

Do not emulate `/proc` assumptions.

Initial MVP can rely on:

- process existence/exit;
- stdout/stderr activity;
- protocol activity;
- existing tree-aware termination.

A future Windows process-activity sampler can use a native/OS-specific implementation behind the
same optional interface. It must not be required for correctness.

### macOS / other POSIX

Process-group ownership/termination is useful, but Linux `/proc` does not exist. Treat rich activity
sampling as unavailable unless a dedicated implementation is added.

## Verification cases

1. provider protocol is quiet while a child process continues useful CPU/IO work => do not
   immediately kill solely for protocol silence;
2. stderr/output activity proves liveness but does not reset semantic-progress timeout indefinitely;
3. CPU spin with no semantic progress eventually hits stall or hard-runtime policy;
4. repeated identical stderr heartbeat/noise cannot keep a Turn alive forever;
5. provider + output + process telemetry all stale => timeout requested;
6. process sampler unavailable => `unknown`, not false inactivity;
7. long-running open tool still times out if all available activity is stale;
8. watchdog request racing provider terminal completion settles once;
9. absolute max-runtime produces a distinct diagnostic/reason from inactivity/stall timeout.

## Migration note

Do not blindly reuse the legacy default timeout value as a product decision. First separate the
signals; then choose/configure durations with real workloads.
