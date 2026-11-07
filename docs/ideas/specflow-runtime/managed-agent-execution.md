---
id: ideas.specflow-runtime.managed-agent-execution
type: engineering
title: Native provider modes and managed agent execution
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [sessions, providers, execution, recovery]
read_when:
  - enabling writable native provider modes
  - changing external execution claims or recovery
summary: >
  Owner-directed agent default, native provider mode selection, Engine-owned durable
  project write admission and evidence requirements across Runtime/Engine crash windows.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.session-review-follow-up
  - engineering.shared.specflow-git-recovery
---

# Native modes and managed agent execution

## Common execution-boundary acceptance

The owner's 2026-11-07 decision separates two execution authorities:

- **Workspace execution:** automatic tools must remain within the workspace,
  including when a path is replaced. Native mode names do not imply this guarantee.
- **Approved host execution:** the user approves the exact command, its starting
  directory and an explicit warning that it can affect files outside the workspace.
  The command runs with the user's account permissions. Every unconfined command
  requires a separate once-only approval, even a seemingly harmless command.

Approved host execution does not require an OS workspace sandbox. AppContainer
is deferred, rather than a prerequisite for this delegation. Engine admission,
process ownership and filesystem containment remain separate responsibilities.
No mode, resumed context or hook replay may turn a one-operation grant into a
persistent permission. Codex retains its current sandbox and denial of escalation;
adding approved Codex host escalation requires a separate protocol contract.

The complete migration requires usable native Agent modes for Claude, Codex and
Antigravity. Discovery-only Antigravity is an interim containment measure.
Engine admission coordinates effects and recovery. Filesystem isolation is a
separate execution prerequisite when a mode promises workspace-scoped writes.

Apply the same acceptance cases to each adapter while preserving native mode
semantics. In particular, Antigravity Plan currently requests write authority;
it cannot inherit another provider's read-only Plan guarantee.

For automatic workspace tools, require positive in-workspace controls and negative
outside-workspace and path-replacement controls. For unconfined commands, verify
exact one-shot approval, denial, loss of delivery and no reuse. Use synthetic
credentials and a local deterministic model backend for
manual native protocol checks. Automated tests use controlled programs and never
depend on installed providers or a subscription.

Manual observations on Windows x64 on 2026-11-07 are bounded to the exercised
installations and profiles. Claude reported 2.1.312, Codex reported
0.166.0-alpha.6 and Antigravity reported 1.3.3. Versions identify observations
and are not admission pins.

| Surface                                                                            | Observation                                                                                                                                                                                     | Remaining evidence                                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Claude native Write/Edit with the adapter's restricted profile and manual approval | In-workspace controls succeeded. Direct outside writes/edits and writes/edits after junction replacement were refused.                                                                          | Repeat across the other admitted native permission modes.                                                 |
| Claude native Bash after approval                                                  | `permissions.ask: [Bash]` forces a host request in acceptEdits, auto and manual. dontAsk refuses it. Native commands may affect outside files after explicit approval.                          | Full semantic model acceptance remains separate from local protocol controls.                             |
| Codex app-server command execution with workspaceWrite sandbox policy              | In-workspace write succeeded. Read-only, outside-workspace, pre-existing junction and post-start junction replacement writes were refused.                                                      | Full normal Turn composition and retained authentication under the final boundary.                        |
| Codex native apply-patch helper through sandboxed command execution                | An in-workspace patch succeeded and a direct outside patch was refused.                                                                                                                         | The helper's directory replacement race remains unverified.                                               |
| Antigravity file hooks with Runtime-held native handles                            | Real CLI view/write and PostToolUse succeeded. Directory replacement after pre-tool grant failed with EBUSY; no outside marker was written. New-file reservation and argument overwrite worked. | This is a supported direct-file tool profile, not arbitrary recursive traversal or an OS process sandbox. |
| Antigravity commands                                                               | Canonical once-only host approval produced exactly one native auto_approve receipt and successful execution.                                                                                    | Host effects are explicitly delegated, not represented as workspace containment.                          |

These manual checks ran outside all automated suites, with owned scratch paths,
synthetic local model replies where required, and no inference subscription.
Standalone helper checks do not certify the complete native Turn path.

Claude uses `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` in its fixed settings so
the displayed starting directory remains the project root. A two-command native
control changed directory in the first command and confirmed that the second
started in the workspace, with two separate permission requests.

### Windows isolation prototype (deferred)

