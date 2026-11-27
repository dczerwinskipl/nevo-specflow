---
id: adr.0027-locks-released-only-on-positive-evidence
type: adr
title: A lock is released only on positive evidence that its owner is gone
status: current
date: 2026-11-27
scope: specflow
areas: [runtime, cli]
tags: [control-lock, crash-recovery, create, executor-identity, native-stop]
summary: >
  The Project Home control lock, and the unfinished journal of a Create, are released or taken
  over without an operator exactly when the recorded owner is provably gone: its PID is not
  running, or a different process now has that PID (another start or creation time, another
  boot). A live owner is never overridden; an owner that cannot be judged fails closed and is
  left to the operator command. The Runtime applies the rule at startup and every waiter applies
  it while it waits; a Create the Runtime accepted is recorded before the Engine reserves anything
  and is resumed or settled at the next start.
related:
  - adr.0016-engine-owned-document-commits
  - architecture.runtime.document-write-and-commit-queue
  - architecture.ai.provider-process-ownership
  - engineering.shared.specification-create-recovery
---

# 0027 — A lock is released only on positive evidence that its owner is gone

## Status

Current. Owner rules of dogfood round 4 (2026-11-27): prevent, don't recover; a Runtime crash must
not need an operator; no manual workarounds. Builds on the dead proof of document leases
([ADR 0016](0016-engine-owned-document-commits.md), decision 12) and the native-stop evidence of
PR #163 (PID plus process creation time).

## Context

Dogfood round 4 killed the Runtime two seconds after a Create with a first-step agent was
submitted, while the Create held the Project Home control lock to reserve its name. The lock file
stayed, naming the dead PID. No code released it: the waiter only timed out, the Runtime did not
look at it at startup, and the only remedy was `nevo-specflow specs documents recover
--confirmed-stopped`, an operator command the UI does not offer. Every workflow read and action of
the project answered `CONTROL_LOCK_BUSY`, and Create answered 503 after 25 s.

The Create itself was lost: the Engine journal is published only at the end of the reservation, so
nothing durable named the operation; the stored first-step intent was dropped at the next start as
"never reserved", and the operation answered `CREATE_NOT_FOUND`. A Create that dies after its
reservation needed the same operator assertion (`resumeInterruptedOperation`), because the journal
did not record who ran it.

Taking a lock over by age or timeout is unsafe (a slow live holder would lose it). A PID alone is
not proof either: PIDs are reused, on Windows quickly. The Engine already had a dead proof for
document leases, but it needs procfs, so on Windows every other PID was `unknown`.

## Decision

1. **The rule.** A lock or an unfinished operation owned by a process is released or taken over
   without an operator only on positive evidence that the owner is gone:
   - the recorded PID is not running on this host (`kill(pid, 0)` says `ESRCH`; on Linux, no
     `/proc/<pid>` in the same PID namespace, or a zombie);
   - a different process now has the PID: its start time differs from the recorded one (Linux:
     field 22 of `/proc/<pid>/stat`; Windows: the process creation time, read as in the native
     stop of PR #163), or it is another boot;
   - for the control lock: the record names this very process and thread, which does not hold it.
2. **Fail closed.** A live owner is never overridden. An owner that cannot be judged (another host
   or platform, a live PID whose start time cannot be read or was not recorded, unreadable lock
   metadata) is kept; only the operator command clears it, on the operator's assertion.
3. **Owner identity is recorded.** The control lock records its owner's executor identity (host,
   platform, PID, thread, PID namespace, start time, boot id) next to the PID; so does a Create
   journal (`executor`), updated when a process takes it over. On Windows the Runtime supplies the
   creation time (`setProcessStartTimeSource`); a CLI on Windows records none, so a live PID it left
   stays `unknown`. A lock written before owners were recorded has only a PID, and a PID absent from
   this host's process table proves nothing about a holder on another platform over the same files
   (WSL, a container): it is `unknown` and stays for the operator.
