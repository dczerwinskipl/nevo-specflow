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

The owner explicitly requires an agent capable of edits/tools as the normal task default.
Read-only remains useful for tests and optional discussion/planning, not the final product default.
This supersedes the earlier restriction of W1/W2 to a future PR. Everything remains in PR #98;
broader UX stays with the owner, except for the requested mode selection.

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

The current W1 slice adds the Engine journal and shared admission contract. Writable Runtime dispatch,
native profile selection and the small UI selector are subsequent parts of this same feature; W1 alone
must not advertise a writable provider. Required integration proof includes two competing writers,
both directions of Create/Close exclusion, exact identity/replay, corrupt journals, each publication
cut point, lost admission/settlement acknowledgements and unknown after restart. Installed-provider
answers, tool round trips and semantic resume remain separate acceptance from controlled processes.
