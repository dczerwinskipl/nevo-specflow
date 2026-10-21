---
id: engineering.shared.specflow-git-recovery
type: engineering
title: Durable Engine Git mutations, process coordination and recovery
status: current
scope: specflow
areas: [runtime, testing, cli]
read_when:
  - changing journal stages, CAS or filesystem effects
  - reviewing SIGKILL, concurrency or Windows Git failures
summary: >
  Implementation rules for durable Create/Close intent, physical Git proof, cooperative
  claims and safe recovery.
related:
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specflow-project-home
  - engineering.shared.testing
---

# Durable Engine Git mutations, process coordination and recovery

## Protocol for mutating operations

1. Inspect exact project, worktree, branch and policy authority before admission.
2. Under the short Project Home control lock, reserve immutable operation intent and overlapping
   resources (Spec, checkout, Git ref and worktree administration) in a durable journal.
3. Release the lock **before** Git subprocesses or long filesystem work. A journal checkpoint
   must precede any external effect that could remain ambiguous after interruption.
4. Independently prove resulting HEAD, ref, index, tree, manifest, binding generation, Git instance
   and checkout incarnation before advancing the operation checkpoint.
5. Use registry compare-and-set for binding changes. Unknown result or possibly active Git process
   MUST NOT cause blind mutation retry, force cleanup or loss of journal evidence.
6. Reconcile with exact pinned physical evidence and explicit operator assertions where required.
   Terminalize only when all effects have been proven and resources safely released.

Cooperative locks do not fence arbitrary external editors, writers or Git subprocesses.
Elapsed time is not a quiescence lease. A retry of an unfinished Create from CLI/HTTP is a reader;
a successful completed retry verifies canonical identity and returns the same operation result.
An uncertain HTTP POST should be followed by the read-only Create operation lookup with its
original `operationId`, never a new operation in the guise of a retry.

A persisted Create status of `in-progress` does **not** prove its worker is alive. Likewise,
a SIGKILL after Git publication, group CAS or physical removal must be reconciled from actual
Git/filesystem/registry state, with no repeat merge/rebind/remove.

Before worktree disposal, verify ownership/incarnation, original physical index and complete
filesystem inventory, including ignored local data. Do not delete unmanaged files, automatically
delete a source branch or force-remove a worktree.

## Verification and limits

Use real Git repositories on Windows and POSIX, independent OS processes, process SIGKILL at
journal cut points, cross-transport HTTP/CLI parity and exact post-crash state assertions.
Checks for format, lint, typecheck, build, CodeQL, docs index and cross-platform lifecycle must
apply to the final reviewed SHA. An unexecuted test or queued CI check is not PASS.

Do not assume E3 workflow writer claims or E4/E5 provider/Turn states exist yet.
