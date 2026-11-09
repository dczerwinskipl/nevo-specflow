---
id: reference.providers.antigravity
type: reference
title: Antigravity Session provider
status: current
scope: specflow
areas: [ai, runtime, security, configuration]
tags: [antigravity, providers, sessions, mcp, hooks]
read_when:
  - enabling or reviewing the Antigravity Session adapter
  - checking account binding, private configuration or file guards
  - changing Antigravity hooks, MCP questions, workspace discovery or Stop handling
summary: >
  Antigravity adapter enablement, consumer keyring login, native modes, private profile,
  hook-enforced file and command permissions, private MCP questions and workspace discovery,
  Stop continuation, settlement and durable limits.
related:
  - reference.providers.compatibility
  - reference.protocols.session-provider-driver
  - reference.api.sessions
  - architecture.ai.provider-boundary
  - architecture.ai.provider-process-ownership
---

# Antigravity Session provider

Code: `features/sessions/providers/antigravity/` plus the shared question transport in
`features/sessions/interactions/mcp/`. The adapter uses the existing driver, Engine execution
admission and settlement, SQLite lifecycle and HTTP/SSE contracts. It adds no lifecycle authority,
credential broker or global MCP installation.

## Enablement

```yaml
# .nevo/config.yaml (committed; no local override)
sessions:
  enabled: true
  providers:
    antigravity:
      enabled: true
      # optional absolute native executable; default %LOCALAPPDATA%/agy/bin/agy.exe
      executable: C:/Users/example/AppData/Local/agy/bin/agy.exe
```

Windows x64 consumer CLI only. Models come from bounded no-input CLI discovery in a disposable
profile that sends no user event.

## Modes and effort

| Mode ID        | Native mode    | Effect authority  |
| -------------- | -------------- | ----------------- |
| `accept-edits` | `accept-edits` | `workspace-write` |
| `plan`         | `plan`         | `workspace-write` |

Agent (`accept-edits`) is the default. Native Plan is an instruction, not a filesystem read-only
boundary, so it also requires `workspace-write` and Engine admission. Effort overrides are
unavailable until a native catalogue contract establishes supported values; no effort is inferred
from model names.

## Authentication and private configuration

- The only supported source is the exact generic Credential Manager entry `gemini:antigravity`,
  read through `CredReadW` into an owned bounded copy that is cleared after use. Gateway, ADC/WIF,
  API-key and file-fallback sources are never silently selected; known fallback files and cached
  keyring-failure markers in the private profile are rejected. Environment projection excludes
  ambient authentication overrides.
- Stable account scope derives from native OAuth identity metadata (affinity evidence, not JWT
  validation); rotating token fingerprints are separate. The CLI alone performs login and refresh.
  No credential is copied, exported, logged or returned.
- Installation and account identity are checked at discovery, launch, before native correlation and
  immediately before input. An account switch cannot resume the old account's context. The
  read-to-launch window is not atomic.
- Private native history lives outside the project under a project/account/Session binding, with
  independent hook/MCP configuration per Session. Private directories reject symlink redirection.
  The CLI-created `default-cli-project.json` is accepted only with closed keys, the default ID and
  empty resources. Directory identities are base64url SHA-256 so the native HOME stays below 260
  UTF-16 code units; longer homes are rejected before creation.
- Workspace `.agents` hooks, MCP configuration, plugins, sidecars and project customizations are
  rejected, not deleted. Global user configuration is untouched; the updater is disabled.

## Native context and transcript

The CLI emits `init` before a user frame. Runtime validates account, workspace and permission
profile, persists the native conversation ID and crosses durable dispatch admission before writing
the user input. Continuation selects only the exact persisted `--conversation`; there is no
most-recent fallback or replacement of an uncertain context.

The stream adapter handles `step_update` and `result` frames: message text, commentary, supplied
reasoning text, tool Work/Actions and session-cumulative usage. Numeric thinking-token usage is not
reasoning text. Conflicting tool identities or arguments and unsupported frames fail closed. A
failed tool stays failed even if the Turn reports success. Bare numeric cost has no proven currency
and stays unavailable.

## Permissions

Native permission profile `proceed-in-sandbox` for both modes; every native tool passes through
`PreToolUse`. The native call ledger binds `stepIdx` and a digest of tool name and arguments; an
exact retry is denied, never granted from a previous answer. Limits: 1024 admitted hook calls and 32
outstanding file operations per Turn.

- **Automatic file tools.** Runtime opens each path component without following reparse points and
  holds directory/target handles without delete sharing until the matching `PostToolUse` or proven
  tree termination. Existing hardlinked targets, outside-root and customization-control paths are
  denied. New targets are reserved atomically and only that reservation receives native
  `Overwrite=true`. An interrupted reservation can leave an empty file or parent directories; it is
  an admitted partial effect, not rolled back.
- **Native recursive listing/search** (`list_dir`, `find_by_name`, `grep_search`) is denied; use the
  workspace discovery tools below.
