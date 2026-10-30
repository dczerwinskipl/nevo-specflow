---
id: ideas.specflow-runtime.antigravity-provider
type: engineering
title: Antigravity managed Session provider
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [antigravity, providers, sessions, migration]
read_when:
  - implementing or reviewing the Antigravity Session adapter
  - checking account binding, interactive tools and process settlement
summary: >
  Native Antigravity protocol, private configuration, account affinity and
  interactive bridge implementation, with separate controlled and native evidence.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.provider-process-boundary
  - ideas.specflow-runtime.managed-agent-execution
  - reference.protocols.session-provider-driver
---

# Antigravity managed Session provider

Continue in PR #107, branch `feature/antigravity-provider`. PR #98 is merged.
The adapter uses the existing Session driver, Engine execution admission and
settlement, SQLite lifecycle and HTTP/SSE/history contracts. It introduces no
second lifecycle authority, credential broker or global MCP installation.

## Native context and transcript

The installed CLI emits `init` before a user frame. Runtime validates the account,
workspace and permission profile, persists the assigned native conversation ID,
and crosses durable dispatch admission before writing literal user input.
Continuation selects only the exact persisted `--conversation`; there is no
most-recent fallback, automatic replay or replacement of an uncertain context.

The bounded stream adapter handles native `step_update` and `result` frames,
message text, commentary, actual supplied reasoning text, tool Work/Actions and
session-cumulative usage. Numeric thinking-token usage is not reasoning text.
Conflicting tool identities/arguments and unsupported frames fail closed. A
failed tool remains failed even if the overall native Turn reports success.

Native Agent (`accept-edits`) is the default; native Plan is also exposed. Both
require canonical `workspace-write` authority: Plan is an instruction, not a
filesystem read-only boundary. Models come from bounded no-input CLI discovery;
effort overrides remain unavailable until a native catalogue contract establishes
supported values. No model-name heuristics invent effort support.

## Authentication and private configuration

The Windows x64 consumer CLI source is the exact generic Credential Manager
entry `gemini:antigravity`. Enumeration returning no entries did not establish
absence: exact `CredReadW` succeeds. The previous generic account-source blocker
is resolved; the owner's existing terminal login needs no replacement.

The inspector reads an owned bounded credential copy and clears it. Stable
account scope derives from native OAuth identity metadata; rotating access-token
fingerprints are separate. Local identity parsing is affinity evidence, not JWT
signature validation or proof of remote authentication. The CLI remains solely
responsible for actual login and token refresh. No credential is copied into the
workspace or private profile, exported, logged or returned through descriptors.

The first supported authentication profile is the native consumer keyring source.
Alternate gateway, ADC/WIF, API-key and file-fallback sources are not silently
selected. Environment projection excludes ambient authentication overrides.
Known fallback files and cached keyring-failure markers in the private profile
are rejected. Installation/account identity is checked at discovery, launch,
before native correlation and immediately before input. Account switches cannot
resume the old account's native context. The read-to-launch window is not atomic.

Private native history lives outside the project, under a project/account/Session
binding. Each Session has independent hook/MCP configuration, preventing concurrent
Sessions from overwriting each other's invocation transport. Discovery uses a
separate disposable profile and sends no user event. Private directories and
configuration targets reject symlink redirection before child writes. Profile
markers bind account and physical workspace; token rotation preserves history.
The CLI-created `default-cli-project.json` is accepted only with closed metadata
keys, the exact default ID and empty project resources. Additional projects,
resources, malformed files and symlinks remain unavailable; legitimate native
bookkeeping must not prevent the next Turn.
Directory identities use full SHA-256 encoded as base64url to keep native Windows
HOME below 260 UTF-16 code units. Longer homes are rejected before directory
creation. A 261-character profile reproduced initialization timeout before any
user input; the shorter representation passed the full Runtime correlation and
dispatch barriers in a manually instrumented check that prevented model input.

Workspace `.agents` hooks, MCP configuration, plugins, sidecars and project
customizations are rejected rather than deleted. Native global user configuration
is untouched. The updater is disabled. Only the invocation-private MCP server is
registered, with the exact `mcp(specflow-interactions/ask_user)` permission.

## Interactive questions and permissions

The invocation-private Streamable HTTP MCP server uses a random bearer credential,
bounded requests and waiters, canonical interaction facts and existing response
idempotency. Setup may precede dispatch; question admission requires activation
after durable native correlation and dispatch. Human response lifetime is bounded
separately from initialization; no protocol-silence timer interrupts a pending
human answer. Disconnect, cancellation and restart expire live interactions.
Lost delivery acknowledgement never causes automatic retransmission. Transport
flush is delivery evidence, not evidence the model consumed the answer.

Native MCP calls pass through `PreToolUse` as `call_mcp_tool`. The adapter admits
only the exact server/tool pair and validated question arguments. It does not
allow arbitrary MCP, resource, browser, scheduling, messaging or other unknown
native tools. Hook metadata must identify the admitted native conversation and
exactly one normalized workspace. Immutable native step and argument identity
prevent replay or changed-operation grants.

