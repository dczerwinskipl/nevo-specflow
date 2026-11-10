---
id: reference.providers.claude
type: reference
title: Claude Session provider
status: current
scope: specflow
areas: [ai, runtime, security, configuration]
tags: [claude, providers, sessions]
read_when:
  - enabling or reviewing the Claude Session adapter
  - checking why a Claude installation, login or mode is unavailable
  - changing Claude tools, permissions, questions or settlement
summary: >
  Claude adapter enablement, supported installation and login, native modes and tools,
  prelaunch policy checks, native context and dispatch, questions and permissions,
  settlement and durable limits.
related:
  - reference.providers.compatibility
  - reference.protocols.session-provider-driver
  - reference.api.sessions
  - architecture.ai.provider-boundary
  - architecture.ai.provider-process-ownership
---

# Claude Session provider

Code: `features/sessions/providers/claude/`. Claude runs through the shared Session coordinator,
SQLite Worker, authorization and HTTP/SSE/history APIs. There is no provider transcript endpoint,
legacy-history import or resume-to-new fallback.

## Enablement

```yaml
# .nevo/config.yaml (committed; no local override)
sessions:
  enabled: true
  providers:
    claude:
      enabled: true
      # optional absolute native executable; default ~/.local/bin/claude.exe
      executable: C:/Users/example/.local/bin/claude.exe
```

Disabled Claude inspects no login and launches no process. An unsupported installation leaves the
provider unavailable; Runtime and other providers stay usable. Startup warms discovery; ordinary
snapshots launch no subprocess. Discovery and caching follow
[provider compatibility](compatibility.md).

## Supported installation and login

- Windows x64 native Claude CLI with the default first-party personal Pro/Max OAuth file login.
- The credential must be an unexpired (one-minute margin) inference-scoped Pro/Max OAuth credential
  with a stable opaque account binding.
- Refused, distinguishing missing from access denied or malformed: the native Windows
  managed-settings file, fragments and MCP file, a symlinked policy root, registry policy roots in
  both hives and views, the remote-policy cache, legacy `.claude/.config.json`, an Anthropic profile
  directory, FD fallback credential files, a stored `primaryApiKey` and the cached Windows Credential
  Manager feature.
- Registry inspection uses fixed .NET read operations in an absolute, hidden, profile-free
  PowerShell process (2 s, 4 KiB output); it never executes policy values.
- Linux/macOS, Team/Enterprise, API keys, profiles/gateways and alternate auth directories are not
  supported.
- Credential contents and native account identity never appear in descriptors or public diagnostics.

Expired or rejected login is `authenticationRequired`: the operator signs in through the CLI and
explicitly rechecks availability. Recheck never sends or replays a Turn. A rejection fences only the
credential fingerprint used by that operation; up to 64 rejected logins are remembered while the
currently verified login is protected.

## Modes, models and effort

| Mode ID       | Native mode   | Effect authority  | Tools                                                |
| ------------- | ------------- | ----------------- | ---------------------------------------------------- |
| `acceptEdits` | `acceptEdits` | `workspace-write` | Read, Glob, Grep, AskUserQuestion, Edit, Write, Bash |
| `auto`        | `auto`        | `workspace-write` | as above                                             |
| `manual`      | `default`     | `workspace-write` | as above                                             |
| `dontAsk`     | `dontAsk`     | `workspace-write` | as above (Bash is refused rather than asked)         |
| `plan`        | `plan`        | `read-only`       | Read, Glob, Grep, AskUserQuestion                    |

`acceptEdits` is the default writable mode when managed execution is available; each mode is probed
and can be unavailable independently. `bypassPermissions` is not admitted. Model IDs, titles and
per-model effort lists come from native initialization, never a static list; an effort outside the
model's list is rejected before dispatch.

## Launch profile

- Safe/restricted mode, the selected permission mode, the explicit tool inventory above, strict
  empty MCP, no setting sources, disabled hooks and slash commands, permission prompts over stdio.
- Fixed settings: `permissions.ask: [Bash]` (every Bash call requires a host request in
  `acceptEdits`, `auto` and `manual`) and `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1`.
- User frames are `client_composed: true`, suppressing path-mention and slash-command
  interpretation.
- Native `system/init` must report the expected version, cwd, mode, tool inventory and no MCP.
  Only the builtin `agents-md`, `telemetry` and `plugin-authoring` plugins with exact builtin
  source are accepted; any other plugin is refused. The telemetry plugin can perform auxiliary
  network activity; the guarantee concerns restricted workspace effects, and native private
  transcript/cache writes needed for continuation are allowed.

## Native context and dispatch

Before launch one store transaction reserves an independent native UUID, workspace and account scope
with the Turn. A fenced dispatch-intent transaction precedes the first user frame. Correlation must
match the reserved ID. Confirmed contexts resume only in the same workspace and account; an
unconfirmed possible dispatch is never replayed as a new conversation. Native IDs and account
binding are not exposed.

## Questions and permissions

- The reader continues while questions wait. One native AskUserQuestion maps to 1–4 canonical
  questions (request ≤24 KiB); the whole group is acknowledged after its single native write, and
  partial answers stay admitted. `maxSelections` is checked before durable response admission.
- Native cancellation expires the interaction without sending a stale answer.
- Read-only rejects writable permissions. Writer modes support bounded one-operation Edit/Write/Bash
  decisions; Bash approvals are [approved host execution](../../architecture/ai/provider-boundary.md#execution-authorities).
  Permission suggestions and persistent updates are never forwarded. Unknown control requests fail
  closed.
- No silence timeout applies while waiting for user input or a model/tool response.

## Settlement and errors

Terminal facts are held until the process owner has stopped the tree; a protocol outcome with
unverified settlement stays unknown. Abort with positive settlement becomes cancelled or
interrupted. Cancellation attempts native interrupt first, with a bounded forced-stop fallback; a
forced stop without a native result keeps the Engine claim unknown. A writer outcome is published
only after Engine settles the receipt.

Native `api_error` results (including HTTP 429) become safe structured failures; native error prose
is excluded. Loss without an authoritative outcome stays unknown. Provider-supplied thinking text is
reasoning content; numeric `system/thinking_tokens` frames and foreground `tool_progress` metadata
are validated and ignored, and final native usage remains authoritative.

## Limits

- Restricted adapter profile, not an OS sandbox or every Claude CLI feature: detached/background
  execution, external customizations, hooks and MCP stay outside it.
- Login and settings are owned by the external CLI and must stay consistent while an invocation
  runs.
- Automated tests use controlled processes and synthetic credentials only
  ([testing policy](../../engineering/shared/testing.md)).