- **Commands** require an exact canonical once-only host approval showing the command, the
  workspace-relative CWD and the outside-workspace warning, with physical CWD validation. The hook
  then returns `auto_approve` for that call only. No confinement is promised for approved commands;
  bypass, daemon, background/reused-terminal and unknown argument variants are rejected;
  `WaitMsBeforeAsync` ≤30 s. An approved command can change repository configuration; later
  invocations re-check private configuration, but whole-Turn repository immutability is not
  claimed.
- Unknown native tools, arbitrary MCP, resources, browser, scheduling and messaging are denied.
  Additional tools in a compatible CLI minor do not disable the installation.

The fixed Windows hook launcher encodes only trusted executable paths and the hook role, compresses
its fixed script to stay below the 8191-character `cmd.exe` limit, and passes native tool input
only through bounded UTF-8 stdin. Helper errors produce denial. Path checks plus retained handles do
not protect against an arbitrary malicious process already running as the user.

## Questions

The invocation-private Streamable HTTP MCP server (`ask_user`) binds to loopback on an OS-assigned
port with a random bearer credential, bounded requests and waiters and one initialized MCP session
per invocation. Runtime and CLI must share the network namespace. Free-text and single-choice
questions only; multi-selection is rejected before creating an Interaction. Question admission
requires activation after durable correlation and dispatch. Disconnect, cancellation and restart
expire live interactions; lost acknowledgement never retransmits.

## Workspace discovery

The invocation-private `specflow-discovery` MCP server offers exactly:

| Tool             | Arguments and behavior                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `list_directory` | `path`, `includes`, `excludes`; immediate entries only                                                                          |
| `find_files`     | common arguments plus `pattern`, `type` (`file`, `directory`, `any`) and `maxDepth`                                             |
| `search_text`    | common arguments plus literal `query`, `maxDepth`, `caseInsensitive`, `matchPerLine`; UTF-8 text only, binary files are skipped |

- Workspace-relative forward-slash paths with exact long-name casing; `.` is the root. Globs are
  case-sensitive `*`, `?` and whole-component `**`; at most eight 128-unit globs per list. Includes
  filter results; excludes prune traversal, including every component of an explicit start path.
  `node_modules` is excluded by default (`excludes: []` re-enables it); `.git`, `.nevo/local` and
  `.agents/{hooks.json,mcp_config.json,plugins,sidecars,projects}` are always excluded. Unknown
  arguments fail; native argument names are not accepted. Queries ≤256 UTF-16 units without
  newline/NUL; ASCII-only case folding; snippets ≤256 units.
- Local Windows x64 NTFS only. Every descendant is enumerated through held directory handles,
  opened by NTFS file ID without following reparse points, rejected if multi-linked or a reparse
  point, and checked against its expected normalized volume-GUID path before reading through the
  same handle. Concurrent changes can yield partial or failed results; discovery is not an atomic
  snapshot.
- A fixed packaged helper (`workspace-discovery`) runs each read under the process owner: default
  depth 16 (max 32), 10,000 visited entries, 1,000 searched files, 256 KiB per file, 8 MiB total,
  200 results, 48 KiB output, 128 MiB V8 heap, 10 s deadline. At most two searches run
  Runtime-wide with no queue; an unverified helper keeps its slot for the Runtime lifetime and
  disables discovery in its invocation.
- Results are `complete`, `partial`, `truncated`, `cancelled` or `failed`; failures never become
  empty success. A helper must positively settle before a successful response; unverified cleanup
  makes whole-operation settlement unknown. The endpoint emits no Work records.

## Stop continuation and settlement

Normal completion requires graceful stdin EOF, authenticated positive `Stop`/`fullyIdle` evidence,
natural exit and positive stopped-tree evidence. Missing idle, nonzero exit, timeout, failed helper
or forced descendant cleanup cannot fabricate success. EOF is draining, not cancellation.

| Evidence at authenticated Stop                                                                   | Response                                                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Pending question, permission or retained file; ordinary completion; continuation still available | `continue` once per invocation; no idle receipt, grant or new Turn   |
| Duplicate conflicting Stop, lower execution number, or idle replay after a newer tool generation | `deny`; no continuation or idle receipt                              |
| Cancellation, error, step limit, unknown reason or nonempty `error`                              | allow termination; disable continuation; never accept idle with work |
| Native result already observed                                                                   | continuation disabled; idle and process settlement still required    |
| No pending work, `fullyIdle: true`                                                               | `stop`; accept idle for that generation                              |
| No pending work, `fullyIdle: false`                                                              | `stop`; await later positive idle evidence                           |
| Aborted, closed, inactive, incorrectly bound or malformed request                                | `deny`                                                               |

Only `NO_TOOL_CALL` and `model_stop` with absent or empty string `error` count as ordinary
completion. The first conflicting Stop consumes the single continuation; a conflicting execution
number is never accepted again. `fullyIdle` is not a terminal result and cannot settle unresolved
interactions or retained files. Insufficient settlement stays unknown; forced termination after
possible dispatch keeps the Engine claim. Private endpoints and replay state are invocation-local
and never restored after restart.
