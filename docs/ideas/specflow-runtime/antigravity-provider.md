---
id: ideas.specflow-runtime.antigravity-provider
type: engineering
title: Antigravity Session provider discovery and admission prerequisites
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [antigravity, providers, sessions, migration]
read_when:
  - implementing the Antigravity Session adapter
  - checking native context allocation, cancellation and sandbox prerequisites
summary: >
  Verified installed CLI surface, primary protocol evidence, and explicit gaps
  that must be closed before advertising managed Antigravity execution.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.provider-process-boundary
  - ideas.specflow-runtime.managed-agent-execution
  - reference.protocols.session-provider-driver
---

# Antigravity provider discovery

Status: discovery in PR #98, not a registered executable Session driver. Do not
interpret the legacy adapter or a help-only probe as writable certification.

## Observed installation

An explicitly invoked Windows x64 installed-CLI `--help` probe passed through the retained
Job Object process boundary. It submitted no prompt, model request or daemon
command. The installed CLI advertises stream-json input/output, explicit
conversation IDs, model/effort, `plan`/`accept-edits`, disabled slash expansion and
a terminal sandbox flag. Future probes disable the documented background updater
with `AGY_CLI_DISABLE_AUTO_UPDATE=true` and request noninteractive behavior.

Further no-prompt discovery with a temporary Windows profile returned the model
catalogue and emitted `init` with `conversation_id` while stdin was still empty.
The profile used private USERPROFILE/HOME/APPDATA/LOCALAPPDATA directories and
disabled the updater. No user event or model request was sent. This is evidence
for that installed build, not an authentication or effective-policy certificate.

It does not establish model/tool ownership, account binding or sandbox enforcement.
The native tool inventory still includes browser, MCP, scheduling and messaging
families; a private profile alone is not sufficient admission evidence.
These experimental test-runner probes have been removed. Future native checks
are manual only under the [manual provider check policy](provider-manual-checks.md).

## Documented protocol and unresolved evidence

The primary [headless reference](https://www.antigravity.google/docs/cli/headless/)
documents `event:user` input and `init`, `step_update`, `result` output. Native
context is the top-level `conversation_id` on `init`; continuation uses the exact
ID through `--conversation`, without a most-recent-context fallback.

The documentation does not promise pre-input `init`, but the installed build
emitted it during the no-prompt discovery above. Reuse the current provider-assigned
contract and durably correlate that ID before the first user event. If a future
build cannot supply it within bounded initialization, leave dispatch unavailable;
do not weaken the existing correlation-before-dispatch guarantee.

EOF drains the current Turn; it is not cancellation. Claude control frames are
explicitly unsupported. Native interrupted/cancelled result statuses can supply
authoritative outcome evidence, but the correlated cancellation mechanism and
process settlement still require acceptance tests.

## Execution and configuration gates

The primary [sandbox reference](https://www.antigravity.google/docs/sandbox/)
documents Windows platform prerequisites and that `--sandbox` can have no effect
when OS containment is unavailable. A flag or `init.permission_mode` is therefore
insufficient proof. Establish positive in-root write and negative outside-root
controls, and inspect whether native file tools and terminal tools share the
requested policy. Do not automatically allow unsandboxed exceptions.

The native [mode reference](https://www.antigravity.google/docs/cli/modes/)
describes Plan as an instruction prefix. Its name alone cannot establish Runtime
read-only authority. Legacy `agent` mapped to skip-permissions; that mapping must
not be copied into this adapter.

The primary [settings reference](https://www.antigravity.google/docs/settings?tab=cli)
describes mutable global settings and separate global/workspace hooks, MCP and
plugins. Before startup, prove configuration isolation or strictly validate the
effective allowed configuration, including account/workspace affinity. Do not
copy reusable refresh credentials into independent authorities or rewrite the
owner's global settings to make a probe pass.

The [troubleshooting reference](https://www.antigravity.google/docs/cli/troubleshooting/)
documents disabling the automatic updater. Installation identity must remain
stable between discovery and dispatch.

Ordinary headless process ancestry is not specified by these references. The
separate [Remote Control daemon](https://www.antigravity.google/docs/remote-control/)
does not prove that model execution uses a shared daemon. Verify actual worker
ownership instead of assuming either shared or per-invocation execution.

## Next implementation steps

1. Establish isolated configuration and stable account identity without modifying
   global hooks/MCP/plugins or duplicating refresh ownership.
2. Observe idle startup and native context allocation without a user prompt.
3. Prove actual tool-process ownership, sandbox enforcement and cancellation.
4. Implement the verified native context contract, bounded transcript normalizer
   and independent stopped-tree settlement evidence.
5. Verify native write, continuation, restart, quota/auth failures and canonical
   HTTP/SSE/history through the same Engine and SQLite owners as other providers.

Until these gates are established, do not advertise Antigravity as ready, add a
force-completion path, infer successful cancellation from EOF, or install the
legacy persistent MCP bridge into user configuration.