4. **Where the rule runs.** The Runtime applies it to the control lock at startup, before its
   startup passes; every waiter of the lock applies it on first contention and then once a second.
   **The removal is serialised:** a remover takes an exclusive breaker file next to the lock
   (published whole by a hard link, with its own owner record and the same evidence rule when it is
   left behind), reads the lock again under it and removes it only if it is byte-identical to the
   one judged. Two waiters that judged the same dead lock remove it once; the second never removes
   the first one's new lock. A Create retry takes over a journal whose executor is provably dead, as
   the operator assertion would, except where a Git child of the dead executor may still run (Windows
   does not kill children with their parent): `git-initiated` never, and `commit-writing` only once
   no commit lock of the checkout (`index.lock`, `HEAD.lock`, the branch's ref lock) remains after a
   bounded wait. Otherwise the retry answers `CREATE_GIT_UNSETTLED` at once, with the operator
   command.
5. **No operation the owner started is lost.** The Runtime records every Create that carries an
   operation id (request, principal and the accepting process) before the Engine reserves anything,
   and removes the record once the Engine Create completed. At the next start, and only then, the
   Runtime reruns a record ONCE with the same operation id, when its accepting process is provably
   gone and the principal may still create (and, with a first step, manage): the Engine replays a
   completed journal, resumes one whose executor is gone, or reserves one that never was (nothing was
   written before the journal). Its first-step intent is then settled once (the agent start is
   derived from the operation id). Anything else is settled with a reason instead of being rerun
   later (so a Specification never appears days after it was asked for): `CREATE_INTERRUPTED` (an
   owner that cannot be judged, or a rerun that did not finish), `CREATE_RESUME_FORBIDDEN`. The
   inspection answers `failed` with the code (or `recovery-required` with it when a journal holds
   something), never `CREATE_NOT_FOUND`; the page offers Try again and Back to form.
6. **Explain before action.** Where only an operator can go on, the code names why and the UI shows
   the reason and the exact command: `CREATE_GIT_UNSETTLED` (`nevo-specflow specs recover <operation>
--confirmed-stopped --confirmed-git-stopped` once no Git of it runs) and
   `CONTROL_LOCK_RECOVERY_REQUIRED` / `CONTROL_LOCK_CORRUPT` (`nevo-specflow specs documents recover
--confirmed-stopped` once every SpecFlow process of the project is stopped).
7. **The document queue.** The Runtime startup pass already resumes interrupted document writes,
   leases and manual commits whose executor is provably dead; with the Windows start time this now
   works on Windows too. `documents recover --confirmed-stopped` stays the operator's command for
   what positive evidence cannot cover (an unknown owner, a corrupt record); it is not run
   automatically, because its assertion is the operator's.

Not chosen: releasing by age, TTL or timeout; trusting a bare PID that runs; running the operator
recovery automatically.

## Consequences

- A Runtime killed while holding the control lock heals at its next start, and a Runtime waiting on
  a lock whose holder was killed takes it as soon as the evidence is there.
- A Create interrupted at any stage completes after the next restart, without a second
  Specification, branch or agent start, unless a Git command of it may still run.
- A lock left by a build before owners were recorded (the dogfood round 4 lock) needs the operator
  command once.
- Two cases still need the operator: a lock or journal whose owner cannot be judged, and a Create
  whose Git command may still run. The Runtime logs which one; the Create page shows the reason and
  the command. The other screens get the codes (`CONTROL_LOCK_RECOVERY_REQUIRED`); their wording is
  the UI's.
- A breaker left by a remover killed inside its compare-and-remove is cleared on the same evidence;
  two removers clearing the same dead breaker at once is the only residual race (both would then
  have to be inside a section of a few microseconds).
- A lock file emptied by a kill between its exclusive creation and its metadata write has no owner
  to judge and stays for the operator (the window is a few microseconds).
