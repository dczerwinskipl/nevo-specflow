---
id: ideas.specflow-runtime.provider-migration-plan
type: engineering
title: Provider capability backlog
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, backlog, claude, codex, antigravity]
read_when:
  - planning a new provider capability or parity follow-up
  - checking whether a provider limitation is intentional or deferred
summary: >
  Consolidated backlog of future provider capabilities (F01-F19) with current evidence,
  direction, security dependencies and minimum acceptance. Implemented behavior lives in the
  driver protocol and provider references.
related:
  - reference.protocols.session-provider-driver
  - docs.reference-providers-readme
  - reference.api.session-telemetry
  - ideas.specflow-engine.plan-05
---

# Provider capability backlog

## Current scope and capability backlog ownership

This document owns the **consolidated future provider-integration backlog**. Implemented behavior
is owned by [the driver protocol](../../reference/protocols/session-provider-driver.md), the
[provider references](../../reference/providers/README.md), [Sessions API](../../reference/api/sessions.md)
and [telemetry API](../../reference/api/session-telemetry.md).
[V10 readiness](session-v10-backend-readiness.md) separately owns product association and
frontend/backend integration gaps. This backlog introduces no current API guarantee.

Priority is suggested ordering. Each item needs its own bounded design, implementation and review.
No adapter may enable an item by accepting arbitrary configuration keys, native tools or protocol
frames.

### Decisions carried forward

- Sessions remain independent of Workflow execution; associations are context, not authority.
- Automatic operations remain workspace-confined. Every unconfined command needs exact, once-only
  host approval with its starting directory and outside-workspace warning.
- Native modes, Engine admission and execution authority remain distinct. Codex continues denying
  host escalation. AppContainer and in-flight auth brokers are not approved.
- Compatible ordinary CLI updates do not require known hashes, certification updates or a Nevo
  release. Current protocol/execution prerequisites still apply.
- Automated verification uses controlled programs and synthetic credentials, never paid inference
  or personal subscriptions. Native manual evidence is labelled separately.
- Richer interaction handling does not silently remove the current MCP single-selection limit.
- Another tool's choices (for example unattended `--dangerously-skip-permissions` launches or
  arbitrary provider option/environment passthrough) are evidence of integration options, not
  authority for SpecFlow security or lifecycle.

### F01 — Native MCP, skills and plugins

**Priority:** P2.
**Current/evidence:** Claude disables external MCP/hooks; Codex disables configured MCP/skills;
Antigravity gets only its invocation-private `ask_user` and `specflow-discovery` servers. Paseo exposes configured
extensions through [Claude options][paseo-claude] and [runtime MCP][paseo-mcp].
**Impact/direction:** Users cannot reuse their native extensions. Design explicit trusted
sources and provider-owned extension capabilities without enabling them globally.
**Dependencies/security:** Configuration provenance, executable/environment policy, per-profile
identity, permission routing and teardown must be decided first; an MCP server is executable code.
**Minimum acceptance:** Allowed/denied sources, hook/tool inventory changes, lost callbacks,
cross-Session isolation, cancellation/restart and secret redaction all have controlled tests.

### F02 — Configurable tool inventory

**Priority:** P2.
**Current/evidence:** `claude/modes.ts`, `codex/connection.ts` and Antigravity permission schemas
admit fixed supported tool/policy profiles. [Paseo configuration][paseo-config] offers tool overrides.
**Impact/direction:** Users cannot add a native tool merely because the CLI has it. Design a
provider-specific, validated policy tied to supported handlers and effective execution authority.
**Dependencies/security:** F01 where extensions add tools; unknown tools never acquire blanket
approval and metadata cannot override sandbox/host-consent policy.
**Minimum acceptance:** Effective inventory is observed, unsupported combinations explain why,
and tool additions cannot broaden an existing approval or resume authority.

### F03 — Active-Turn steering

**Priority:** P2. **Owner decision required on canonical input semantics.**
**Current/evidence:** Start admits one active Turn and does not add input to it.
Paseo has `steerActiveTurn(prompt, {expectedTurnId})` in [its interfaces][paseo-types].
**Impact/direction:** A user currently cancels/waits before changing instructions. Define whether
steering is additional canonical input within the same Turn, with immutable request identity.
**Dependencies/security:** Durable dispatch/acknowledgement, writer claim ownership, question
interaction ordering and unsupported native transports must be settled without a second lifecycle.
**Minimum acceptance:** Lost ACK, duplicate input, superseded Turn, cancel/terminal races and
restart never steer another invocation or replay an uncertain instruction.

