---
id: ideas.specflow-runtime.provider-migration-plan
type: engineering
title: Provider integration migration and capability backlog
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, migration, backlog, claude, codex, antigravity]
read_when:
  - continuing migration after Plan 04
  - planning real provider parity and managed writer integration
summary: >
  Consolidated provider capability follow-ups, source evidence and acceptance boundaries,
  alongside historical migration checkpoints. Future capabilities are outside PR 107.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-engine.plan-05
  - ideas.specflow-runtime.managed-sessions-delivery
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.ai-adapters.migration-inspection-map
---

# Real provider migration

## Current scope and capability backlog ownership

Audit baseline: PR #107 `7a49709b51e0b948c1e04c0a01edb5e3bec31011`.
The foundation, Claude/Codex and Engine writer admission landed in PR #98;
PR #107 adds managed Antigravity, shared private MCP questions and provider telemetry.
The work-package and Claude checkpoint sections below are historical migration
evidence, not a claim that their earlier quotas, API gaps or integration branches
still describe the current implementation.

This document owns the **consolidated future provider-integration backlog**.
Implemented behavior remains owned by [the driver protocol](../../reference/protocols/session-provider-driver.md),
[Sessions API](../../reference/api/sessions.md), [telemetry API](../../reference/api/session-telemetry.md),
[execution contract](managed-agent-execution.md) and individual provider documents.
[V10 readiness](session-v10-backend-readiness.md) separately owns product associations
and frontend/backend integration gaps. This backlog introduces no current API guarantee.

All F01–F19 items below are **outside PR #107**, including priorities marked P1.
Priority is suggested follow-up ordering, not a new condition for merging this PR.
Each needs its own bounded design/implementation/review. No current adapter should
enable it by accepting arbitrary configuration keys, native tools or protocol frames.

### Decisions carried forward

- Sessions remain independent of Specification, Task and Workflow.
- Automatic operations remain workspace-confined. Every unconfined command needs
  exact, once-only host approval with its starting directory and outside-workspace warning.
- Native modes, Engine admission and execution authority remain distinct. Codex
  continues denying host escalation. AppContainer and in-flight auth brokers are excluded.
- Compatible ordinary CLI updates do not require known hashes, certification updates
  or a Nevo release. Current protocol/execution prerequisites still apply.
- Automated verification uses controlled programs and synthetic credentials, never
  paid inference or personal subscriptions. Native manual evidence is labelled separately.
- Richer interaction handling does not silently remove the current MCP single-selection limit.

### PR #107 audit findings against baseline `7a49709b`

The following narrow corrections belong to this PR, rather than the future
capability backlog. Each regression was observed failing against the pre-fix code
using controlled programs or synthetic values. No model request or personal
credential was used.

| Finding                                                     | Violated invariant and reproduction                                                                                                                                                                                                                                                                           | Correction and evidence                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 — P2, effective hook-argument replay                    | A new-file reservation rewrites `Overwrite: false` to `true`. Only the original identity was remembered as consumed. A second PreToolUse with the effective arguments could overwrite the receipt alias, orphaning a held file handle. An earlier receipt could also collide with a newly rewritten identity. | Reserve both identities for the same one-shot operation and reject alias collisions before publishing a grant. Count admitted operations separately from aliases, retaining the 1024-call bound. `antigravity/hooks.test.ts` covers replay before/after receipt, earlier-receipt collision and the real Win32 guard through the HTTP bridge.                                                |
| A02 — P2, refresh settlement under transient store pressure | A failed native read followed by one busy terminal-state write could leave durable refresh state `running`; a successful read followed by the same failure could be incorrectly marked failed.                                                                                                                | Retry only `SESSION_STORE_BUSY`, at most three attempts with 250 ms spacing, preserving generation fencing. The native source is read once. `lifecycle/telemetry.test.ts` covers success/failure, running-state pressure, retry exhaustion and owner shutdown. Persistent store failure still requires existing restart recovery; no outcome is fabricated when persistence is unavailable. |
| A03 — P2 hardening, known bearer-secret variants            | Private diagnostic capture received a known `Bearer <credential>` secret, but an unlabelled raw or percent-encoded credential component could remain in captured stderr. This was reproduced with a synthetic token, not an observed personal-secret disclosure.                                              | Include the credential component among existing known-secret variants. `process/diagnostics.test.ts` exercises actual bounded diagnostic capture; public errors/DTOs are unchanged.                                                                                                                                                                                                         |

