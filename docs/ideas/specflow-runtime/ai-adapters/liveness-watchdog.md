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

1. **protocol silence threshold** may mark/diagnose the turn as suspicious;
2. recent output or process activity suppresses destructive "hung" action;
3. if protocol and all available liveness signals are stale, request timeout/cancellation;
4. use a separate absolute maximum-runtime policy if one is desired for runaway operations.

The absolute-runtime limit answers a different question from inactivity and should not share the
same reason code.

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
- tool/process/output activity keeps the invocation alive;
- a tool with no protocol/output/process evidence for a sustained period can still become hung;
- absolute max runtime can remain as a final guard if configured.

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

1. provider silent while a child process continues CPU/IO work => no inactivity timeout;
2. provider silent but stderr heartbeat/output continues => no inactivity timeout;
3. provider + output + process telemetry all stale => timeout requested;
4. process sampler unavailable => `unknown`, not false inactivity;
5. long-running open tool still times out if all available activity is stale;
6. protocol event resets protocol silence;
7. watchdog request racing provider terminal completion settles once;
8. absolute max-runtime produces a distinct diagnostic/reason from inactivity timeout.

## Migration note

Do not blindly reuse the legacy default timeout value as a product decision. First separate the
signals; then choose/configure durations with real workloads.