### F04 — Native slash commands

**Priority:** P2.
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

**Priority:** P2.
**Current/evidence:** Sessions accepts explicit mode/model/effort fields and closed configuration.
[Paseo provider options][paseo-config] demonstrate a broader provider-owned settings surface.
**Impact/direction:** Useful native settings cannot be configured. Define typed, versioned
provider-owned settings, separating Session defaults from next-Turn overrides.
**Dependencies/security:** F17 discovery, secret resolution and account/profile affinity.
No unvalidated arbitrary object, command-line arguments or environment map enters core Session.
**Minimum acceptance:** Unsupported keys fail honestly; settings changes invalidate discovery
and cannot change an admitted invocation, authentication source or effective authority.

### F06 — ACP support

**Priority:** P3. **Separate provider/transport decision required.**
**Current/evidence:** SpecFlow implements Claude control, Codex JSON-RPC and Antigravity native
stream/MCP. Paseo has a [generic ACP adapter][paseo-acp] in addition to native adapters.
**Impact/direction:** ACP-compatible agents cannot use the current driver. Design a bounded ACP
adapter against the existing canonical driver, not a parallel Session model or dynamic code loader.
**Dependencies/security:** Capability/permission mapping, native history identity, process ownership,
filesystem authority, authentication and protocol-version handling are prerequisites.
**Minimum acceptance:** Driver conformance, supported capability negotiation, interactions,
cancellation, unknown recovery and cross-Session isolation use controlled ACP fixtures.

### F07 — Custom provider profiles

**Priority:** P2. **Owner decision required on profile identity and selection.**
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

**Priority:** P1.
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

**Priority:** P1. **No Runtime credential broker is approved.**
**Current/evidence:** External CLI sign-in/recheck, account/credential generation fencing and
bounded auth-required outcomes exist. Coordinated renewal inside a long active Turn does not.
**Impact/direction:** An expired active invocation may fail or remain uncertain. Investigate
native supported pause/recheck/continuation mechanisms while leaving token refresh with the CLI.
**Dependencies/security:** Native evidence of dispatch/consumption, account affinity, cancellation
and generation ordering. Successful re-login is never permission to resend possibly executed input.
**Minimum acceptance:** Rotation, account switch, old late auth errors, cancelled login/recheck,
multiple Sessions and restart preserve original context and prevent duplicate execution.

### F10 — Attachments and modalities

**Priority:** P2. **Separate media ownership/input contract required.**
**Current/evidence:** StartTurn carries text. Model descriptors do not certify image/file input.
Paseo's [prompt types][paseo-types] include images and typed attachments.
**Impact/direction:** Files/images cannot be sent as native model input. Define authorized stable
references, supported model modalities, bounded upload/read behavior and expiry.
**Dependencies/security:** Content storage ownership, size limits, private path protection, cleanup,
provider-specific input validation and native model discovery; no model-name heuristics.
**Minimum acceptance:** Unsupported modalities are explicitly rejected, not silently dropped;
identity changes, replay, access revocation and cancellation preserve exact input semantics.

### F11 — Optional native Session import

**Priority:** P3. **Owner explicitly excluded historical import from this migration.**
**Current/evidence:** Runtime resumes contexts it admitted itself, not arbitrary external chats.
Paseo has native listing/import in [Claude][paseo-claude] and persistence handles in [its types][paseo-types].
**Impact/direction:** Existing CLI chats cannot be adopted. Any future opt-in import must define
identity, history fidelity, read-only inspection versus writable adoption and provenance.
**Dependencies/security:** Account/workspace affinity, bounded history/content loading, dedupe,
secret handling and unknown execution. Import is not backward compatibility by default.
**Minimum acceptance:** Repeated import is idempotent; no cross-account/context substitution,
unbounded transcript load, fabricated Turn result or unsafe missing-history fallback occurs.

### F12 — Streaming improvements

**Priority:** P2.
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

**Priority:** P2.
**Current/evidence:** Claude/Codex map supported native question groups; canonical interactions
separate admission from transport delivery. Antigravity MCP intentionally admits at most one selected option.
**Impact/direction:** Additional native question/selection/permission types are unavailable.
Design each type with complete client behavior and immutable response semantics before enabling it.
**Dependencies/security:** Frontend capability support, ordering/cardinality, delivery receipts,
expiry, account/Session isolation and exact one-shot host consent. No implicit selection fallback.
**Minimum acceptance:** Grouped questions, duplicate/lost replies, invalid cardinality, disconnect,
cancel/restart and unsupported clients cannot leave a falsely answered or unfinishable interaction.