A disposable AppContainer prototype started a real Node process, allowed a file
write in a directory granted to its package SID and refused an outside write with
`EPERM`. The prototype used a private profile and removed that profile afterward.
This establishes a candidate OS mechanism; it does not establish provider readiness.

An additional native Win32 probe created a session-only synthetic Credential
Manager entry on the host. `CredReadW` inside the disposable AppContainer returned
`ERROR_ACCESS_DENIED`. The host then deleted that exact synthetic entry. This
check accessed no personal credential. The existing consumer-keyring authentication
path therefore cannot be assumed to work inside the candidate boundary.

Any future AppContainer integration must settle and implement:

- Provider authentication and refresh under the isolated identity, including
  compatibility with the existing consumer Credential Manager source.
- Invocation-local question and permission transport. AppContainer network
  restrictions affect the existing loopback MCP endpoint.
- Executable/dependency access and normal tool startup. A direct Node file entry
  in the prototype encountered denied ancestor metadata access.
- A process launcher that joins the existing Runtime-owned Job Object before
  dispatch, restricts inherited handles, and preserves protocol streams.
- Owned access grants with crash recovery, revocation and cleanup. Tests must
  prove the boundary persists after path replacement and in descendant processes.

Product setup privileges are an open deployment decision. A local prototype
must not silently grant broad host access to make an existing CLI start.
These prototype requirements do not block explicitly approved host execution.

References are the Windows
[AppContainer execution contract](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)
and
[restricted-token API](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken).

The owner explicitly requires an agent capable of edits/tools as the normal task default.
Read-only remains useful for tests and optional discussion/planning, not the final product default.
This supersedes the earlier restriction of W1/W2 to a future PR. W1/W2 and writable
Claude/Codex are delivered together in PR #98. Antigravity and continuous in-flight
credential renewal are separate follow-ups; broader UX stays with the owner,
except for the requested mode selection.

## Native provider modes

Expose modes supported by the installed adapter/protocol, with native names and semantics. Do not
pretend that every provider has the same ask/agent enum, and do not globally map agent to bypassing
permissions. A native collaboration/permission mode is separate from effect scope and approval policy.
The existing Session read-only/workspace-write field describes effect authority; it is not a native
mode catalogue. Unsupported profiles must explain their unavailability instead of silently degrading
an agent request into read-only. Creation must retain the selected profile in its idempotent command.