The native permission profile is `proceed-in-sandbox`, including for Agent and
Plan. In-workspace native file operations retain Agent auto-edit behavior. Physical
paths are checked before admission and immediately before grant; outside-root
and customization-control-path writes are denied. Command execution requires
an exact canonical once-only permission, physical CWD validation and a verified
native policy that cannot authorize unsandboxed fallback. Bypass, daemon,
background/reused-terminal and unknown argument variants are rejected.

The fixed Windows hook launcher encodes only trusted executable paths and hook
role. Native tool input travels through bounded UTF-8 stdin, never shell-code
interpolation. Its invocation credential stays in private configuration; command
lines and public readiness contain no credential. Helper errors produce denial.

## Lifetime and recovery

Windows Job Objects retain ownership independently of root PID lifetime. A
terminal protocol result alone is insufficient for settlement. Normal completion
requires graceful stdin EOF, authenticated positive `Stop`/`fullyIdle` evidence,
natural process exit and positive stopped-tree evidence. Missing idle, nonzero
success exit, timeout, failed helper or forced descendant cleanup cannot fabricate
success. Stop metadata is bound to the native conversation/workspace and cannot
settle a newer tool generation or an unresolved interaction.

EOF is graceful draining, not cancellation. Forced process termination after
possible dispatch, without a correlated authoritative outcome, remains uncertain
under existing recovery/Engine claim rules. No Claude control-frame emulation,
force-success endpoint or automatic replay is introduced.

## Evidence as of 2026-10-30

Evidence types remain separate:

- Automated tests use controlled process owners, synthetic credentials, native
  protocol fixtures and authenticated loopback MCP/hooks only. No real CLI login,
  paid endpoint, model or subscription is used by any test runner or CI.
- Manual exact-source credential inspection succeeded without exporting tokens.
- Manual production-driver no-input discovery succeeded with the existing native
  keyring login: 13 models, native Agent/Plan and account affinity. No user frame
  or inference prompt was sent. This does not prove semantic continuation.
- Manual Runtime HTTP acceptance with the existing native consumer login passed:
  a minimal explicit integration-test prompt produced the requested marker and
  completed; after closing/reopening Runtime, a second minimal prompt recovered
  that marker from native conversation context and completed. Earlier attempts
  exposed the Windows HOME limit, inert default project metadata and a native
  resume `system_message` step; each now has controlled regression coverage.
  The earlier uncertain invocation was not automatically replayed or released.
- Manual native CLI tests used a synthetic loopback model backend, synthetic key
  and disposable private configuration, outside all test runners and CI. They
  verified actual hook allow/deny, malformed/error/timeout denial, exact native MCP
  question invocation, positive `fullyIdle` Stop before result, and retained Job
  cleanup. These are native protocol/policy observations, not OAuth model success.
- Native terminal positive control wrote inside the disposable workspace; the
  same PowerShell command targeting an owned sibling was denied by Windows and
  produced no file. A command may exit zero despite a nonterminating write error;
  this is not proof that its requested effects succeeded.
- A controlled native command created a workspace hook configuration, followed
  by a native file write in the same Turn. The new workspace hook did not run;
  the original private hook remained active. The next invocation rejects that
  workspace configuration. This is observed behavior of the recorded build,
  not a guarantee that arbitrary future native plugins cannot reload dynamically.

Observed Windows x64 CLI SHA-256:
`fbbfb3f15c7628252c5e12765683c688ba05ee122b853cadeb0bbfd4e13ca25b`.
The PE has no file/product version. This is diagnostic evidence, not a version pin
or permission for arbitrary future binaries. Compatibility classification remains
provisional unless trusted tested-build evidence exists; actual policy and
protocol checks are separate admission prerequisites.

The CLI does not expose its internal `SandboxStatus` in stream initialization.
Primary documentation says `--sandbox` can have no effect on an unsupported host.
Flags and OS version alone therefore cannot establish command containment. After
canonical human approval, the hook returns `allow`, delegating to native
`proceed-in-sandbox`, never `auto_approve`. Manual controls confirmed the same
approved command executes with the sandbox enabled and is soft-denied with it
disabled, both inside and outside the workspace. Native file auto-edits still
work under this profile. Thus the native policy retains its fail-closed fallback;
Runtime does not replace it with a configuration boolean or guessed version.
Some soft-denied executions emit a result without positive Stop/idle evidence;
these remain uncertain rather than being promoted to success.

Remaining acceptance is reported on the final implementation commit: full Runtime
and process verification, installed helper packaging, independent review, and a
separately recorded native evidence above. No automated paid acceptance or retry
is permitted. No UI redesign,
historical import or backward compatibility belongs to this feature.

Primary sources: [headless protocol](https://antigravity.google/docs/cli/headless/),
[hooks](https://antigravity.google/docs/hooks/),
[MCP](https://antigravity.google/docs/mcp/),
[authentication](https://antigravity.google/docs/install/),
[sandbox](https://antigravity.google/docs/sandbox/), and
[settings schema](https://antigravity.google/schemas/v1/settings.json).
