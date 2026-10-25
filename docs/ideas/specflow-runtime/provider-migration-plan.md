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

The feature branch contains the bounded full-message protocol translator and pure request mapping
under Runtime Sessions `providers/claude/`. These are internal adapter components, **not a registered
production driver**. They do not spawn Claude or advertise availability. The current checkpoint covers:

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

Read-only local inspection on 2026-10-25 found Claude Code 2.1.296 and existing `claude.ai` login.
A no-prompt control initialization returned model/effort descriptors using the shared process boundary.
This proves initialization only: no model response, tool restrictions, native question round trip, resume
or malicious-input live acceptance is claimed. Normalization tests use synthetic protocol fixtures,
cross-checked against legacy Nevo and the [official SDK protocol implementation](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py).
Requiring an outer assistant UUID is the translator's supported subset; the SDK also represents
messages without UUIDs, so installed-version live evidence is still required.

Production dispatch remains gated. In particular, the inspected `--safe-mode` and `--restricted`
flags preserve managed policy: the [official CLI reference](https://code.claude.com/docs/en/cli-reference)
documents executable policy customizations that remain active. A tool allowlist and a post-start
inventory do not prevent a startup hook from already running. Inspect effective managed policy before
launch, or use an independently enforced execution boundary; do not claim workspace read-only safety
from these flags alone. Preserve the existing CLI login path: `--bare` excludes OAuth authentication.

Remaining P2 work includes the live control reader/writer and cancellation of pending questions,
canonical response-cardinality validation before durable response admission, policy/version/tool
inventory certification, asynchronous cached discovery and provider registry, trusted workspace
composition, durable private native-context admission/resume and end-to-end installed transport tests.
These steps remain inside PR #98. Writable effects still require W1/W2 below.

Verification on implementation commit `aa6314b5`: 29 focused Windows tests passed;
independent re-review found no remaining concrete blocker in this normalization slice.
Linux build/typecheck and all 754 Runtime tests passed (96 files). Root `pnpm check:quality`
passed, including 231-document corpus/index validation. These results do not close the remaining
live-adapter gates above.

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