Codex app-server documents collaboration, sandbox and approval controls separately; see
[the official protocol](https://learn.chatgpt.com/docs/app-server). Claude permission modes similarly
have distinct behaviors; see [its permission contract](https://code.claude.com/docs/en/permissions).
An implemented adapter must validate its actual version/profile, not assume every documented future
mode works on the installed CLI. The compatibility policy remains optimistic about unknown builds,
while enforcing the chosen profile's actual requirements.

## Engine ownership, not a Runtime lock

External execution admission is an Engine capability, independent of Session, Specification, Task
and Workflow models. An intent has an operation/invocation UUID, opaque owner ID and immutable caller
binding digest. Runtime binds provider/account/Session/Turn identity into that digest. Engine pins
Project Home/Git instance and workspace/incarnation, deriving resources itself under the existing
short Project Home control lock. The durable execution journal is the claim; no secondary lease,
reservation registry or SQLite connection is introduced.

Initial full CLI execution reserves the entire project, including its ref/worktree administration
namespace. Restricting a cwd does not prove the CLI cannot mutate other refs or worktrees. Therefore
one native writer excludes other external writers and unfinished Create/Close reservations across
the project. The shared scanner checks all journal kinds symmetrically. More concurrent workspace
claims require an independently enforced narrower tool/effect boundary first.

Only unsettled records stay in the admission directory. After a durable settled checkpoint, an
atomic move archives its exact receipt; both locations support immutable invocation replay. A
crash before the move leaves a valid settled record, never an active claim that disappears. Admission
streams active records and never loads the lifetime settled archive. Historical lookup reads one
bounded record; normal accumulated history must never be classified as corruption. Public bounded
diagnostics are anchored to Project Home and remain available when old workspace verification fails;
mutations retain the strict workspace/incarnation checks.

This coordination does not isolate arbitrary filesystem/network access or replace native provider
permissions. A Job Object proves process ownership, not sandboxing. It also does not protect Engine
state from arbitrary malicious host code. Adapters must continue enforcing authentication, tool,
permission, hook, MCP and environment policies appropriate to each profile.

## Evidence and publication order

Journal phases are admitted, dispatched, unknown and settled. Only admitted can be abandoned without
a native result, because the Runtime must await the dispatched checkpoint before invoking a driver.
Repeated dispatch admission must refuse a second launch; replay of immutable admission and a matching
settlement receipt is idempotent. Unknown, timeout, PID absence and an ordinary handle resolution
never release a claim. Settlement consumes a matching invocation's authoritative native result plus
positive stopped-process evidence from the trusted process owner. Receipt schema validation itself
is not physical evidence. No raw-receipt or force-result HTTP endpoint may be exposed.

Runtime's SQLite Turn intent and Engine's effect journal have separate responsibilities and cannot
commit atomically. The composition must account for both crash windows:

1. SQLite intent exists, but Engine admission is absent: no native execution may have started.
2. Engine admission exists, but SQLite has not crossed dispatch: retain and inspect exact claim stage;
   an Engine dispatched checkpoint can precede actual launch and remains conservative after a crash.
3. A native process may have started but user input is unconfirmed: never relaunch or replay it.
4. Process/result evidence exists, but canonical terminal persistence fails: retry only the identical
   sequenced fact within the bounded retry policy. Do not redispatch native input.
5. Canonical Turn ended, but Engine settlement acknowledgement was lost: repeat/read the same receipt;
   a Turn outcome alone cannot release an unproven process/effect claim.

Provider/workspace/account changes never rebind an old claim or native context. Startup reconciliation
must preserve dispatched unknown cases until positive evidence exists. New claims cannot use PID/TTL
expiry to make an old writer disappear.

## Implementation and proof

W1 adds the Engine journal and shared admission contract. W2 connects Runtime dispatch to that
contract and exposes a small native mode selector. Claude defaults to `acceptEdits` when managed
execution is configured; `auto`, `manual`, `dontAsk` and `plan` are separately initialized and can
be unavailable independently. The tested baseline has read-only evidence; writable modes remain
provisional until separately accepted. `bypassPermissions` is not an admitted profile.

Runtime requires the separate `session:execute-write` capability for writer creation, starts and
interaction delivery. Developer and admin roles include it. Denial, cancellation and reconciliation
remain available with Session management authority. Native tool approvals are one-operation grants,
never persistent permission suggestions. The initial writer inventory adds Edit, Write and Bash to
Read, Glob, Grep and AskUserQuestion. Unknown tool shapes, detached/background execution options,
external customizations, hooks and MCP remain outside the admitted profile. This is a restricted
adapter subset, not a full host sandbox or every Claude CLI feature.

A writer outcome is buffered until an independent process receipt confirms an authoritative native
result and a stopped tree. Engine settles before SQLite publishes a terminal Turn. If canonical
persistence fails, restart or the authenticated reconcile command may consume that exact Engine
receipt without sending native input. Missing output is explicitly reported, never reconstructed.
Cancellation attempts native interrupt first, with a bounded forced-stop fallback. Forced stop
without a native result retains an unknown claim and does not establish semantic resume safety.

Provider-emitted thinking text is retained as reasoning Work/content. This does not expose or invent
reasoning withheld by the provider. Native `system/thinking_tokens` frames contain approximate numeric
progress rather than text or billed usage. They are validated and ignored before the bounded UUID
ledger; final native usage remains authoritative. Foreground `tool_progress` is similarly metadata:
its optional task-output ID does not itself establish background execution or completion. Unsupported
subagent progress remains refused by the current tool profile.

Discovery/launch has a bounded 30-second budget; native initialization receives its own 10 seconds
after process launch. Cold policy inspection has five seconds and distinguishes an unavailable
inspection from an observed policy. Only a positive absence marker admits the supported profile.

Provider-assigned contexts (needed by Codex) bind their actual identity durably before dispatch.
Restart resumes that exact identity; a reservation placeholder never becomes a replacement thread.

Startup walks bounded candidate pages, advancing even past unknown cases. For the SQLite-only cut,
recovery requires matching current workspace incarnation and undispatched native context, then
durably admits and abandons the same intent through Engine locking. An absent file alone cannot
publish interruption. A dispatched/unknown Engine claim has no automatic expiry or replay; genuinely
unresolved native execution still needs future provider-specific positive reconciliation evidence.

Required integration proof includes two competing writers,
both directions of Create/Close exclusion, exact identity/replay, corrupt journals, each publication
cut point, lost admission/settlement acknowledgements and unknown after restart. Installed-provider
answers, tool round trips and semantic resume remain separate acceptance from controlled processes.
