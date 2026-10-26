---
id: ideas.specflow-runtime.session-review-follow-up
type: engineering
title: PR 98 Session architecture review follow-up
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [sessions, review, recovery, migration]
read_when:
  - reviewing PR 98 architecture hardening
  - reconciling an unknown Session Turn
summary: >
  Tracks reproduced defects, safe recovery boundaries, Windows ownership blockers,
  measured SSE activity, compatibility staging and final verification requirements.
related:
  - ideas.specflow-runtime.provider-compatibility
  - ideas.specflow-runtime.claude-provider
  - ideas.specflow-runtime.session-migration-evidence
  - reference.api.sessions
---

# PR #98 architecture review follow-up

Review baseline: `9f92b3b63fe2d322488ad42c906827bd3cf0d449`, 2026-10-26.
One branch `feature/managed-sessions-foundation`, one PR #98. No automatic merge.
The unfinished Codex adapter was retained in the named local Git stash
`checkpoint: unfinished Codex adapter before PR98 architecture review`; it is excluded from this
hardening change. No Engine effect admission or new UI feature is introduced.

## Confirmed defects and changes

- **R01 remains a blocker.** Native Windows reproduction receives a valid terminal frame followed
  immediately by natural process exit, then obtains `unknown/unverified-tree` in 4/4 reviewer probes.
  Natural root exit before disposal reproduces it too. A live-root cancellation obtains
  `stopped/tree-killed`; that is not evidence for the exited-root case. A native PowerShell parent
  left a child retaining inherited pipes; the reviewer explicitly cleaned up that exact test child.
  Current taskkill cannot safely reconstruct membership from a stale PID. New characterization
  tests preserve uncertainty and the terminal frame; they do not claim this defect is fixed.
- **R02:** startup now settles an admitted real Turn as interrupted only when its persisted native
  dispatch barrier was not crossed. It never replays the input. Repeated start request IDs return the
  same admission. Confirmed context/account/workspace binding is retained for a subsequent explicit
  user intent. Dispatched/unconfirmed and dispatched/confirmed executions remain unknown, with safe
  reasons distinguishing missing context, unavailable provider evidence and missing settlement.
- **R03:** response admission removes the question from answerable attention but leaves its Work
  waiting. Only an explicit driver receipt identifying the private delivered keys completes that
  Work. Claude acknowledges a whole multi-question group after its single native write; partial
  answers remain admitted. Expiry includes all undelivered group members, including already admitted
  answers. Late receipts are fenced by invocation and terminal/unknown state. Failed stdin delivery
  records lost execution; duplicate command IDs replay admission without automatically retransmitting.
  A receipt proves transport delivery, not semantic native consumption. HTTP 202 acknowledges the
  canonical command, not successful delivery. Restart expires undelivered interactions.
- **R04:** normal requests stop at 48 active commands, reserving slots up to 64 for facts, dispatch,
  delivery receipts and close. At most 64 lifecycle requests may wait, FIFO with a 5 s admission
  deadline. Their invocation sequence remains serialized by the coordinator. Exhaustion/Worker loss
  is explicit rejection, not dropped success; a failed lifecycle write cannot fabricate a terminal
  result. A persistently unavailable store still requires restart recovery.
- **R05:** committed outbox changes wake subscribers without storing event payloads in a second queue.
  A revision fence prevents losing commits between read and wait. Idle authorization is refreshed
  every second; heartbeat remains 15 s. Replay, sequence gaps, capacity and backpressure retain the
  existing bounds. Notifications are local persistence signals, with no Fastify dependency in SQLite.
- **U01:** persist the exact create body/request ID in sessionStorage before dispatch, scoped to
  authenticated identity. Remount/lost response retries retain it even when provider discovery becomes
  unavailable. Confirmed success clears it. Missing/unwritable retention storage blocks dispatch.
  StrictMode and late completion after identity-owner unmount are covered.
- **U02:** content pages, pagination and in-flight reads are owned by session/content/revision identity.
  A new revision remounts the existing viewer; old transport responses cannot replace its preview.
- **U03:** existing controls remain. Questions explicitly allowing multiple selections are shown as
  unsupported instead of silently sending a subset through single-choice controls. The UI agent owns
  multi-select, provider/model/effort selection and the broader experience.

## Actual SSE measurement

Controlled Windows HTTP comparison uses 32 real idle sockets, four authenticated identities with
eight sockets each, and the same store/fixture around either the baseline route or new route.
No provider inference or Git work is involved. Counters wrap actual Store calls.

| Route                    | Measurement window | Event reads | Identity reads for authorization | Total Worker calls |
| ------------------------ | ------------------ | ----------- | -------------------------------- | ------------------ |
| `9f92b3b6` polling route | 1209 ms            | 352         | 352                              | 704                |
| Event-driven route       | 1210 ms            | 0           | 32                               | 32                 |

