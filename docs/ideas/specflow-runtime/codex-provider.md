---
id: ideas.specflow-runtime.codex-provider
type: engineering
title: Codex Session provider implementation and acceptance
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [codex, providers, sessions, migration]
read_when:
  - enabling or reviewing the Codex Session adapter
  - checking native Codex execution and authentication boundaries
summary: >
  Native Codex mode discovery, managed execution, provider-assigned context,
  access-only credentials and explicit live acceptance limitations.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.provider-process-boundary
  - reference.protocols.session-provider-driver
  - reference.api.sessions
---

# Managed Codex provider

Status: implementation and independent review in PR #98. Native Windows x64
discovery and execution-boundary probes pass. A real model patch and completed
first Turn passed; full write/resume acceptance remains blocked by account quota
after fixes to native resume metadata. Final-HEAD CI remains required; a completed
text-only answer does not prove writable agent behavior.

## Native contract

The adapter uses the installed `codex.exe app-server` JSON-RPC protocol. Unknown
versions/hashes are Provisional after local protocol and execution checks; no
version allowlist or downloaded adapter code is introduced. Other platforms are
currently unavailable through this adapter.

`default` is the native Agent mode, with managed workspace-write authority.
`plan` is native Plan with read-only effects. Mode, model and effort must come
from current native discovery. Unavailable Agent never silently becomes Plan.
The existing API exposes these modes; additional provider/model UX is deferred.

Opt-in project configuration:

```yaml
sessions:
  enabled: true
  providers:
    codex:
      enabled: true
```

The native process gets a private home, a projected environment, strict config,
disabled hooks/plugins/MCP/network/extensions and the unelevated Windows sandbox.
The native tool-host backend remains enabled because built-in patch tools require
it. JavaScript code-mode flags are separately disabled. Native model metadata can
override those flags in future builds; their values alone are not proof that no
model-visible JavaScript entrypoint exists. Unknown lifecycle/tool protocols are
refused, and Job ownership and native execution policy remain mandatory.
Its initialization must report the expected private home. Effective thread and
Turn settings must preserve the selected workspace, sandbox, approval reviewer,
native mode and model. The native process remains owned by Runtime's retained
Windows Job Object; Job ownership alone is not a filesystem sandbox.

An unpaid fixed-program probe runs in a separate owned scratch workspace outside
the project. Its read-only negative control must execute and fail to write
**inside** that implicit workspace. The writer must positively write there, then
fail to write to an owned sibling outside both implicit and explicit write roots.
A setup failure, missing program execution or successful forbidden write refuses
the corresponding mode. Discovery never submits inference or edits user files.

Shell escalation approvals remain denied: the native approval contract can lift
the sandbox and does not prove the requested effect remains workspace-bound.
Patch permission can approve one fully observed bounded patch within the project;
session grants and persistent policy amendments are never forwarded. Unsupported
requests are refused rather than represented as a successful partial answer.

## Authentication and identity

The initial supported login is the installed CLI's ChatGPT file login. API-key
and machine-managed authentication are unavailable. Context scope binds both
selected account/workspace and stable ChatGPT user identity; token rotation does
not create a new scope. A user switch within one organization does.

Native history and access credentials live in OS user state outside the project,
including physical path/Windows short-name containment checks. User config,
hooks and installed skills are not copied. Native materialized `.system` skill
cache is permitted only as a physical cache; bundled skills are disabled by
launch policy.

**Only the original CLI owns refresh authority.** Private homes receive current
access/ID tokens and an empty refresh token. Every inspection replaces an older
private credential snapshot; an earlier experimental full-refresh copy cannot
survive. The adapter never rotates or writes back the source login. This avoids
competing single-use refresh tokens across projects and the original CLI.

This is bounded external-login readiness, not continuous authentication renewal.
Native Codex may require refresh before access-token expiry. If the external CLI
has not renewed login, availability or the native Turn fails honestly. A supported
coordinated authentication broker is a remaining dependency for continuous long
operations. Internal-only external-auth RPC is deliberately not used.

## Lifecycle and transcript

Codex assigns the persistent thread ID. Runtime stores that exact correlation
before the durable dispatch barrier and the first user input; continuation uses
that ID without fallback to a new thread. Account/workspace affinity and Engine
effect claims remain outside the provider adapter.

Completed native items supply authoritative text, patches and command results.
Deltas are not appended again to completed content. Provider-exposed reasoning
summary/content is retained as reasoning in the transcript. Numeric reasoning
usage remains a separate cumulative metric.

Interaction admission and actual RPC response delivery are separate. Grouped
answers cross the transport once all answers are available. Withdrawal expires
every question, including locally admitted answers not yet delivered.

Cancellation first requests native interruption with a bounded forced-stop
fallback. Only a native terminal result and independently stopped process tree
produce a native-result settlement receipt. A forced stop or ambiguous native
dispatch remains unknown for a managed writer; requests are never silently replayed.

## Verification

Controlled tests cover authoritative transcript normalization, reasoning/usage,
patch boundaries, request capacity/idempotency, failed native writes, group
withdrawal, effective policy escalation, native home mismatch, independent
settlement receipts, account isolation and access-only credential snapshots.

Automated tests use controlled processes, synthetic credentials and fixture
installations only. No personal login, installed provider or subscription is
required, including through an opt-in flag. The earlier live-account test-runner
cases have been removed.

Native verification is a separate, short manual activity described in
[manual provider checks](provider-manual-checks.md). It never runs in CI and never
contains embedded credentials. Native results are recorded separately from the
controlled Engine/SQLite/HTTP restart test.
