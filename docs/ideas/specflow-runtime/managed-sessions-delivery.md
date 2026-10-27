---
id: ideas.specflow-runtime.managed-sessions-delivery
type: product
title: Managed Sessions migration delivery specification
status: draft
scope: specflow
areas: [ai, runtime, ui, security, testing]
tags: [sessions, migration, tail, history, implementation]
read_when:
  - implementing the managed Session migration
  - checking scope and acceptance of Plan 04
summary: >
  Decision-complete foundation scope for independent Sessions with durable lifecycle,
  bounded tail/history and streaming, plus explicit real-provider and Engine dependencies.
related:
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.provider-migration-plan
---

# Managed Sessions migration delivery

## Owner decisions and goal

Port useful legacy Session/Turn/Work behavior with hardening. No history import or backwards
compatibility. Session is independent; Spec/Task/workflow links are integrations above the core.
Opening a chat starts at its tail without reading a multi-megabyte transcript on client or server.
These decisions replace the earlier assumption that every Session requires a Specification.

This document owns acceptance and scope. Exact technical behavior is in the linked architecture
and references. Plan 04 owns decomposition. All are tracked files, not a private work/ report.
Preparation is complete for the foundation; implementation and independent review have not occurred.

## First independently deliverable result

An authorized user creates an explicitly labelled mock Session without a Spec or Task, opens
the routed chat, starts multiple Turns, sees commentary/answer/current activity, inspects Work,
answers questions/permissions, cancels, reloads and restarts with equivalent durable state.
The mock has no filesystem/process tool effects. It runs through production storage/application/
HTTP boundaries, not demo data or a special Storybook-only path.

The mock is explicit test capability. This result proves the reusable foundation, not completion
of the whole migration. The real-provider delivery plan remains part of the migration program.

## Existing capability and evidence

Inspected base: origin/main 4d51e12a09e5bfd19f4ea9f254931c1cd2c6c663 (2026-10-25).
Runtime Sessions registers authorization capabilities; contracts/sessions exports those capabilities;
demo Sessions allocates limited UI records. There is no production managed Turn service.
Engine supplies Project Home, registered workspace/spec discovery and Create/Close; E3 workflow
and E5 managed dispatch remain future work. Dependencies do not become available from a plan name.

Legacy checkout D:/repos/git/nevo, inspected HEAD 10bded58, supplies migration evidence:

