---
id: engineering.shared.async-and-lifecycle
type: engineering
title: Async and lifecycle
status: current
read_when:
  - implementing long-lived runtime or server code
  - starting child processes or streaming work
  - adding cancellation, shutdown, timers, or listeners
summary: >
  Shared lifecycle rules for async work: long-lived code must be cancellable and
  non-blocking, resources have explicit owners, child processes distinguish startup
  from completion, and cleanup is deterministic.
related:
  - engineering.shared.effects-and-io
  - engineering.shared.code-organization
  - engineering.shared.testing
---

# Async and lifecycle

Short-lived bounded tooling may use synchronous filesystem/process operations when that
is materially simpler and there is no concurrency, streaming, or cancellation need.

Long-lived Runtime code must use asynchronous I/O and must not block the event loop.

## Cancellation

Propagate `AbortSignal` across long-running operations. Cancellation is part of the
operation contract, not an afterthought at the transport layer.

## Resource ownership

Every child process, timer, listener, stream, connection, and other long-lived resource
has one explicit owner responsible for cleanup on completion, cancellation,
disconnect, and shutdown.

Avoid multiple competing lifecycle owners for the same resource.

## Child processes

Use async `execFile` for a known executable with bounded output. Use `spawn` for
long-running, streamed, or cancellable work.

Avoid shell execution unless shell expansion/pipelines are genuinely required.

Handle startup errors separately from process completion and prevent double-completion
between `error` and `close`. Preserve exit code, signal, and relevant diagnostics on
failure.