**A04 — P2, account-switch observation retirement.** The service submitted the new
account to the normal observation fence, but Worker correctly rejected that scope
against immutable native Session binding. A cached old driver scope could therefore
keep showing the old account's limits; late native gauges could also restore them.
The real service/Worker regression fails against the pre-fix implementation.
The correction separates retirement from rebinding: revalidate the observed account
under serialized admission, compare the prior durable fence transactionally, retire
gauges and old refresh state, and ignore old-account native gauges. Session identity
and historical usage/cost remain unchanged. The regression also verifies that delayed
retirement cannot erase a newer valid login/publication or admit observations for
the wrong account. An independent reviewer reproduced the original defect and
reviewed the correction; the two telemetry suites passed all 42 tests.

Additional controlled Windows checks verify that held direct-file identities reject
rename/delete, trailing dot/space aliases, alternate data streams and outside-root
paths, and allow normal use followed by release on the matching receipt. These
checks exercise Runtime handles, not an inference-backed native provider Turn.

**A05 — P3 verification, Windows commit synchronization.** The final Windows
lifecycle job failed two existing one-second polling waits: the coordinator's
`active → unknown` assertion and the HTTP usage/cost projection. Both unchanged
files passed in isolation. Their tests now await the actual lost-fact commit or
fixture outcome commit before retaining the same state/value assertions. No
timeout increase, global retry or production change is involved. Independent
review and a focused Windows run passed all 18 tests.

