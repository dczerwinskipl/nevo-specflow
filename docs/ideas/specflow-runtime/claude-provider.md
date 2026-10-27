---
id: ideas.specflow-runtime.claude-provider
type: engineering
title: Claude Session provider implementation and acceptance
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [claude, providers, sessions, migration]
read_when:
  - enabling or reviewing the Claude Session adapter
  - checking compatibility after a Claude CLI update
summary: >
  Production Claude wiring, optimistic Windows personal-OAuth compatibility, durable
  native context, bidirectional questions and explicit live acceptance limitations.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.provider-process-boundary
  - reference.protocols.session-provider-driver
  - reference.api.sessions
---

# Claude Session provider

Claude is registered alongside the optional mock in the existing Session coordinator. It uses the
same SQLite Worker, authorization, HTTP/SSE, tail/history/content APIs and independent Session UI.
No provider transcript endpoint or Spec/Task requirement is introduced. There is no legacy-history
import or resume-to-new fallback.

## Enablement

Committed `.nevo/config.yaml`:

```yaml
sessions:
  enabled: true
  providers:
    mock:
      enabled: false
    claude:
      enabled: true
      # Optional absolute native executable; default: ~/.local/bin/claude.exe
      # executable: C:/Users/example/.local/bin/claude.exe
```

The Runtime receives its workspace and Session storage from the verified Engine project context.
Provider flags do not have a local-config override. Disabled Claude does not inspect login or launch
a process. Enabling an unsupported installation leaves the provider unavailable; the Runtime and
other providers remain usable. Discovery is cached for at most 30 seconds and has a 30-second
overall budget, with bounded protocol initialization; ordinary chat snapshots do not launch
subprocesses. Startup warms discovery for existing
chat reloads. Model IDs, labels and effort choices come from native initialization, not a static list.

The supported configuration is Windows x64 native Claude with default first-party personal Pro/Max
OAuth file login. Native `plan` is read-only; `acceptEdits` (the writable default), `auto`, `manual`
and `dontAsk` use Engine-managed workspace-write admission. Claude 2.1.296 is the observed Tested
read-only baseline; writable profiles remain Provisional. A different
hash, newer release or new major may run Provisional when local protocol/execution checks pass.
Linux/macOS, Team/Enterprise, API keys, profiles/gateways and alternate auth directories remain
outside the implemented configuration. Unknown hashes alone never deny execution.

Expired/rejected login is exposed as `authenticationRequired`. The operator signs in through
the original CLI and explicitly rechecks availability. Recheck never sends or replays a Turn.
Credential rotation invalidates discovery while preserving account/workspace affinity; late
errors from an old operation do not reject a newer verified login. Unknown executions retain
their recovery state and Engine claim.

## Prelaunch policy checks

See [optimistic compatibility and admission](provider-compatibility.md) for the owner's revised
policy. SHA-256 identifies builds and invalidates discovery cache; it is not an execution allowlist.
It hashes the executable and rechecks authentication/policy sources before each launch. It accepts
only the platform environment projection, requires regular default config/credential files,
an unexpired inference-scoped Pro/Max OAuth credential, and a stable opaque account binding.

It refuses the native Windows managed-settings file/fragments/MCP file, symlinked policy root,
registry policy roots in both hives/views, remote cache, legacy `.claude/.config.json`, Anthropic
profile directory, FD fallback credential files, stored `primaryApiKey` and the cached Windows
Credential Manager feature. Missing is distinguished from access denied or unreadable/malformed
data. Registry inspection uses fixed .NET read operations in an absolute, hidden, profile-free
PowerShell process with a two-second/4 KiB budget; it never executes policy values. Credential
contents and native account identity do not become public diagnostics or descriptors.

This narrow subset is supported by inspection of that exact executable's embedded JavaScript:

| Binary offset                       | Evidence                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 215609341                           | Remote-policy eligibility excludes known personal Pro/Max unless profile/API authentication supplies another eligible source; unknown subscription remains eligible. |
| 215028682                           | Subscription is read from the selected OAuth record.                                                                                                                 |
| 215003300                           | Global `primaryApiKey` is an additional authentication source.                                                                                                       |
| 213641081                           | Remote cache is not applied when eligibility is false.                                                                                                               |
| 213662149                           | Windows managed root is the fixed `C:\Program Files\ClaudeCode`.                                                                                                     |
| 211840302 / 214070759               | Default config directory and secure-storage override affect credential selection.                                                                                    |
| approximately 212102200             | Existing `.claude/.config.json` overrides the ordinary global config.                                                                                                |
| approximately 214088000 / 229122887 | Credential Manager choice is latched from the environment/config feature before credential use.                                                                      |

