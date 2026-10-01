---
id: ideas.specflow-runtime.ai-adapters.cross-platform-process-runtime
type: engineering
title: Cross-platform provider process runtime
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - process
  - windows
  - linux
  - macos
  - portability
read_when:
  - migrating provider process management
  - changing process-tree termination or liveness checks
  - adding platform-specific provider telemetry
summary: >
  Preserve OS-aware process-tree ownership and termination, isolate optional platform-specific
  liveness telemetry behind capability boundaries, and test paths/session ids/filesystem cleanup
  against Windows and POSIX semantics rather than assuming Linux behavior.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.liveness-watchdog
  - ideas.specflow-runtime.ai-adapters.resource-lifetime
  - ideas.specflow-runtime.ai-adapters.raw-diagnostics-retention
  - ideas.specflow-runtime.ai-adapters.process-environment-boundary
---

# Cross-platform provider process runtime

## Goal

Provider adapters execute local processes and touch filesystem/session state. MVP hardening must not
quietly optimize for one developer OS.

The migration should preserve already-solved cross-platform behavior and isolate any new
OS-specific optimization.

## Process-tree ownership

A useful existing strategy is:

### POSIX

- spawn provider process as a new process-group leader where appropriate;
- graceful signal the **process group**, not only the root PID;
- escalate to group `SIGKILL` after a bounded grace period;
- verify group/PID liveness after termination.

### Windows

- do not assume POSIX signal/process-group semantics;
- use tree-aware termination such as `taskkill.exe /PID <pid> /T /F`;
- invoke tree-aware termination while the root PID is still usable for descendant discovery;
- verify tracked liveness after termination where possible.

The exact helper may be refactored during migration, but this behavior should not be discarded in
favor of a simpler `child.kill()` implementation.

## Epistemic boundary

Process termination proves process liveness ended. It does **not** prove the provider semantically:

- completed;
- failed;
- cancelled.

Canonical outcome arbitration remains a Runtime concern.

## Process activity telemetry

Rich telemetry must be optional:

- Linux may inspect `/proc`;
- Windows requires a separate implementation if CPU/IO tree sampling is desired;
- macOS does not provide Linux `/proc`.

Expose a capability such as "activity sample available" or return `unknown`; never return fake
zero activity merely because the platform-specific sampler is absent.

## Executable probing

Use:

- `shell: false` by default;
- bounded version-probe timeout;
- explicit handling for ENOENT/not found;
- `windowsHide: true` when spawning probe windows is undesirable;
- command resolution that supports platform-specific launcher forms without injecting shell
  interpretation.

Do not build executable commands by concatenating untrusted strings into a shell command.

## Filesystem/session IDs

Opaque provider session IDs may contain values unsafe as directory names.

Cross-platform path logic should cover:

- separators;
- traversal tokens;
- Windows reserved device names;
- maximum practical segment lengths;
- case-insensitive collision behavior;
- Unicode normalization/collision concerns where relevant.

Canonical identity stays the original opaque value; only the filesystem representation is encoded.

## Temporary files

For provider config/settings/MCP files:

- create under an explicit temp/runtime-owned location;
- register deletion with the invocation resource scope immediately after creation;
- tolerate cleanup failure as diagnostic;
- ensure file handles/writers are closed before deletion, especially on Windows;
- do not assume unlink/rename of open files behaves like POSIX.

## Signals and cancellation

Provider cancellation should route through one OS-aware process owner.

Adapters should not mix:

- direct `child.kill`;
- negative PID group signaling;
- `taskkill`;
- independent timeout escalation;

in multiple branches. Put platform mechanics behind one resource operation and let lifecycle
settlement decide **when** it is invoked.

## Test strategy

Unit tests should inject platform/process operations rather than requiring CI to fake another OS.

Still run real smoke coverage on supported OS families for behaviors that Node mocks cannot prove:

- executable resolution;
- process-tree termination;
- temp file cleanup;
- path/case behavior;
- packaged runtime startup.

## Things not to "improve" during migration without evidence

- Do not replace working tree-aware termination merely to reduce code size.
- Do not require Linux `/proc` for the watchdog.
- Do not use shell-based process discovery as a universal abstraction.
- Do not let Windows limitations weaken terminal-state immutability.
- Do not derive provider/session identity from filesystem-safe encoded names.
