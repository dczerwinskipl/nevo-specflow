---
id: engineering.shared.session-recovery
type: engineering
title: Managed Session operator recovery
status: current
scope: specflow
areas: [ai, runtime, testing]
read_when:
  - containing an unknown Session Turn whose native process cannot be proven stopped
  - recovering an old Session record without native process identity
summary: >-
  Read-only evidence collection, provider-process containment and offline backup for unknown
  managed Session Turns; no forced settlement, dispatch replay or database-row edits.
related:
  - architecture.ai.session-storage-and-lifecycle
  - architecture.ai.provider-process-ownership
  - architecture.runtime.workspace-execution-claims
---

# Managed Session operator recovery

Automatic settlement and its refusal boundaries are owned by
[Session lifecycle](../../architecture/ai/session-storage-and-lifecycle.md#positive-evidence-and-operator-recovery).
This procedure applies only when that evidence cannot settle the Turn. A new Session does not
recover or prove the old provider process stopped.

## Administrative recovery

For a Turn the evidence cannot settle: no recorded identity (an old record), an identity the OS
cannot answer for (a live POSIX group without a start time on macOS, a query refused), or a process
that keeps running. There is deliberately no product action ("Mark as stopped") for it: an operator
with access to the machine establishes the facts first.

1. **Find the Turn and its evidence.** The UI's unknown-Turn alert names the Session; with the
   Runtime running, Check outcome states whether the process still runs or cannot be established.
   The recorded identity can be read without changing anything:
   `sqlite3 -readonly .nevo/local/state/sessions/sessions.sqlite "SELECT id, json_extract(data,'$.invocationId'), json_extract(data,'$.nativeProcess') FROM turns WHERE state!='terminal'"`.
   The invocation id is also the Engine claim's file name in
   `.nevo/local/state/engine/operations/external-execution/`.
2. **Establish whether an agent still runs in the project.** POSIX: `ps -eo pid,pgid,lstart,args`
   for the recorded group id (and any provider CLI whose working directory is the project or its
   worktrees, since a descendant may have left the group). Windows: `Get-CimInstance Win32_Process`
   filtered by the provider executable, with `CreationDate` and `CommandLine`.
3. **Contain it.** Stop a surviving provider process tree (POSIX: signal the group; Windows: end the
   process tree). Then run Check outcome, or restart the Runtime: with a recorded identity the
   evidence now settles the Turn and the claim, macOS included (an empty group is evidence).
4. **No identity at all (old records).** Nothing in the product can settle it. Only once step 2 shows
   no agent process remains: stop the Runtime, copy `.nevo/local/state/` aside as a dated backup,
   then move the Turn's claim record out of `external-execution/` into the backup (this releases
   the project writer lock; the Turn stays unknown). If the Session itself must go, move the whole
   `sessions/` directory aside the same way, which retires every Session of the project. Never edit
   rows, the dispatch barrier or a native context, and review the workspace with Git for the
   agent's uncommitted changes before writing again.