The audit does not certify every external CLI or claim OS isolation for approved
host commands. Existing manual acceptance evidence and its limits remain in
[managed execution](managed-agent-execution.md#common-execution-boundary-acceptance).
In particular, the Codex patch-helper directory-replacement race remains
unverified: a denied shell write is not evidence for the separate patch path, and
a failed nested helper launch does not prove confinement. A useful future bounded
control must first demonstrate successful patch-helper launch under the same
sandbox, then hold it at a reproducible barrier before replacing the directory.
No paid model Turn is needed for that evidence; it must not change Codex's denial
of host escalation. This evidence gap is not a confirmed vulnerability.

### Paseo comparison and classification

Reference inspected at Paseo commit `ab8e1e61ff7c0bbad08c95e15a09f3ec42333410`.
The comparison reads source, rather than treating older SDK capability notes as
the current implementation. No Paseo code or tests were executed. Paseo is evidence
of integration choices, not the authority for SpecFlow's security or lifecycle.

| Difference / evidence                                                                                                                                                             | Classification for SpecFlow | Disposition                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude SDK, native Codex app-server and generic ACP adapters coexist in [Paseo adapters][paseo-types] and [generic ACP][paseo-acp]                                                | Intentional limitation      | Keep the three current native adapters. ACP requires F06, not a transport rewrite.                                                                                                               |
| Provider capabilities, catalogues, models and configuration cache keys in [provider interfaces][paseo-provider]                                                                   | Follow-up                   | F17 extends honest discovery; retain current bounded catalogue/profile checks.                                                                                                                   |
| Provider options, launch overrides and multiple configurations in [provider configuration][paseo-config]                                                                          | Follow-up                   | F05/F07 need typed policy and identity semantics; do not copy arbitrary `options`/environment into Session.                                                                                      |
| User/project MCP and configured native extensions in [Claude options][paseo-claude] and [runtime MCP][paseo-mcp]                                                                  | Intentional limitation      | Current private MCP-only profile is deliberate; F01 governs controlled expansion.                                                                                                                |
| Configurable disallowed tools in [provider configuration][paseo-config]                                                                                                           | Follow-up                   | F02 must preserve an enforceable tool subset and per-operation approvals.                                                                                                                        |
| Antigravity plugin advertises unattended full access and launches `--dangerously-skip-permissions` in [its catalogue][paseo-agy-catalog] and [process adapter][paseo-agy-process] | Intentional limitation      | Do not copy that policy. SpecFlow uses private questions, guarded automatic file access and exact host-command consent. The plugin's description is not proof that native hooks/MCP cannot work. |
| Native persistence handles, external history/list/import in [agent interfaces][paseo-types] and [Claude adapter][paseo-claude]                                                    | Follow-up                   | Native resume is implemented here; external Session import is separately opt-in F11.                                                                                                             |
| `steerActiveTurn` with expected Turn identity in [agent interfaces][paseo-types]                                                                                                  | Follow-up                   | F03 needs durable input/acknowledgement semantics inside the existing Turn owner.                                                                                                                |
| Native command and feature discovery in [Claude adapter][paseo-claude] and [generic ACP][paseo-acp]                                                                               | Follow-up                   | F04/F17; literal chat text must not become an implicit command dispatcher.                                                                                                                       |
| Typed text/image/attachment input in [agent interfaces][paseo-types]                                                                                                              | Follow-up                   | F10 needs storage, access, expiry and modality support; do not drop unsupported blocks.                                                                                                          |
| Cross-platform launch and interruption in [Antigravity process adapter][paseo-agy-process]                                                                                        | Follow-up                   | F08 needs platform-specific enforcement, not only a portable spawn call.                                                                                                                         |
| Broader host/plugin/orchestration ownership and simpler provider usage projections                                                                                                | Not applicable              | Do not copy another Session owner, Task orchestration or weaker monetary/accounting semantics into this PR.                                                                                      |

Confirmed defects/hardening belong in the audit and regression tests, rather than
being inferred from this feature comparison. Missing optional capabilities are not bugs.

### F01 — Native MCP, skills and plugins

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Claude disables external MCP/hooks; Codex disables configured MCP/skills;
Antigravity gets only its invocation-private `ask_user` transport. Paseo exposes configured
extensions through [Claude options][paseo-claude] and [runtime MCP][paseo-mcp].
**Impact/direction:** Users cannot reuse their native extensions. Design explicit trusted
sources and provider-owned extension capabilities without enabling them globally.
**Dependencies/security:** Configuration provenance, executable/environment policy, per-profile
identity, permission routing and teardown must be decided first; an MCP server is executable code.
**Minimum acceptance:** Allowed/denied sources, hook/tool inventory changes, lost callbacks,
cross-Session isolation, cancellation/restart and secret redaction all have controlled tests.

### F02 — Configurable tool inventory

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** `claude/modes.ts`, `codex/connection.ts` and Antigravity permission schemas
admit fixed supported tool/policy profiles. [Paseo configuration][paseo-config] offers tool overrides.
**Impact/direction:** Users cannot add a native tool merely because the CLI has it. Design a
provider-specific, validated policy tied to supported handlers and effective execution authority.
**Dependencies/security:** F01 where extensions add tools; unknown tools never acquire blanket
approval and metadata cannot override sandbox/host-consent policy.
**Minimum acceptance:** Effective inventory is observed, unsupported combinations explain why,
and tool additions cannot broaden an existing approval or resume authority.

### F03 — Active-Turn steering

**Priority:** P2. **Outside PR #107; owner decision required on canonical input semantics.**
**Current/evidence:** Start admits one active Turn and does not add input to it.
Paseo has `steerActiveTurn(prompt, {expectedTurnId})` in [its interfaces][paseo-types].
**Impact/direction:** A user currently cancels/waits before changing instructions. Define whether
steering is additional canonical input within the same Turn, with immutable request identity.
**Dependencies/security:** Durable dispatch/acknowledgement, writer claim ownership, question
interaction ordering and unsupported native transports must be settled without a second lifecycle.
**Minimum acceptance:** Lost ACK, duplicate input, superseded Turn, cancel/terminal races and
restart never steer another invocation or replay an uncertain instruction.

### F04 — Native slash commands

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Current adapters preserve literal user messages and disable implicit
slash-command expansion where applicable. Paseo exposes native command discovery in
[Claude][paseo-claude] and [ACP][paseo-acp].
**Impact/direction:** Chat cannot intentionally invoke native management commands. Design a
bounded command catalogue with explicit invocation and advertised availability/effect semantics.
**Dependencies/security:** Commands can change models, context, permissions or configuration;
they need admission/idempotency rules and cannot be forwarded as arbitrary shell text.
**Minimum acceptance:** Supported/unsupported commands, ordinary slash-prefixed text, discovery
changes, active-Turn restrictions, cancellation and lost acknowledgements are distinguished.

### F05 — Provider-specific settings

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Sessions accepts explicit mode/model/effort fields and closed configuration.
[Paseo provider options][paseo-config] demonstrate a broader provider-owned settings surface.
**Impact/direction:** Useful native settings cannot be configured. Define typed, versioned
provider-owned settings, separating Session defaults from next-Turn overrides.
**Dependencies/security:** F17 discovery, secret resolution and account/profile affinity.
No unvalidated arbitrary object, command-line arguments or environment map enters core Session.
**Minimum acceptance:** Unsupported keys fail honestly; settings changes invalidate discovery
and cannot change an admitted invocation, authentication source or effective authority.

### F06 — ACP support

**Priority:** P3. **Outside PR #107; separate provider/transport decision required.**
**Current/evidence:** SpecFlow implements Claude control, Codex JSON-RPC and Antigravity native
stream/MCP. Paseo has a [generic ACP adapter][paseo-acp] in addition to native adapters.
**Impact/direction:** ACP-compatible agents cannot use the current driver. Design a bounded ACP
adapter against the existing canonical driver, not a parallel Session model or dynamic code loader.
**Dependencies/security:** Capability/permission mapping, native history identity, process ownership,
filesystem authority, authentication and protocol-version handling are prerequisites.
**Minimum acceptance:** Driver conformance, supported capability negotiation, interactions,
cancellation, unknown recovery and cross-Session isolation use controlled ACP fixtures.

### F07 — Custom provider profiles

**Priority:** P2. **Outside PR #107; owner decision required on profile identity and selection.**
**Current/evidence:** A Session pins its provider and native account/workspace context. Supported
authentication sources are intentionally narrow. [Paseo overrides][paseo-config] support named
configurations and alternate launch/options/model settings.
**Impact/direction:** Multiple accounts/endpoints/configurations of one adapter are not selectable.
Define opaque profile identity and provider-owned validated configuration separately from account secrets.
**Dependencies/security:** F05; CLI-owned credentials, discovery caching, immutable affinity and
permission checks. Changing a profile must not rebind an old native conversation.
**Minimum acceptance:** Two concurrent profiles remain isolated across refresh, account rotation,
restart and late authentication failures; private paths/account identities stay out of public DTOs.

### F08 — Native Linux/macOS support

**Priority:** P1. **Outside PR #107.**
**Current/evidence:** Product packaging runs on all three OSes, but real adapter admission supports
Windows x64 profiles only. `compatibility/catalogue.ts` enforces this distinction; a portable
[Paseo launch function][paseo-agy-process] does not certify equivalent security.
**Impact/direction:** Native agents cannot run on Linux/macOS or a typical Linux Docker host.
Specify each platform's supported authentication, execution and filesystem protection profiles.
**Dependencies/security:** Process groups/descendants, path replacement, private profiles and native
sandbox availability must be verified. Do not extend only the platform enum.
**Minimum acceptance:** Positive writes, outside-root/path-replacement denial, approved-host
consent, natural exit, cancellation, SIGKILL/restart and installed-artifact startup pass per OS.

### F09 — In-flight authentication renewal

**Priority:** P1. **Outside PR #107; no Runtime credential broker is approved.**
**Current/evidence:** External CLI sign-in/recheck, account/credential generation fencing and
bounded auth-required outcomes exist. Coordinated renewal inside a long active Turn does not.
**Impact/direction:** An expired active invocation may fail or remain uncertain. Investigate
native supported pause/recheck/continuation mechanisms while leaving token refresh with the CLI.
**Dependencies/security:** Native evidence of dispatch/consumption, account affinity, cancellation
and generation ordering. Successful re-login is never permission to resend possibly executed input.
**Minimum acceptance:** Rotation, account switch, old late auth errors, cancelled login/recheck,
multiple Sessions and restart preserve original context and prevent duplicate execution.

### F10 — Attachments and modalities

**Priority:** P2. **Outside PR #107; separate media ownership/input contract required.**
**Current/evidence:** StartTurn carries text. Model descriptors do not certify image/file input.
Paseo's [prompt types][paseo-types] include images and typed attachments.
**Impact/direction:** Files/images cannot be sent as native model input. Define authorized stable
references, supported model modalities, bounded upload/read behavior and expiry.
**Dependencies/security:** Content storage ownership, size limits, private path protection, cleanup,
provider-specific input validation and native model discovery; no model-name heuristics.
**Minimum acceptance:** Unsupported modalities are explicitly rejected, not silently dropped;
identity changes, replay, access revocation and cancellation preserve exact input semantics.

### F11 — Optional native Session import

**Priority:** P3. **Outside PR #107; owner explicitly excluded historical import from this migration.**
**Current/evidence:** Runtime resumes contexts it admitted itself, not arbitrary external chats.
Paseo has native listing/import in [Claude][paseo-claude] and persistence handles in [its types][paseo-types].
**Impact/direction:** Existing CLI chats cannot be adopted. Any future opt-in import must define
identity, history fidelity, read-only inspection versus writable adoption and provenance.
**Dependencies/security:** Account/workspace affinity, bounded history/content loading, dedupe,
secret handling and unknown execution. Import is not backward compatibility by default.
**Minimum acceptance:** Repeated import is idempotent; no cross-account/context substitution,
unbounded transcript load, fabricated Turn result or unsafe missing-history fallback occurs.

### F12 — Streaming improvements

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Canonical bounded facts/SSE exist. Claude consumes full messages; Codex
and Antigravity normalize their supported native updates. Paseo exposes streaming/steering via
[agent interfaces][paseo-types] and [Claude][paseo-claude].
**Impact/direction:** Some partial text arrives later than the native CLI could expose. Evaluate
incremental events only where reliable native correlation and final reconciliation exist.
**Dependencies/security:** Content revisions, UTF-8/size budgets, duplicate/out-of-order events,
backpressure and reasoning provenance. Numeric thinking usage is not renderable reasoning text.
**Minimum acceptance:** Delta/final replacement, cancellation, late frames, replay and missing
partials preserve one final answer and never duplicate usage or expose withheld model internals.

### F13 — Interaction parity

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Claude/Codex map supported native question groups; canonical interactions
separate admission from transport delivery. Antigravity MCP intentionally admits at most one selected option.
**Impact/direction:** Additional native question/selection/permission types are unavailable.
Design each type with complete client behavior and immutable response semantics before enabling it.
**Dependencies/security:** Frontend capability support, ordering/cardinality, delivery receipts,
expiry, account/Session isolation and exact one-shot host consent. No implicit selection fallback.
**Minimum acceptance:** Grouped questions, duplicate/lost replies, invalid cardinality, disconnect,
cancel/restart and unsupported clients cannot leave a falsely answered or unfinishable interaction.

### F14 — Antigravity recursive search

**Priority:** P1. **Outside PR #107.**
**Current/evidence:** `antigravity/permissions.ts` denies automatic `list_dir`, `find_by_name` and
`grep_search`; holding one root handle cannot constrain traversal through uninspected descendants.
An explicitly approved host command is the existing alternative.
**Impact/direction:** Routine search needs more user approvals. Investigate a bounded, genuinely
confined discovery mechanism or evidenced native enforcement, preserving direct-file guarding.
**Dependencies/security:** Symlink/junction/hardlink policy, recursion/output budgets, path changes
during traversal and native tool schemas. Do not solve this by blanket command auto-approval.
**Minimum acceptance:** Useful nested search and controlled exclusions work; existing and raced
outside links, cancellation and result overflow cannot read/write outside the granted scope.

### F15 — Antigravity effort discovery

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** The adapter discovers models but advertises no effort values without native
evidence. Paseo's [catalogue][paseo-agy-catalog] likewise has no separate thinking options; its
statement about model IDs is not an independent native effort-negotiation contract.
**Impact/direction:** Users select native model variants but cannot set a separately certified
effort. Investigate actual CLI catalogue/schema support and per-model availability.
**Dependencies/security:** F17 and compatibility profiles; no values inferred from names and no
arbitrary `--effort` forwarding.
**Minimum acceptance:** Supported values round-trip, unsupported combinations fail before dispatch,
and catalogue/model changes invalidate stale choices without blocking unrelated supported modes.

### F16 — Telemetry coverage and provenance

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** The [telemetry API](../../reference/api/session-telemetry.md) documents exact
current source coverage. Unqualified Antigravity cost, missing context breakdowns and unproven
limit-bucket meanings remain unavailable; API-equivalent cost is not subscription billing.
**Impact/direction:** Some UI gauges cannot be populated. Add source-evidenced metrics, safe
bucket classification, per-window freshness or pricing provenance only through the same ledger.
**Dependencies/security:** Currency/precision/overlap, baseline coverage, account/model/context
fences and dedicated limit authorization. No transcript estimates or second aggregation store.
**Minimum acceptance:** Missing samples, compaction, account switches, Worker restart, stale
values, 304/SSE and terminal publication never fabricate zeros, dollars or complete coverage.

### F17 — Provider feature discovery

**Priority:** P2. **Outside PR #107.**
**Current/evidence:** Descriptors currently expose bounded native modes/models/efforts, readiness
and supported driver capabilities. [Paseo interfaces][paseo-types] expose additional features;
its [manifest][paseo-manifest] also identifies static-mode discovery limitations.
**Impact/direction:** Clients cannot inspect every native capability or model modality. Extend
provider-owned discovery/profiles with explicit provenance and effective authority, rather than labels.
**Dependencies/security:** F02/F05; distinguish available native inventory from tools the managed
profile actually enables. A failed optional capability must not unnecessarily disable other modes.
**Minimum acceptance:** Added tools/models/metadata, removed required APIs, protocol changes,
known incompatibilities and cache/dispatch replacement yield bounded honest per-capability results.

### F18 — Further platform isolation research

**Priority:** P3. **Outside PR #107; stronger OS isolation requires a separate owner decision.**
**Current/evidence:** Job Objects own processes; Antigravity handles pin supported file identities;
Codex retains its sandbox. Explicit host commands are not confined. The AppContainer prototype
in [managed execution](managed-agent-execution.md) did not preserve Credential Manager access.
An independent controlled Windows check could add a new hardlink from another
same-user process after guard acquisition; a later guarded write affected both
names. Pre-existing hardlinks remain denied. This is evidence of the already
excluded arbitrary same-user-process threat model, not full filesystem isolation.
**Impact/direction:** Current approved-host authority trusts the user's command and does not
isolate an arbitrary malicious process running as that user. Research stronger optional boundaries
only against an explicit deployment/threat model.
**Dependencies/security:** Native auth, private MCP connectivity, resource grants, packaging,
crash cleanup and host-consent semantics; no silent fallback to broader authority.
**Minimum acceptance:** Positive controls and negative file/process/network tests, raced paths,
descendants, missing isolation support and credential access pass without copied personal secrets.

### F19 — Positive reconciliation for currently unknown execution

**Priority:** P1. **Outside PR #107; existing conservative recovery remains intentional.**
**Current/evidence:** Undispatched intents and exact durable settlement receipts can recover.
Possibly dispatched execution without authoritative outcome/settlement remains unknown.
**Impact/direction:** Some crashed Sessions stay blocked. Investigate provider-specific positive
evidence sufficient to reconcile the original invocation without sending its input again.
**Dependencies/security:** Original account/workspace/native context, Engine claim, process
ownership and native request correlation. PID absence, timeout or login success is insufficient.
**Minimum acceptance:** SIGKILL cuts, retained/missing history, account switches, repeated command
IDs and absent/contradictory evidence never release an uncertain writer or fabricate a result.

[paseo-types]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/server/src/server/agent/agent-sdk-types.ts
[paseo-provider]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/plugin/src/server/provider.ts
[paseo-config]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/protocol/src/provider-config.ts
[paseo-manifest]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/protocol/src/provider-manifest.ts
[paseo-claude]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/server/src/server/agent/providers/claude/agent.ts
[paseo-acp]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/server/src/server/agent/providers/generic-acp-agent.ts
[paseo-mcp]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/packages/server/src/server/agent/runtime-mcp-config.ts
[paseo-agy-catalog]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/plugins/antigravity-provider/server/internal/catalog.ts
[paseo-agy-process]: https://github.com/getpaseo/paseo/blob/ab8e1e61ff7c0bbad08c95e15a09f3ec42333410/plugins/antigravity-provider/server/internal/process.ts

## Historical migration checkpoints

This is the rest of the migration program, not part of Plan 04's mock acceptance. No history
import/backwards compatibility. IDs, lifecycle, storage and APIs are consumed unchanged from the
foundation; an adapter must not grow a second Session model.

The owner-approved closing scope of PR #98 is the independent Session foundation,
Engine-managed execution, Claude/Codex adapters, native modes and basic external
CLI sign-in/recheck. Antigravity execution, continuous credential renewal during
an active Turn, ConnectedConsistency stability and broader UX are separate
follow-ups. They do not block acceptance of the delivered Claude/Codex scope.

Current migration audit after integrating main `3c0967fa`: P4 now has an executable
Antigravity adapter in PR #107, including private MCP questions, permissions and
native continuation evidence. P5 product associations and the E3/E5 workflow/batch
integration remain separate work. See [the migration remainder and V10 backend
readiness audit](session-v10-backend-readiness.md) before treating historical
checkpoints below as the current implementation inventory.

## Work packages

Owner follow-up after architecture acceptance: read-only is a test stage, not the product default.
The product must offer supported native provider modes and default normal task work to an agent
capable of edits/tools. Native collaboration/permission modes and Engine effect scope are distinct
contracts; modes must not bypass durable writer admission. W1/W2 are now explicitly in the ongoing
PR scope before enabling writable execution. The UI change is limited to the requested mode choice;
the broader chat experience remains with the owner. The implemented boundary and native mode rules
are described in [managed agent execution](managed-agent-execution.md). The earlier quota-only live
checkpoint below is historical; subsequent edit/permission/resume acceptance is tracked separately.

All implementation packages use nevo-agents:implementer (backend), with independent review.
Exact legacy files are under D:/repos/git/nevo/tools/dashboard; inspected HEAD 10bded58.

| Package                    | Outcome / owner paths                                                                                                                                                          | Dependencies and proof                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 shared process boundary | Runtime Sessions provider process adapter: explicit env, redacted/bounded diagnostics, process-tree shutdown and temp/MCP lifecycle                                            | E4.T08; test Windows and Linux, partial start/abort/exit races; independent of Documents UI                                                                 |
| P2 Claude adapter          | Translate legacy providers/claude/provider.mjs, continuation-store and hook/MCP mechanisms into the fixed driver; preserve evidenced commentary, final, usage and interactions | P1; fixture tests then live installed-transport smoke; read-only only if actual tool restrictions are proven, otherwise dispatch stays unavailable until W2 |
| P3 Codex adapter           | Translate providers/codex/provider.mjs and app-server-client; versioned protocol fixtures, native thread identity/resume and model discovery                                   | P1; same conformance/live gate; P2 need not be merged if owners are disjoint, shared registry edits sequential                                              |
| P4 Antigravity adapter     | Translate providers/antigravity/provider.mjs and its MCP bridge; bounded parsing, honest output/error classification and model selection                                       | P1; same conformance/live gate, no inferred success from arbitrary prose                                                                                    |
| P5 product associations    | Runtime integration above Sessions: Spec/Task/document context, authorized associations/contributions, existing Session entry/return behavior                                  | E4.T08, accepted #95 UI base; Documents public API only, no required specId in core                                                                         |
| W1 managed effect contract | Engine public admission/claim/settlement operations for an ad-hoc writer even without Task, cross-process exclusion with D4/Create/Close                                       | Owner is Engine integration; must reuse current durable resource algebra, never add Runtime-only locks                                                      |
| W2 writable dispatch       | Runtime durable intent -> Engine claim -> provider correlation -> settlement; uncertain effects retain claim and block conflicting writer; no automatic workflow finish        | W1 + chosen real adapter; real crash-cut and competing process tests required                                                                               |

The delivered foundation, P1/P2/P3 and W1/W2 share one feature branch and PR #98.
The temporary P1 PR #99 is closed and its commits are included in #98. Remaining
packages are follow-up features rather than further expansion of #98. Do not
start provider writable work on the premise that E3/E5 plans already
expose implemented public APIs. W1 is a separately accepted shared capability and a real external
prerequisite, not a fake depends_on edge within Plan 04. Full Task workflow/batch remains E3/E5.

## Per-adapter acceptance

### Claude P2 implementation checkpoint

The feature branch now registers the Claude driver in production Runtime Sessions, alongside the
optional mock. It includes bounded full-message normalization, a bidirectional control reader/writer,
native question cancellation, cached discovery, verified workspace composition and durable private
native-context admission/resume. The current implementation covers:

- native Session correlation, distinct native event UUIDs versus shared assistant message IDs,
  duplicate detection, compound tool actions, commentary/reasoning/final separation and invocation-total
  usage; partial stream events are not requested or supported;
- backpressured canonical facts, 16 KiB UTF-8 chunks, 1 MiB native frames and pending assistant text,
  128 active tools, 4,096 retained event identities; unknown protocol/background/deferred work fails closed;
- structured interruption and failure, with private native error prose excluded from public errors;
- literal `client_composed: true` user frames, pure bounded AskUserQuestion mapping, multi-question
  answers and single/multiple selection checks. Read-only refuses writable tool permissions; managed
  writer profiles support bounded one-shot Edit/Write/Bash decisions. No permission suggestion or
  persistent permission update is forwarded;
- preserving an explicitly lost operation as unknown when its transport handle later resolves or rejects.

The observed Tested baseline is Windows Claude Code 2.1.296; compatible unlisted/newer builds run Provisional with
default personal Pro/Max file OAuth. Tested evidence covers read-only; new writable mode evidence is
Provisional. Runtime fingerprints the binary and checks managed
policy absence and credential-source eligibility before launch. Canonical question cardinality is
validated before durable response admission. Native identity is independently reserved and fenced by
workspace and account; uncertain dispatch never falls back to a new conversation.

On 2026-10-26 the real installed transport passed discovery and the production Runtime HTTP
create/start path. Claude returned the account's weekly quota error (HTTP 429), which is persisted as a
safe failed Turn with process cleanup and no disposable-workspace changes. Controlled real-process
HTTP integration proves questions, cancellation and continuation across Runtime restart. This was the
quota-limited checkpoint, not a statement about every subsequent acceptance run. Later manual
checks covered native edits, one-operation permissions, exact-turn semantic resume and foreground
command output; their results identify the tested implementation rather than inherit this baseline.
Live-account test-runner cases have been removed. Automated tests and CI use synthetic credentials
and controlled providers only. Further real-provider checks are short manual activities, outside
the test runner, under the [manual provider check policy](provider-manual-checks.md).

See [Claude provider implementation and acceptance](claude-provider.md) for enablement, exact
build-specific evidence, bounded operation ownership and remaining live gates. Compatible updates
do not require new hash records; see [the compatibility decision](provider-compatibility.md). Writable effects use the implemented W1/W2 boundary below;
the completed Claude/Codex scope stays in PR #98, while the remaining packages
follow the closing scope above.

Verification on implementation commit `aa6314b5`: 29 focused Windows tests passed;
independent re-review found no remaining concrete blocker in this normalization slice.
Linux build/typecheck and all 754 Runtime tests passed (96 files). Root `pnpm check:quality`
passed, including 231-document corpus/index validation. That was the normalization checkpoint;
the new integration evidence is recorded in the Claude provider document.

At task start capture exact executable/version and installed protocol/SDK schema as test evidence.
That is bounded adapter certification, not a deferred decision about canonical semantics.
If transport is missing, fixture work can proceed but live acceptance is pending, not PASS.

Each adapter proves:

- create/new native context and continuation in the same verified workspace; no unsafe missing-session
  fallback after possible dispatch, no cross-worktree resume from mock evidence;
- model/effort provenance, fresh capabilities and installation/auth/quota distinctions;
- commentary/reasoning/final/tool separation, compound ToolAction correlation, stable interaction
  mapping, duplicate/out-of-order handling and truthful unsupported operations;
- cancel and cleanup, unknown operation handling, partial-start rollback, process activity versus
  protocol silence and long-running tools, no replay of uncertain effects;
- usage sample basis and deduplication, bounded environment/diagnostics/output and backpressure;
- canonical reload/restart/tail/history through the production store and client, not a private
  provider transcript endpoint.

Characterize intentional changes from legacy instead of preserving known incorrect behavior.
Use the existing hardening dossier as migration evidence; promote implemented durable guarantees
into the relevant current architecture/reference after review, rather than making every idea normative.

## W1 contract to settle before W2

W1/W2 are implemented in the feature branch: Engine owns durable project-wide claims and checks
existing Create/Close reservations symmetrically. This does not claim integration with a future
Documents write/commit-queue branch. When those writers land, they must join the same admission
boundary before concurrent operation is enabled; a clean textual merge alone is insufficient.

Required public result: Engine verifies environment, inspects effect scope, admits a writer,
returns a durable claim correlated with Runtime invocation, and reconciles/releases it only from
positive settlement evidence. Both owners record enough evidence to recover a crash between claim
and dispatch intent. Unknown spawn blocks new writer; Runtime terminal state alone does not release.

Admission must cover document save/rename/classify/import/commit queue and Create/Close/rebind
against the same physical checkout/resources. Decide whether agent document changes use Engine
document operations or a separately accepted effect-adoption protocol; raw provider writes cannot
silently bypass revision/manifest/commit invariants. Until that contract is delivered, such writes
are refused. No UI decision or prompt can override the refusal.

## Conflict evidence and integration order

#95 affects Session demo operations/context, app composition, Documents APIs and DS. P5 rebases
on its accepted result and preserves document revision/path semantics and dirty-draft guards.
The separate documents-write-and-config branch affects claims and commit coalescing; W1 consumes
its accepted public boundary after inspection. Passing a Git merge is not proof of effect safety.
No plan here merges, changes or sends messages to those branches on the owner's behalf.