| Source under tools/dashboard                                     | Disposition / preserved behavior                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| server/ai/model/*.mjs                                            | Port canonical ordering, status, final answer and Work semantics into typed reducer/contracts    |
| server/ai/sessions/turns/{runtime,coordinator,turn-recovery}.mjs | Refactor start/interact/cancel/reconcile with durable admission and invocation fencing           |
| server/ai/sessions/{binding-service,transcript-cache}.mjs        | Replace storage, remove aliases and full JSON reads; preserve readable history/recovery outcomes |
| server/ai/sessions/turns/turn-event-stream.mjs                   | Refactor monotonic Session sequence, replay and snapshot resync                                  |
| server/ai/sessions/service.mjs                                   | Split responsibilities; do not copy workflow/repository orchestration into Session core          |
| server/ai/providers/** and interactions/mcp/**                   | Port per transport after foundation, applying hardening and capability certification             |
| ui/features/agent-sessions/**                                    | Adapt observable chat/composer/reconnect/inspection behavior to current DS                       |

Mining tests is part of implementation, not completed proof: ai-turn-runtime, turn-recovery,
turn-event-stream, final-answer-lifecycle, session-readiness, cross-provider-conformance and
each provider's tests. Legacy classifications and known workarounds are not normative target policy.

## User-visible behavior

- Session create is independent of Spec/Task IDs. The core stores no required product association.
- Default entry shows the latest conversation window, current state and valid pending interaction.
  Composer becomes usable from that small snapshot. A large active Turn does not force full hydration.
- Scroll up fetches older pages; preserve the visible anchor. Failure/retry of history leaves the
  current conversation usable. New activity does not yank a user away from the history they read.
- Explicit return-to-latest catches up through bounded tail and stream. Do not auto-download all pages.
- Large text is visibly partial and expandable through bounded content reads. Work/ToolAction details
  load on explicit inspection. Reasoning is not relabelled commentary.
- Pending interactions are first-class, capability-driven and become unanswerable when their live
  operation disappears. Duplicate responses cannot unblock a different Turn.
- Show unavailable/unknown, failure, cancellation and interruption honestly. Connection loss is UI
  transport state, not canonical Turn failure.
- Composer draft survives route changes/reload in the current browser, keyed by sessionId. Clear it
  only after accepted dispatch or explicit discard; retry uses the same requestId.

## Foundation scope boundaries

Include contracts, worker SQLite, singleton owner/recovery, mock driver, coordinator, HTTP/SSE,
bounded history/content/Work reads, production wiring and minimal routed Full Session UI.
Use /sessions/:sessionId as independent product route; no global Session dashboard is required.
T07 supplies a small labelled mock-session launcher at /sessions/new while mock is configured.
This test entry is not a project management redesign or a new navigation hierarchy.

Exclude real provider launch, external-agent attach/import, Session deletion, cross-project move,
multi-host stores, automatic native session rotation, full Floating Session and new workflow actions.
Writable real dispatch requires Engine admission; a prompt saying read-only does not waive it.
Read-only real adapters may ship after certification of technical effect restrictions.

Product configuration is the committed top-level sessions namespace, owned by this feature:
{ enabled: boolean, providers: { mock: { enabled: boolean } } } with false defaults for both flags.
Reject unknown keys and local overrides in this foundation. Composition supplies verified Project
Home and access policy; provider credentials/configuration are later adapter-owned contributions.
When disabled, no Session database owner is acquired; Session APIs return SESSION_DISABLED.
When enabled without a usable provider, reads remain possible and create/start reject unavailable.
Do not fabricate a provider from demo configuration. Effective configuration appears in Runtime
dependency composition; no root command or Auth module reimplements Session policy.

## Documents and parallel delivery

[PR #95](https://github.com/dczerwinskipl/nevo-specflow/pull/95) was open at preparation,
head 98c72898a6047d6533c3365876628adbbe978276. It changes demo ownership/composition,
SessionContextPanel, Documents read models and shared UI. The separate local write-and-config
branch was at 274f93ef. These are inspected snapshots, not promises of mergeability.

Foundation backend has no dependency on #95 or D4. T07 adds an independent route and client,
leaving existing spec demo routes intact; shared app/router/services edits have one sequential
owner. Before T07, compare current main with #95 for those files and preserve accepted DS changes.
The task is executable on this pinned main; do not wait for an unspecified future document API.

Later product association uses existing Documents API (documentId/path/revision), not a copied
transcript-owned document list. Dirty-draft guards and Session → Document → Back remain product
integration acceptance. No Session store or provider may commit document changes by bypassing
Engine. D4 admission/commit concurrency is an explicit external prerequisite for writable delivery.

## Acceptance scenarios

| ID   | Observable proof                                                                                                                                       | Owning task     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| MS01 | Independent Session create, two Turns, reload/restart preserve identity and settled chronology                                                         | T03/T05/T06/T08 |
| MS02 | Concurrent different starts dispatch once; same request retries return the original result after terminal/restart                                      | T03/T05/T08     |
| MS03 | Late native ID, text/tool output and terminal callbacks cannot change terminal/replaced invocation                                                     | T04/T05/T08     |
| MS04 | Question/permission response works once; wrong Session/Turn, stale response and lost live operation cannot unblock execution                           | T05/T06/T08     |
| MS05 | Cancel, timeout, process loss and completion yield one truthful outcome; failure of one tool does not imply Turn failure                               | T05/T08         |
| MS06 | Tail, old pages and content reads are bounded for 64 MiB history and one huge Turn/message, including cold store restart                               | T03/T06/T08     |
| MS07 | Replay duplicates, pruned cursor, concurrent history/live and stale page responses preserve order, revisions and completeness                          | T06/T07/T08     |
| MS08 | Existing scoped roles protect create/view/manage/content/events; no client spec/subject parameter widens access                                        | T06/T08         |
| MS09 | Second Runtime cannot acquire same store; uncertain PID never permits takeover; shutdown/restart recover active state without scanning settled content | T03/T05/T08     |
| MS10 | UI shows tail, usable composer, partial text, current activity, Work and interactions; older-page error preserves usable chat/scroll anchor            | T07/T08         |
| MS11 | Installed artifact opens SQLite worker and survives start/close on supported Node/Windows/Linux                                                        | T03/T08         |
| MS12 | Mock is explicit and cannot write files; Engine/Specs/Tasks are absent from Session core imports                                                       | T04/T08         |

MS06 hard gates: initial response <=256 KiB UTF-8 JSON; <=40 conversation rows plus one lookahead;
zero full-content reads on bootstrap; indexed range access, no Session-wide scan/count/fold;
no automatic older-page prefetch. Repeat with 1 MiB and 64 MiB history and same tail.
Record cold/warm timings and peak memory on Node 24.20+, OS/CPU/storage; target p95 <=1 second
for the API snapshot over 30 samples on the recorded development host, excluding Runtime boot,
schema migration and auth login. Timing is a reported performance gate, not a flaky unit assertion
or a guarantee on arbitrary hardware. Explain a miss before accepting the delivery.

## Readiness and subsequent delivery

No unresolved product/storage/auth/API decisions block T01–T08 in Plan 04. T01 is bounded
characterization, T02 schema realization, not another round of choosing architecture.
Actual execution follows task dependencies and review gates. Executed foundation checks are
recorded separately in `ideas.specflow-runtime.session-migration-evidence`; independent review
is still required before promoting draft guarantees.
Full provider parity follows the linked provider migration plan. Writable execution waits for
the explicit Engine integration contract and proof; it is not folded silently into foundation.
