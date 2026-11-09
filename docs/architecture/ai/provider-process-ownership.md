---
id: architecture.ai.provider-process-ownership
type: architecture
title: Provider process ownership and limits
status: current
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, process, windows, posix, cleanup]
read_when:
  - launching, cancelling or settling a provider process
  - changing process-tree termination or Windows Job Object ownership
  - adding provider temporary files, cleanup registrations or protocol framing
  - packaging native process bindings
summary: >
  One Runtime owner per provider invocation: POSIX process-group and Windows Job Object
  tree ownership, positive settlement evidence, no-shell launch, bounded framing, input,
  temporary files and cleanup, and the packaged Koffi binding.
related:
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
  - reference.protocols.session-provider-driver
  - architecture.ai.session-storage-and-lifecycle
---

# Provider process ownership and limits

The shared transport lives in Runtime Sessions `providers/process/`. It is private to provider
adapters; it is not a second Session model or a public provider registry. Platform mechanics sit
behind one owner (`launchOwnedProcess`); lifecycle settlement decides when it is invoked. Adapters
MUST NOT mix direct `child.kill`, group signals, `taskkill` or independent escalation branches.

## Settlement evidence

Process disposition is OS liveness evidence only. It MUST NOT be used as a provider outcome
(completed, failed, cancelled), and it does not prove that arbitrary tools, OS services or
filesystem effects outside the owned tree have settled. Canonical outcome arbitration stays with
the Runtime coordinator; authoritative provider outcome is a protocol-specific adapter fact.

The disposition is `stopped` only on positive evidence. Uncertainty is `unknown`
(`unverified-tree`), never a fallback claim of success. The owner caches tree evidence when the
root exits, so a handle retained by adapter code does not re-run termination later.

## POSIX

- The provider starts as a new process-group leader.
- Stop sends `SIGINT` to the **group**, waits a bounded grace period, then sends group `SIGKILL`
  (each budget defaults to 1 s, at most 2 s).
- Group absence (`ESRCH`) is the liveness test. A recycled root PID is never targeted as fallback.
- A container may retain a killed orphan as a zombie; group presence then yields `unknown`.
  Escaped descendants and hostile PID/PGID reuse are not certified.

## Windows

Every owned invocation runs inside a Runtime-created, uniquely named local Job Object with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and no breakaway flag. Runtime retains its non-inherited
handle for the invocation lifetime, including after root exit.

- A trusted Node bootstrap opens the job, assigns itself, closes its temporary handle and reports
  ownership over a separate IPC channel. Runtime verifies exactly one admitted process before it
  permits start; only then does the bootstrap spawn the provider, whose descendants inherit
  membership. No provider code runs before assignment. Assigning an already running provider after
  an ordinary spawn is not acceptable.
- The bootstrap environment contains only the Windows system directory. The projected provider
  environment, including any Node preload options, crosses IPC after admission and applies only to
  the provider. The provider inherits standard streams, never the bootstrap IPC channel.
- If Runtime dies during admission, opening the missing job fails or closing the last handle
  terminates the job; abrupt Runtime death after admission also kills the job.
- Settlement requires a successful accounting query showing `ActiveProcesses = 0`. After observed
  root exit a bounded 100 ms accounting drain is allowed; remaining members are then terminated and
  zero is verified again (2 s budget). Explicit cancellation of a running root does not wait for the
  drain. Root or helper exit alone is never proof; query or termination failure is `unknown`.
- A Job Object owns process liveness. It is not a security or filesystem sandbox.

The Win32 bindings come from the pinned MIT-licensed Koffi dependency. The product tarball carries
its CommonJS loader and the Windows x64 and arm64 binaries under `native/` with third-party notices,
on every build platform; installation needs no compiler, install script or registry download.

## Launch

- `shell: false`, hidden Windows helper windows, absolute executable and working directory, a
  separate argument array (≤1 MiB serialized, no NUL).
- Adapters MUST resolve npm or script shims to a native executable or Node entrypoint. `.cmd`,
  `.bat` and `.ps1` launchers are rejected on Windows; they are never executed or parsed.
- The environment is the explicit projection from `projectProviderEnvironment`
  ([driver protocol](../../reference/protocols/session-provider-driver.md#process-environment)),
  never the ambient `process.env`.
- ENOENT maps to `UNAVAILABLE`; other startup failures to `START_FAILED` with cleanup issues.
  Native exception strings are not exposed.

## Streams and framing

- Output is consumed once through `lines()`. UTF-8 framing is pull-based and therefore
  backpressured; malformed or oversized frames fail with `PROTOCOL_FAILED`.
- The frame limit defaults to 1 MiB and is configurable up to 8 MiB at the adapter boundary. There
  is no transcript-sized residual buffer or queue of asynchronous per-line handlers. Protocol bytes
  are never dropped because diagnostic retention is full.
- Input admits one pending write at a time, at most 1 MiB; a concurrent write is `BUSY`.
- `done` reports OS close, exit code and signal, not a provider result. Ending the line consumer
  disposes automatically; a consumer that only awaits `done` MUST dispose explicitly. Parser
  failure and cancellation always dispose.

## Invocation scope and cleanup

`createInvocationScope` owns a random private directory under an absolute Runtime root.

- Register MCP, listener and transport cleanup with `defer` immediately after acquisition, at most
  64 registrations per scope. Keep startup acquisition inside a rollback `try/finally` until the
  process owner accepts the scope.
- `temporaryFile` creates exclusive, owner-mode (where supported) `.json`/`.txt` files with safe
  names, at most 32 files, 1 MiB each and 4 MiB per scope.
- Cleanup is idempotent, runs in reverse order, continues after failures and shares a one-second
  callback budget; pending file writes get a separate one-second drain.
- When process settlement is uncertain, or a cleanup or write timed out, temporary files are
  **retained** rather than deleted while they may still be in use (`PROCESS_NOT_STOPPED`,
  `CLEANUP_TIMEOUT`).

`dispose` stops the owned tree and closes streams, registrations and files once. The process
disposition and cleanup issues stay separate from the canonical Turn outcome.

## Test strategy

Unit tests inject platform/process operations rather than faking another OS. Real smoke coverage on
supported OS families covers what mocks cannot prove: executable resolution, tree termination,
temporary-file cleanup, path/case behavior and packaged startup. No provider installation,
credentials or model call is needed for process-boundary tests.