These are bounded build-specific findings, not an OS sandbox or a guarantee for other releases.
The [managed-settings documentation](https://code.claude.com/docs/en/managed-settings) and
[remote-policy documentation](https://code.claude.com/docs/en/server-managed-settings) explain why
an absent cache or safe-mode flag alone is insufficient. User-controlled login/settings must remain
consistent while a native invocation runs; Runtime does not own the external CLI login process.

## Invocation and settlement

Before launch, one store transaction reserves an independent native UUID, workspace and account
scope with the Turn. Immediately before the first user frame, a fenced dispatch-intent transaction
prevents duplicate dispatch. Correlation must match the reserved ID. Confirmed contexts resume only
in the same workspace/account after reload/restart. An unconfirmed possible dispatch cannot be
replayed as a new conversation. Neither native IDs nor the account binding are exposed in snapshots.

Arguments fix safe/restricted mode, the selected native permission mode, an explicit tool inventory,
no external MCP, no settings sources, disabled hooks/slash commands and host permissions over stdio.
Plan exposes Read/Glob/Grep/AskUserQuestion; managed writers additionally expose Edit/Write/Bash.
User frames are explicitly
`client_composed: true`, suppressing native path-mention/slash-command interpretation. Native init
checks version, cwd, mode, tool inventory and absence of MCP. Only the three observed plugins bundled
in the pinned executable (agents-md, telemetry, plugin-authoring) are accepted, with exact builtin
path/source; external or additional plugins are refused.

The pinned builtin evidence is also bounded: agents-md uses reading/context primitives (embedded
module around 247758000–247764200); plugin-authoring registers a skill (247812033) while command/skill
exposure is disabled by the supplied flag (220687609 / 221960991). Telemetry can perform auxiliary
network/native activity and is not effect-free. The guarantee concerns restricted workspace effects;
native private transcript/cache writes needed for continuation are allowed.

The reader continues while questions wait. One native AskUserQuestion request maps to at most four
canonical questions; pending questions, control identities and serialized stdin writes have explicit
bounds. Canonical `maxSelections` is checked before durable response admission. Native cancellation
expires the relevant interaction without sending a stale answer. Read-only rejects writable
permissions; managed writer profiles support bounded one-operation Edit/Write/Bash decisions.
Unsupported requests are refused, and permission suggestions/persistent updates are never forwarded.
Unknown control protocol fails
closed. No silence timeout is applied while waiting for user input or a model/tool response.

Terminal facts are held until the shared process owner has stopped the process tree. A protocol
outcome with unverified tree settlement remains unknown. Abort with positive settlement becomes
cancelled/interrupted. Native `api_error` results, including the observed HTTP 429 shape, become safe
structured failures; arbitrary native error prose is excluded. Loss without authoritative outcome stays
unknown when the handle subsequently resolves/rejects.

The [official SDK transport](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)
and [control protocol](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py)
are protocol evidence; newer SDK shapes must satisfy the implemented protocol checks, independently of their release number.

## Acceptance evidence and remaining limits

Focused tests cover gate refusals before provider spawn, protocol/result normalization, control-loop
questions/cancellation and private context persistence. A controlled real Node child process through
the production driver, process owner, SQLite Worker and HTTP proves question response validation,
cancel/settle, Runtime restart and exact-context continuation without workspace writes.

At the historical quota-limited checkpoint on 2026-10-26, the installed native CLI passed prelaunch
checks, initialized 13 native models and was
called through the production Runtime HTTP path: create returned 201 and start returned 202. The
native account returned a weekly quota error (HTTP 429); the Turn persisted as failed, process cleanup
completed, and the disposable workspace remained empty. That checkpoint did not prove a successful
model answer or semantic resume. Later explicitly
invoked checks on `9dd7c10a` passed real Write, foreground Bash and semantic resume
in `acceptEdits` and `manual` modes (two profiles, six native Turns). Native
AskUserQuestion and real cancellation were not established by those checks.

Live-account test-runner cases have since been removed at the owner's request.
Automated tests and CI use synthetic credentials and controlled processes only;
they do not require a personal login or subscription. Further native checks are
short manual activities under the [manual provider check policy](provider-manual-checks.md).
The controlled transport tests remain distinct from native acceptance evidence.

Historical normalization verification on `eb2879eb`:

- Linux Runtime build/typecheck and all **785 tests** passed (100 files).
- The broader build/typecheck and package run on `5758588d` passed: contracts 188, HTTP client 26,
  Runtime 783, UI 1188, product 131; one existing product fixture entry skipped. The final follow-up
  adds two Runtime regressions and leaves the other packages' implementation unchanged.
- SpecFlow UI Storybook scope: **463 tests** passed, 43 files passed and one tagged file skipped.
  UI changes only remove the mock label for real providers; they introduce no state/effect ownership.
- Root `pnpm check:quality` passed on the final implementation, including 232-document corpus/index,
  generated-agent projection and version-transition checks.
- Independent review found no blocking lifecycle/private-data findings; 51 tests passed in its initial
  review and 13 targeted tests in the safe-error follow-up. The minor authentication readiness
  classification finding was corrected before final validation.

The current delivery includes implemented Engine effect admission and writable Claude/Codex in
PR #98. [Codex](codex-provider.md) records its separate native resume evidence and authentication
limits. Antigravity, continuous in-flight credential renewal, broader product associations and UX
are follow-up scopes, not additional requirements for accepting this PR. Integration with future
Documents writers must still use the same Engine admission boundary.
