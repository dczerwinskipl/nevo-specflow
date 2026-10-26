---
id: ideas.specflow-runtime.provider-migration-plan
type: engineering
title: Real provider migration after the independent Session foundation
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, migration, claude, codex, antigravity]
read_when:
  - continuing migration after Plan 04
  - planning real provider parity and managed writer integration
summary: >
  Bounded follow-on deliveries for Claude, Codex and Antigravity against the fixed
  Session driver contract, with explicit Engine prerequisites for writable execution.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-engine.plan-05
  - ideas.specflow-runtime.managed-sessions-delivery
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.ai-adapters.migration-inspection-map
---

# Real provider migration

This is the rest of the migration program, not part of Plan 04's mock acceptance. No history
import/backwards compatibility. IDs, lifecycle, storage and APIs are consumed unchanged from the
foundation; an adapter must not grow a second Session model.

## Work packages

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

The owner requires one feature branch and one PR (#98) for this migration. The packages above
are implementation/review stages inside that PR, not separate pull requests. The temporary P1
PR #99 is closed and its commits are included in #98. Do not start provider writable work on the premise that E3/E5 plans already
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
  answers, single/multiple selection checks and refusal of all other permission requests; no permission
  suggestion or persistent permission update is forwarded;
- preserving an explicitly lost operation as unknown when its transport handle later resolves or rejects.

The observed Tested baseline is Windows Claude Code 2.1.296; compatible unlisted/newer builds run Provisional with
default personal Pro/Max file OAuth and read-only execution. Runtime fingerprints the binary and checks managed
policy absence and credential-source eligibility before launch. Canonical question cardinality is
validated before durable response admission. Native identity is independently reserved and fenced by
workspace and account; uncertain dispatch never falls back to a new conversation.

On 2026-10-26 the real installed transport passed discovery and the production Runtime HTTP
create/start path. Claude returned the account's weekly quota error (HTTP 429), which is persisted as a
safe failed Turn with process cleanup and no disposable-workspace changes. Controlled real-process
HTTP integration proves questions, cancellation and continuation across Runtime restart. Successful
live answers, native question round trips and semantic live resume remain pending behind that quota.

See [Claude provider implementation and acceptance](claude-provider.md) for enablement, exact
build-specific evidence, bounded operation ownership and remaining live gates. Compatible updates
do not require new hash records; see [the compatibility decision](provider-compatibility.md). Writable effects still require W1/W2 below;
all remaining work stays inside PR #98.

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
