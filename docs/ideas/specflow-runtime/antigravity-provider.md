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

## Admission decisions and remaining evidence (2026-10-27)

The following decisions narrow AG.T01; they do not claim that its native checks
have passed. Rechecked primary sources are the
[CLI authentication reference](https://www.antigravity.google/docs/install/),
[headless protocol](https://www.antigravity.google/docs/cli/headless/),
[settings schema](https://antigravity.google/schemas/v1/settings.json) and the
sandbox/settings references above. Installed binary strings are discovery hints,
not supported configuration contracts.

- **Authentication owner:** use the CLI's native account login and system secure
  keyring. Runtime does not copy refresh credentials, refresh tokens itself or
  silently switch to Gemini API-key/ADC billing. The authentication reference
  explicitly describes keyring token profiles. Private HOME is configuration
  separation, not an isolated authentication authority. The remaining technical
  check is a bounded, non-secret stable account/profile identity from the actual
  native credential source. If that identity cannot be established, execution
  remains unavailable; a path, installation ID, OS username or token hash is not a
  substitute. Account changes must never resume an old account's context.
- **Configuration owner:** use Runtime-owned private configuration and exact
  persisted native context, without modifying global settings. Before launching,
  inspect workspace hooks/MCP/plugins and reject unsupported executable additions
  rather than deleting them. Private HOME does not suppress workspace additions.
  Validate the effective tool inventory before dispatch, including browser,
  scheduling, messaging and sidecars; an inventory entry is not proof of denial.
  The supported mechanism that prevents these effects still needs native evidence.
- **Execution profile:** the proposed initial native mode is `accept-edits` with
  `allowNonWorkspaceAccess=false`, terminal sandbox enabled and
  `toolPermission=proceed-in-sandbox`. Do not use `auto`, skip-permissions or broad
  command allow rules that can authorize an unsandboxed command. These settings
  are a candidate profile, not evidence of enforcement. Native file tools need
  their own outside-workspace negative control. No full hostile-code sandbox is
  promised beyond the existing managed-execution architecture.
- **Native correlation:** reuse the implemented provider-assigned context barrier.
  No first prompt before durable native-ID binding. Continue only the exact saved
  ID; never use `--continue` or allocate a replacement after uncertain dispatch.
- **Process ownership:** reuse the retained Windows Job Object and Engine claims;
  do not add another supervisor or infer a shared daemon from the authentication
  documentation's shared harness wording. Evidence must show that actual tool
  execution remains owned. OS support/version alone does not prove containment.
- **Cancellation:** EOF is graceful draining. Forced tree termination without a
  correlated authoritative native outcome remains uncertain under the existing
  settlement rules. Do not translate it into successful cancellation or release a
  writer claim. A missing native cancel protocol is a capability limitation to
  document, not a reason to emulate Claude control frames.
- **Transcript:** retain only text/reasoning actually supplied by the provider.
  Numeric `thinking_tokens` is usage, not reasoning text. Native result usage in
  a streaming conversation is cumulative; adapt it using the existing usage
  basis instead of summing every result as a fresh per-Turn total.

### Owner decision: target interactive delivery

The documented stream rejects Claude-style control requests/responses and does
not specify an answer/approval channel. Headless tools requiring unobtainable
approval are soft-denied, and exit zero alone does not mean those tools ran.

The owner chose target interactive delivery in this feature. Implement an
invocation-scoped MCP question bridge using the existing canonical interaction
admission, response and delivery receipts. Do not install a persistent global
bridge, add another interaction journal or copy the old skip-permissions mapping.

The bridge owns a loopback Streamable HTTP endpoint, per-invocation credential,
bounded requests and waiters, and private MCP configuration. Permit only the exact
`mcp(specflow-interactions/ask_user)` tool. Initialize/discover before dispatch,
but admit questions only after durable native correlation and dispatch activation.
Set native `timeoutSeconds=-1`; Runtime bounds setup and cleanup separately from
the human answer wait. Disconnect/cancel/restart expire live questions; a lost
response acknowledgement never triggers automatic replay. A transport flush
receipt is delivery evidence, not proof that the model consumed the answer.

Legacy MCP supported questions only; its provider explicitly rejected interactive
permissions. The permission integration candidate is a private Runtime-owned
`PreToolUse` hook, binding immutable tool arguments, step and native conversation
to the canonical permission. Native `allow` delegates to default policy;
`auto_approve` represents an affirmative operation approval while honoring explicit
denies. Use a fixed trusted launcher and bounded stdin, never shell interpolation
of tool arguments or broad permission overrides. Prove native failure/timeout
behavior is fail-closed before enabling this path. MCP question answers alone
grant no execution authority. Full interactive permission acceptance remains open.

Metadata-only discovery previously found no enumerable native Windows credential
profile for the process and no stable account subject in the inspected CLI state.
No credential blobs were read or copied. This does not prove every login source
absent. Stable native account identity, private configuration including workspace
sidecars/project policy, effective tool isolation and hook enforcement remain
technical evidence gates; do not substitute installation UUID or token hashes.

Stable native account identity and effective tool isolation are technical evidence
questions owned by the adapter implementer, not unspecified product decisions for
the owner. AG.T01 must resolve them or report the exact missing native contract.
It must not leave another generic instruction to "investigate safety".

## Follow-up execution handoff (2026-10-27)

PR #98 is merged. Continue on `feature/antigravity-provider`, based on merged
`origin/main` revision `12a6e3b5`. This is one follow-up feature with one eventual
implementation PR, not another expansion of #98.

On 2026-10-29, the checkout was recovered from `fec58cf0` after its Git metadata
was removed. Surviving bridge source was preserved. Main `9b581856` readability
configuration was applied to that code before merging main. The merge completed
without textual conflicts; its dependency lockfile was regenerated against main's
security overrides and verified with a frozen install.

Preparation is **partially ready**: interactive scope is decided and the bounded
question transport is implemented independently of account discovery. Its two
focused test files pass 12 cases, runtime typecheck and scoped readability checks
pass, and independent component review approved after fixing startup-abort and
shutdown-persistence races. These results do not establish native acceptance.
The executable adapter is dependent on the native evidence gates above.

The owner confirmed on 2026-10-29 that `agy` is already authenticated in the
terminal. Missing metadata from the earlier inspection must not be interpreted
as a need to sign in again. Resolve the actual CLI account source without exporting
credentials, paid inference or an independent token refresh authority.

Manual discovery on that installation used the documented CLI-local `/usage`
report in a private configuration, outside test runners and CI. Both bounded
invocations reported zero Turns and zero tokens, exited naturally and had positive
stopped-tree evidence. No model prompt, reusable credential export or raw report
persistence occurred. The report exposes quotas, not stable account/profile
identity. It does not resolve the account-binding gate and must not be treated
as proof of native model execution, semantic continuation or permissions.

The exact missing account contract is a read-only authenticated principal/profile
identifier available before dispatch, stable across token rotation, changed by
account switching, and tied to the same native invocation. Quota bucket IDs and
installation UUID do not satisfy it. The credential source may differ from the
metadata-visible source in the Runtime process; do not conclude the user is logged
out or silently reuse an old account scope.
The existing Session driver, process boundary, Engine admission and SQLite
lifecycle remain the owners; this feature does not introduce competing owners.

### Task sequence

AG.T05 is the independently implementable question transport component under
Runtime Sessions `providers/antigravity/`. It depends on the existing canonical
driver/interaction contracts, not on a real login. Controlled transport tests cover
activation, authenticated invocation binding, question/answer delivery, duplicates,
lost acknowledgements, disconnects, abort and cleanup. AG.T03 consumes both T02
and T05; native registration/readiness remains dependent on T02 and actual native
acceptance. All stages remain in the same feature PR. This is not a declaration
that Antigravity execution or native permissions are already available.

| Task                                            | Dependencies / readiness    | Delivery and acceptance                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AG.T01 — Resolve native admission prerequisites | Ready for bounded discovery | Record the installed version/platform and primary-source evidence for configuration isolation, stable account identity, effective tool policy, process ownership and cancellation. Each gate must have a concrete supported mechanism and an acceptance check, or remain explicitly unresolved. No inference request is required for this task. |
| AG.T02 — Installation and admission             | T01; dependent              | Implement detection, private configuration, account/workspace binding and bounded protocol discovery beside the Antigravity adapter. Revalidate executable identity at launch. A missing or failed gate keeps execution unavailable; a successful initialization alone cannot admit a writable invocation.                                      |
| AG.T03 — Managed operation and transcript       | T02; dependent              | Use provider-assigned context, persist the exact native ID before input, normalize bounded message/reasoning/tool/usage facts, and implement exact-ID continuation. Correlated native outcome and positive stopped-process evidence remain separate. EOF and exit code alone cannot establish successful completion or cancellation.            |
| AG.T04 — Integration and independent acceptance | T03; dependent              | Verify existing HTTP/SSE/history, Engine write claims, restart, uncertain dispatch, account changes and failure handling with controlled processes. Independently review the full diff before enabling readiness. Manual native acceptance is reported separately.                                                                              |

All tasks use `nevo-agents:implementer`; independent gates use
`nevo-agents:reviewer`. These are handoff recommendations, not workflow manifest
fields. Discovery is implementation work against explicit evidence questions;
it is not permission to invent configuration or authentication contracts.

### AG.T01 evidence checklist and unblock condition

- **Configuration:** establish which supported invocation/configuration controls
  exclude global and workspace hooks, MCP, plugins, background scheduling and
  messaging. Inspect native file tools as well as terminal execution. Preserve
  the owner's files; do not sanitize global configuration in place.
- **Account:** establish a non-secret stable identity and the native mechanism
  that authenticates a private invocation without creating a second refresh-token
  authority. Do not substitute a credential fingerprint for durable account identity.
- **Containment:** identify the actual enforceable Windows prerequisites and
  effective policy. Document how to prove permitted in-workspace effects and
  denied outside-workspace effects in a disposable environment. A sandbox flag
  or advertised tool inventory is not that proof.
- **Lifetime:** establish whether tool processes stay inside the retained Job
  Object, how native cancellation is correlated and how an unconfirmed result
  retains the existing conservative recovery behavior.
- **Protocol:** confirm bounded pre-input native ID allocation and exact-ID
  continuation. Record the supported schema/version and diagnostic limits without
  persisting raw credentials, account identifiers or private paths in public output.

T01 finishes with evidence and resolved mechanisms, or a named external dependency
and its unblock condition. An unresolved gate blocks T02 execution readiness;
it must not be replaced by a boolean certification option, a mock-only proof or
the legacy skip-permissions mapping. Do not add unused production interfaces
merely to appear to have progressed while these mechanisms remain unknown.

### Verification and scope limits

Automated tests use controlled binaries, protocol fixtures and synthetic account
data only. They must cover ID binding before dispatch, failed initialization,
wrong native ID, uncertain delivery, duplicate request IDs, terminal/result races,
active descendants, restart and authorization isolation. Real CLI/account checks
are manual outside all test runners and CI, following
[the existing policy](provider-manual-checks.md). Any eventual inference check
explicitly requests a tiny test response and stops on quota/authentication failure.

No new UI, credential broker, provider update service, historical import or
automatic replay belongs to this follow-up. Native Agent is the intended normal
execution mode; Plan is exposed only if its effective semantics satisfy the
requested authority. Independent review is required after the admission design
is evidenced and again on the final implementation. Fixture success does not
claim native acceptance or readiness on untested platforms.
