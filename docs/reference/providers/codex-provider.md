---
id: reference.providers.codex
type: reference
title: Codex Session provider
status: current
scope: specflow
areas: [ai, runtime, security, configuration]
tags: [codex, providers, sessions]
read_when:
  - enabling or reviewing the Codex Session adapter
  - checking why a Codex installation, login or mode is unavailable
  - changing Codex sandbox, approvals, credentials or settlement
summary: >
  Codex app-server adapter enablement, supported login, native modes and sandbox,
  private home and credential snapshots, native thread dispatch, approvals, settlement
  and durable limits.
related:
  - reference.providers.compatibility
  - reference.protocols.session-provider-driver
  - reference.api.sessions
  - architecture.ai.provider-boundary
  - architecture.ai.provider-process-ownership
---

# Codex Session provider

Code: `features/sessions/providers/codex/`. The adapter drives the installed `codex.exe app-server`
JSON-RPC protocol through the shared coordinator and process owner. No version allowlist or
downloaded adapter code is involved; builds are classified by
[provider compatibility](compatibility.md).

## Enablement

```yaml
# .nevo/config.yaml (committed; no local override)
sessions:
  enabled: true
  providers:
    codex:
      enabled: true
      # optional absolute native executable; default: first codex.exe on the projected PATH
      executable: C:/path/to/codex.exe
```

Windows x64 only; other platforms are unavailable through this adapter. Machine-managed
configuration (`%PROGRAMDATA%/OpenAI/Codex/{requirements,config,managed_config}.toml`) must be
absent.

## Modes, models and effort

| Mode ID   | Native mode | Effect authority  | Native sandbox / approval       |
| --------- | ----------- | ----------------- | ------------------------------- |
| `default` | `default`   | `workspace-write` | `workspaceWrite` / `on-request` |
| `plan`    | `plan`      | `read-only`       | `read-only` / `never`           |

`default` (Agent) is the writable default; it never silently becomes Plan when unavailable. Models
and per-model efforts come from current native discovery; an effort outside the model's list is
rejected before dispatch.

Each mode is admitted only after an unpaid fixed-program probe in a separate owned scratch workspace
outside the project: the read-only control must fail to write inside its workspace, and the writer
must write inside it and fail to write to an owned sibling outside both implicit and explicit write
roots. A setup failure, missing program execution or successful forbidden write refuses the mode.
Discovery never submits inference or edits user files.

## Launch profile

- Private native home outside the project (physical-path and Windows short-name containment
  checked), projected environment, strict config, disabled hooks, plugins, MCP, network,
  extensions, bundled skills and JavaScript code mode, and the unelevated Windows sandbox. The
  native tool-host backend stays enabled because built-in patch tools require it.
- User config, hooks and installed skills are not copied; the native materialized `.system` skill
  cache is permitted only as a physical cache.
- Initialization must report the expected private home. Effective thread and Turn settings must
  preserve the selected workspace, sandbox, approval reviewer, native mode and model. Unknown
  lifecycle or tool protocols are refused.

## Authentication

- Supported login: the installed CLI's ChatGPT file login. API-key and machine-managed
  authentication are unavailable.
- **Only the original CLI owns refresh authority.** The private home receives current access/ID
  tokens and an empty refresh token; each inspection replaces the older private snapshot. The
  adapter never rotates or writes back the source login.
- Access-token expiry, when present, is checked before launch with a one-minute margin; this is an
  availability hint, not local JWT authentication.
- Context scope binds the selected account/workspace and the stable ChatGPT user identity; token
  rotation does not create a new scope, a user switch does.
- A native authentication failure rejects only the fingerprint used by that operation (up to 64
  rejected logins remembered); a renewed external credential must pass discovery. Idle Sessions show
  `authenticationRequired`; recheck refreshes discovery only and never replays a message.
- There is no in-flight renewal: if the external CLI has not renewed the login, availability or the
  native Turn fails honestly.

## Native context and dispatch

Codex assigns the persistent thread ID (`nativeContextMode: provider-assigned`). Runtime stores that
exact correlation before the durable dispatch barrier and the first user input; continuation uses
that ID with no fallback to a new thread.

## Transcript

Completed native items supply authoritative text, patches and command results; deltas are not
appended again. Provider-exposed reasoning summary/content is reasoning; numeric reasoning usage is
a separate cumulative metric.

## Approvals and questions

- Shell escalation approvals are always denied: the native approval can lift the sandbox and does
  not prove the effect stays workspace-bound. Approved host execution for Codex would need a
  separate protocol contract.
- Patch permission can approve one fully observed bounded patch within the project. Session grants
  and persistent policy amendments are never forwarded; unsupported requests are refused.
- Grouped answers cross the transport once all are available. Withdrawal expires every question in
  the group, including admitted answers not yet delivered.

## Settlement

Cancellation first requests native interruption with a bounded forced-stop fallback. Only a native
terminal result plus an independently stopped process tree produce a native-result settlement
receipt. A forced stop or ambiguous dispatch stays unknown for a managed writer; requests are never
silently replayed. The Job Object owns processes; it is not a filesystem sandbox.

## Telemetry

Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh
(no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).
