---
id: engineering.shared.specification-create-recovery
type: engineering
title: Interrupted Specification Create recovery
status: current
scope: specflow
areas: [runtime, cli, testing]
read_when:
  - an Engine Create reports OPERATION_INTERRUPTED or recovery-required
  - inspecting or clearing stale Create journal resources
summary: >-
  Operator steps for resuming or safely clearing an interrupted Create without orphaning workspace or Git effects.
related:
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specification-create-lifecycle
  - engineering.shared.specflow-git-recovery
---

# Interrupted Specification Create recovery

The Engine's journal, checkout identity and observed Git effects govern recovery. Elapsed time alone does not prove the previous worker stopped. The journal must not be deleted if any durable effect may exist.

## Recovering a stuck Create (operator procedure and known gap)

A crash, `kill -9`, power loss or a late error after reservation leaves the Create journal non terminal
(`recovery-required` in the operation panel, or `OPERATION_INTERRUPTED` after 5 minutes without a live
writer). The journal keeps holding its slug, its branch/worktree path and (for a linked workspace) a
capacity slot until it is resolved; the 7 day retention only removes `completed` journals.

**Automatic resume after a Runtime crash.** The journal records its executor (PID, start time, host).
The Runtime records every Create it accepts before the Engine reserves anything and, at its next start, runs
each one again with the same operation id: a journal whose executor is provably gone (its PID not running,
or reused by a process with another start or creation time) is taken over and completed, a Create that died
before its reservation is reserved now, and its first-step agent is started once
([ADR 0027](../../architecture/decisions/0027-locks-released-only-on-positive-evidence.md)). Elapsed time
never counts as evidence. What stays for the operator: a journal whose executor cannot be judged (another
host, no recorded executor) and a journal stopped at `git-initiated`, where a Git child of the dead process
may still run. **There is no HTTP or UI action for those (known gap).** What the operator can do:

1. **Resume (preferred).** Stop whatever may still run the Create, then run
   `nevo-specflow specs recover <operation-id> --confirmed-stopped` (add `--confirmed-git-stopped` when the
   journal is at the Git stage, i.e. a new worktree was being provisioned). It calls the Engine's
   `resumeInterruptedCreateOperation` (the `resumeInterruptedOperation` / `confirmInterruptedGitSettled`
   assertions), replays the journal with the intent it recorded and drives it to `completed`. The Engine
   still verifies refs, paths, HEAD and committed bytes and fails closed on a mismatch.
2. **Abandon (manual).** Only when no branch, worktree, spec folder, commit or registry entry of that operation
   exists (check `git worktree list`, `git branch`, `specs/active/<slug>` and the registry): delete
   `<Project Home>/.nevo/local/state/engine/operations/create/<operation-id>.json` and the folder
   `<operation-id>.payload` next to it while no Create runs. A journal whose effects exist must be resumed, not
   deleted, or the slug/branch is orphaned.
3. A crash between creating and renaming a journal write can leave `.<id>.json.<uuid>.tmp` files in the same
   folder; they are ignored by every reader and swept after one hour by the next reservation.

A UI/HTTP resume or abandon action, and garbage collection of journals that never produced a Git effect, remain
follow-ups.