The committed regression repeats the 32-socket measurement and requires zero idle event reads,
while periodic identity reads and the real-socket revocation test verify revalidation. These are
short controlled measurements, not an inference about maximum production throughput.

## Positive evidence and operator recovery

| Evidence                                                                | Safe action                                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted native context and dispatch-intent=0 after owner death        | Interrupt that undispatched Turn; permit a new explicit intent using the original confirmed context and bindings. Never retry the original message. |
| Confirmed native context and dispatch-intent=1                          | Context identity alone does not prove the last operation stopped or completed. Retain unknown.                                                      |
| Dispatch-intent=1 without confirmed native context                      | A request may have executed. Retain unknown; never resend or allocate a replacement native context.                                                 |
| Failed native answer delivery/uncertain write                           | Retain admission/idempotency; mark operation unknown. Never automatically resend an answer.                                                         |
| Missing provider/account/workspace or unproven process-tree termination | Keep the Session unavailable for new Turns; restore/verify the original binding before any future reconciliation.                                   |

There is no force-success/force-failure endpoint. Do not edit SQLite, remove a barrier or clear a
native context to unblock the Session. Preserve the database and original provider state. An operator
must first establish that the old Runtime and owned provider tree have stopped, and inspect the
original native context through a trusted provider-specific reconciliation mechanism. No such
post-crash reconciliation/termination certificate exists yet for dispatched Claude Turns; those
Sessions remain blocked. A separate new Session is an explicit new conversation, not recovery of
the old one, and must wait until any possibly surviving process affecting the workspace is contained.

## Windows ownership dependency

A real fix needs an atomic native launcher: create an unnamed, non-inherited Job Object with
KILL_ON_JOB_CLOSE and no breakaway; CreateProcessW suspended; assign to the job before resuming;
terminate suspended launch on assignment failure. Retain a query handle until disposal. Cancellation
terminates the entire job and waits for ActiveProcesses=0. Root exit is a separate event. Keep bounded
control messages separate from provider stdout; never treat a helper's ordinary exit as settlement.

The current Runtime has no native launcher/Node-API module or packaging for one. Required next work
includes supported-architecture binaries, build/release provenance, handle/stdio inheritance tests,
job nesting/assignment failure, grandchildren, immediate terminal exit, cancellation and launcher or
Runtime SIGKILL. Assigning a Job after ordinary Node spawn leaves a race and is not an acceptable fix.
See Microsoft's [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
and [assignment API](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject).

## Structure and schema

SQLite retains one connection, owner epoch and transaction coordinator in the Worker. Internal
modules own schema, encoding, content/revisions, command journal, cursors, read queries and provider
facts; none opens a connection or commits independently. HTTP separates authorization, projection
and stream lifetime. Claude separates registry inspection and protocol discovery from driver wiring.
The registry script is multiline and retains both hives/views, no profile, fixed executable,
bounded output/time and strict `absent` evidence.

No schema version change is required: delivery admission uses the existing internal interaction
state column. Before version 2, use a single fenced BEGIN IMMEDIATE forward migration: verify the
previous owner is stopped, apply ordered DDL/data transforms, preserve IDs, request hashes/results,
content offsets/revisions and outbox sequences, check constraints, update user_version, then commit.
Any failure rolls back schema, data and version together. Tests must open a real v1 fixture with
active/settled conversation and failed migration injection; unknown future versions still fail closed.
No general migration framework or unreleased legacy compatibility is required now.

## Verification ledger

Focused Windows tests cover real process exit, SIGKILL/store ownership, 32-socket idle load,
authentication revocation/replay, delivery failure, grouped delivery, restart barriers and UI
StrictMode/content/create retention. Broader final-commit verification is recorded in the PR/report;
older green runs are not evidence for the final HEAD. Skipped Windows/Linux-specific tests and
unexecuted live-provider/matrix acceptance must be listed separately.

Recommendation remains **NOT READY** while R01 lacks positive process ownership/settlement and
successful live Claude model/semantic-resume acceptance is pending. Signed catalogue distribution
is deliberately staged, as described in the compatibility design, rather than shipped unverified.

The first full matrix found a macOS controlled-fixture mismatch: the test provided an aliased
temporary workspace while the child reported its canonical cwd. A POSIX symlink probe reproduced
`lexicalMatches:false, canonicalMatches:true`. The fixture now canonicalizes its owned temporary
root before supplying the verified workspace. Production workspace verification remains strict.
The local broad Windows run also observed taskkill settlement uncertainty under concurrent load;
its failed live-root cancellation and controlled Claude completion remain recorded failures, even
though the corresponding first remote Windows matrix passed. An isolated pass does not resolve R01.