### F15 — Antigravity effort discovery

**Priority:** P2.
**Current/evidence:** The Antigravity adapter discovers models but advertises no effort values without native
evidence. Paseo's [catalogue][paseo-agy-catalog] likewise has no separate thinking options; its
statement about model IDs is not an independent native effort-negotiation contract.
**Impact/direction:** Users select native model variants but cannot set a separately certified
effort. Investigate actual CLI catalogue/schema support and per-model availability.
**Dependencies/security:** F17 and compatibility profiles; no values inferred from names and no
arbitrary `--effort` forwarding.
**Minimum acceptance:** Supported values round-trip, unsupported combinations fail before dispatch,
and catalogue/model changes invalidate stale choices without blocking unrelated supported modes.

### F16 — Telemetry coverage and provenance

**Priority:** P2.
**Current/evidence:** The [telemetry API](../../reference/api/session-telemetry.md) documents exact
current source coverage. Unqualified Antigravity cost, missing context breakdowns and unproven
limit-bucket meanings remain unavailable; API-equivalent cost is not subscription billing.
**Impact/direction:** Some UI gauges cannot be populated. Add source-evidenced metrics, safe
bucket classification, per-window freshness or pricing provenance only through the same ledger.
**Dependencies/security:** Currency/precision/overlap, baseline coverage, account/model/context
fences and dedicated limit authorization. No transcript estimates or second aggregation store.
**Minimum acceptance:** Missing samples, compaction, account switches, Worker restart, stale
values, 304/SSE and terminal publication never fabricate zeros, dollars or complete coverage.
**Open verification:** safe classification of Codex account-limit buckets before they are labelled;
full 32-reader plus concurrent-write latency measurement of the telemetry read path; installed
native Credential Manager acceptance for limit refresh.

### F17 — Provider feature discovery

**Priority:** P2.
**Current/evidence:** Descriptors currently expose bounded native modes/models/efforts, readiness
and supported driver capabilities. [Paseo interfaces][paseo-types] expose additional features;
its [manifest][paseo-manifest] also identifies static-mode discovery limitations.
**Impact/direction:** Clients cannot inspect every native capability or model modality. Extend
provider-owned discovery/profiles with explicit provenance and effective authority, rather than labels.
Model descriptors currently carry only `{modelId, title, efforts}`. Candidate additions:

- a per-model **default effort** for display, while "provider default" stays an omitted override
  (never serialize the current default as an explicit choice, or a provider default change cannot
  take effect);
- **per-field provenance**: an ID-only listing is authoritative for ID/label but no evidence for
  effort traits; traits without evidence are `unknown`, never inferred from model names or a global
  `--effort` flag; a manual/unlisted model is opaque pass-through with unknown traits;
- **modality and context-capacity traits** (image/file input, context window) only with trustworthy
  adapter provenance; a trait alone is not an upload implementation (F10).
  Optional model discovery failing must not mark a provider logged out or delete safe fallbacks.
  **Dependencies/security:** F02/F05; distinguish available native inventory from tools the managed
  profile actually enables. A failed optional capability must not unnecessarily disable other modes.
  **Minimum acceptance:** Added tools/models/metadata, removed required APIs, protocol changes,
  known incompatibilities and cache/dispatch replacement yield bounded honest per-capability results.

### F18 — Further platform isolation research

**Priority:** P3. **Stronger OS isolation requires a separate owner decision.**
**Current/evidence:** Job Objects own processes; Antigravity handles pin supported file identities;
Codex retains its sandbox. Explicit host commands are not confined. A disposable AppContainer
prototype allowed a write in a directory granted to its package SID and refused an outside write
(`EPERM`), but `CredReadW` inside it returned `ERROR_ACCESS_DENIED` for a synthetic Credential
Manager entry, so the consumer-keyring login path cannot be assumed to work there. Any integration
must settle isolated-identity authentication and refresh, loopback MCP reachability, executable and
dependency access, a launcher joining the Runtime-owned Job Object before dispatch, and owned access
grants with crash recovery and revocation; product setup privileges are an open deployment decision.
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

**Priority:** P1. **Existing conservative recovery remains intentional.**
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
