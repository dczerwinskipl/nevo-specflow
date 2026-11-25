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
# .nevo/config.yaml (committed): the project allows Claude
sessions:
  enabled: true
  providers:
    claude:
      allowed: true
```

```yaml
# .nevo/local/config.yaml (this workstation; optional)
sessions:
  providers:
    claude:
      # enabled by default once allowed; `enabled: false` turns it off on this machine
      # optional absolute native executable; default: discovered on PATH, then the native
      # installer's ~/.local/bin/claude.exe and the npm global package
      executable: C:/Users/example/.local/bin/claude.exe
```

Disabled Claude (not allowed by the project, or turned off on this machine) inspects no login and
launches no process. An unsupported installation leaves the
provider unavailable; Runtime and other providers stay usable. Ordinary snapshots launch no
subprocess. Discovery and caching follow [provider compatibility](compatibility.md), with this probe
policy:

- **Once at start.** The Runtime starts the first discovery when it starts, in the background; it
  does not wait for it. Only a catalogue read (`GET /api/session-providers`) that comes before that
  discovery ended waits for it.
- **Every later read answers at once** with the last known descriptor, never waiting for a probe.
  At most every 30 s a read starts a background check of the installation (the executable's hash is
  cached by its real path, size and modification time, so an unchanged ~300 MB binary is hashed
  once; the login fingerprint is derived off the event loop). The CLI probes run again, in the
  background, only when that identity changed (a new or updated binary, another login or policy),
  when the last probe is older than 15 minutes, or when the descriptor was invalidated (a Turn's
  launch found the login rejected, the installation changed or the protocol unsupported).
- **Check again** (`?recheck=true`, the owner's explicit recheck) probes now and is awaited.
- **A Turn never runs on a stale answer**: validation and launch read the installation again and
  probe again first when its identity differs from the one probed.

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

`acceptEdits` is the default writable mode when managed execution is available: a writable Turn
without a native mode runs in it. Agent step execution creates its fresh Session in `auto` when the
catalogue lists `auto` ready and authorized for the chosen model (`providerModes[].modelIds`), and
in `acceptEdits` otherwise; the agent option names it as `workMode`. Claude is launched with a PATH
from which the Runtime drops empty and relative entries (the user's PATH is not changed), so the
host-side approval of allowlisted product CLI calls is judged on that PATH. That approval fails
closed (ADR 0026, D20): it is bound to the identity of the file a bare `nevo-specflow` resolves to
at Turn start (canonical real path, size, modification time, sha256), re-verified at each decision,
and withheld when the executable is missing, unreadable or inside the workspace, or when trust
information is missing. Claude's `auto` mode never approves a Bash call itself: Bash always asks the
host, which alone applies the allowlist. A Bash command above
7000 bytes is denied with its size, the limit and `--content-file` as the remedy. Each mode is probed and can be unavailable
independently. When native initialization reports `supportsAutoMode` (Claude 2.1.312 and later),
`auto` offers only the models it marks; Claude would run any other model in `default`, so such a
choice is refused before launch (`MODEL_UNSUPPORTED` with `details.reason: mode-model-unsupported`),
and the catalogue lists the models `auto` runs as its `providerModes[].modelIds` so a client offers
no such pair. An older CLI that reports the field for no model keeps every model in `auto`; a silent
fallback to `default` is still refused by the `system/status` frame check. `bypassPermissions` is not admitted. Model IDs, titles and
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
  A `system/status` frame (also before init) must report the selected mode when it reports one;
  a silent fallback to another mode is refused. A refusal names the failing field and Claude
  version; it becomes the provider's unavailable reason and is appended to the Turn's loss message.
  Only the builtin `agents-md`, `telemetry` and `plugin-authoring` plugins with exact builtin
  source are accepted; any other plugin is refused. The telemetry plugin can perform auxiliary
  network activity; the guarantee concerns restricted workspace effects, and native private
  transcript/cache writes needed for continuation are allowed.

## Native context and dispatch

Before launch one store transaction reserves an independent native UUID, workspace and account scope
with the Turn. A fenced dispatch-intent transaction precedes the first user frame. Correlation must
match the reserved ID. Confirmed contexts resume only in the same workspace and account; an
unconfirmed possible dispatch is never resumed or rebound. Once its Turn has settled (no process of
it runs on), the next Turn starts a new native context under a new reservation instead of refusing
the Session for good. Native IDs and account
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
reasoning content; numeric `system/thinking_tokens` frames, foreground `tool_progress` metadata
(including the 30-second heartbeat whose parent is the open tool call itself) and
`system/permission_denied` for an open tool call (its error tool result follows) and the
`system/post_turn_summary` Claude sends before its result (2.1.312) are validated and ignored, and final native usage remains authoritative.

## Limits

- Restricted adapter profile, not an OS sandbox or every Claude CLI feature: detached/background
  execution, external customizations, hooks and MCP stay outside it.
- Login and settings are owned by the external CLI and must stay consistent while an invocation
  runs.
- Automated tests use controlled processes and synthetic credentials only
  ([testing policy](../../engineering/shared/testing.md)).
