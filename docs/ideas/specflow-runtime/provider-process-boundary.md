---
id: ideas.specflow-runtime.provider-process-boundary
type: reference
title: Shared provider process boundary implementation
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, process, migration, diagnostics]
read_when:
  - implementing a real Session provider adapter
  - checking process ownership and diagnostics limits
summary: >
  P1 implementation surface for explicit process environments, bounded protocol framing,
  private diagnostics and invocation cleanup before real provider adapters are enabled.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - architecture.ai.provider-boundary
  - reference.protocols.session-provider-driver
---

# Shared provider process boundary

P1 lives in Runtime Sessions `providers/process/`, included in the single migration PR #98. It is a private
transport prerequisite, not a second Session model or public provider registry. No real provider
is enabled by this package. The next package is the Claude adapter; Codex and Antigravity follow.
Writable dispatch still needs the separate Engine effect claim/settlement contract.

Legacy evidence is `D:/repos/git/nevo` at `10bded58`, especially `process-termination.mjs`,
`raw-capture.mjs`, Claude's spawn/MCP-config paths and Codex's app-server launcher. Their mechanics
are reimplemented against the current Runtime boundary rather than importing the old service.

## Adapter-facing operations

- `projectProviderEnvironment` constructs an immutable OS base plus named inherited inputs,
  explicit configuration, resolved secrets and reserved Runtime correlation. It never spreads the
  host environment. Windows names are normalized and conflicting inherited casing is rejected.
  Discovery and execution use the same projection; proxy/cloud inputs are adapter-owned additions.
- `createInvocationScope` owns a random private directory under a supplied absolute Runtime root.
  Register MCP/listener/transport cleanup immediately after acquisition with `defer`; create config
  files with `temporaryFile`. Keep startup acquisition inside a rollback try/finally until the
  process owner accepts the scope. Cleanup is idempotent, reversed and continues after failures.
- `launchOwnedProcess` accepts an absolute executable/cwd, separate argument array, projected
  environment, scope and AbortSignal. It uses no shell and hides Windows helper windows. Adapters
  resolve npm/script shims to a real native executable or Node entrypoint; P1 does not execute or
  parse arbitrary `.cmd`, `.bat` or PowerShell launchers.
- Consume `lines()` once. UTF-8 framing is pull-based and therefore backpressured; malformed or
  oversized frames fail explicitly. Input admits one pending write, bounded to 1 MiB.
- `done` reports OS process close, exit code and signal. It is not a provider terminal result.
  Authoritative provider outcome remains a protocol-specific adapter responsibility. Dispose as
  soon as that evidence permits, and always dispose on parser failure/cancellation. Ending the line
  consumer disposes automatically. A consumer using only `done` must explicitly dispose the handle.
- `dispose` stops the owned tree and closes streams, MCP registrations and files once. The returned
  process disposition and cleanup issues stay separate from canonical Turn outcome. Failed startup
  returns a safe error category and any cleanup issues; native exception strings are not exposed.

## Limits and retention

Protocol frame limit defaults to 1 MiB, configurable up to 8 MiB at the adapter boundary. There is
no transcript-sized residual buffer or queue of asynchronous per-line handlers. Protocol bytes are
not dropped because diagnostic retention fills.

Temporary files are exclusive-create, owner-mode where supported, limited to 32 files, 1 MiB each
and 4 MiB per scope. Cleanup registration is limited to 64 resources with a shared one-second
callback budget. Pending file writes get a separate one-second drain budget. Uncertain process or
resource settlement retains temporary files rather than deleting resources that may still be used.

Diagnostics are disabled by default and private to adapters. Enabled capture is sanitized in memory;
there is no raw disk recorder or public diagnostics endpoint. Exact resolved secrets, escaped/URL
forms and common credential structures are redacted after terminal-control normalization. Invalid
encoding and oversized partial diagnostic lines are dropped/marked, not forwarded as raw text.

Retained data is capped at 1 MiB per invocation and 100 MiB per store. Both invocation records and
retained frame metadata have explicit 1024-item limits. Head eviction is amortized constant time.
Settled records are evicted first at global/cardinality limits. Age eligibility is enforced during
open/read/write/finish/statistics, with a maximum configured age of seven days. `release` erases the
record and pending bookkeeping; captures do not survive Runtime exit. A disk/raw-capture feature
requires its own reviewed storage/GC policy before enablement.

## OS evidence and limitations

POSIX children start in a new process group. Stop signals and bounded escalation target that group;
group absence is the liveness test. The owner caches tree evidence when the root exits so a handle
retained by adapter code does not re-run termination later. Escaped descendants and hostile PID/PGID
reuse are not certified by this package. A container may retain a killed orphan as a zombie; group
presence then yields `unknown` rather than falsely claiming verified absence.

Windows uses an absolute system `taskkill.exe /PID ... /T /F` while the root is still usable. A root
that already exited cannot safely supply tree discovery, so its tree disposition is `unknown`.
There is no fallback claiming success from killing only the root. No OS disposition proves that
arbitrary provider tools or filesystem effects settled; W2 must not release an Engine claim from it.

Platform mechanics follow [Node 24 child-process documentation](https://nodejs.org/docs/latest-v24.x/api/child_process.html)
and [Microsoft taskkill documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill).
No provider installation, credentials or live-model call is required for P1 tests.

## Verification

Windows focused tests pass: 21 tests and one Linux-only test skipped. On committed `8f14a586`,
Linux build/typecheck and the complete Runtime suite pass: 729 tests, including the orphan-group
case. Both platforms cover real process cancellation; fixtures require no model/API call.

Independent code review found sanitizer ordering, diagnostic acquisition rollback and diagnostic
metadata/performance defects. They were fixed with regressions and independently rechecked; the
reviewer found no remaining concrete blocker in the changed paths. The diagnostic stress probe now
retains 1024 bytes after 128 KiB of newline input; timing is informational, not a hardware SLA.
No real-provider acceptance or forced PID-reuse certification is claimed.
