---
id: ideas.specflow-runtime.session-migration-evidence
type: reference
title: Managed Session migration evidence
status: draft
scope: specflow
areas: [ai, runtime, testing]
tags: [sessions, migration, characterization]
read_when:
  - checking preserved legacy behavior during Session implementation
summary: >
  Source evidence and characterization mapping for independent Session contracts.
related:
  - ideas.specflow-runtime.managed-sessions-delivery
  - reference.api.sessions
---

# Session migration evidence

Source checkout: D:/repos/git/nevo, inspected HEAD 10bded58. Paths below are relative to
tools/dashboard. Legacy is evidence; canonical SpecFlow rules and owner decisions take priority.

| Source                                                                      | Preserved scenario / target verification                                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| server/ai/model/canonical-turn.mjs; tests/ai-turn-runtime.test.mjs          | Ordered typed Work, separate final answer, terminal immutability; MS01/MS03/MS05                                                             |
| server/ai/sessions/turns/runtime.mjs                                        | One active invocation and logical-start retry; MS02. New admission/idempotency must survive terminal state and restart                       |
| server/ai/sessions/turns/turn-recovery.mjs; tests/turn-recovery.test.mjs    | Lost operation is unknown; process exit alone does not prove provider completion. Expire live-operation interaction after restart; MS04/MS09 |
| server/ai/sessions/turns/turn-event-stream.mjs                              | Monotonic Session sequence across Turns, snapshot/replay handoff; MS07                                                                       |
| tests/final-answer-lifecycle.test.mjs; tests/turn-work-correlation.test.mjs | Commentary/reasoning/final separation and compound ToolAction correlation; MS01/MS03                                                         |
| tests/session-readiness.test.mjs                                            | Pending dispatch retains retry key through navigation/remount; MS02/MS10                                                                     |
| server/ai/sessions/transcript-cache.mjs:getTranscript                       | Replace whole-file readFile/JSON.parse and cloned transcript with indexed tail/content reads; MS06                                           |

Intentional changes: application Session identity has no required Spec/Task, no legacy aliases or
history import, no giant Session service importing workflow internals. Late native correlation is
fenced by invocation/owner epoch. Runtime projections replace UI readiness heuristics. The initial
contract characterization is executable in contracts/sessions/model.test.ts; runtime race/recovery
fixtures belong with the new owning reducer/coordinator/store as they are implemented.

These are test obligations, not assertions that a legacy suite was executed or certifies SpecFlow.

## Implemented foundation

PR #98, branch `feature/managed-sessions-foundation`, implementation head `540c87a6`.
The implementation includes independent contracts; worker-owned SQLite; durable command
admission and event outbox; typed Work/ToolAction/content; question and permission continuation;
single-owner fencing and restart reconciliation; scoped HTTP/SSE; and an independent routed chat.
The configured mock is explicit and performs no external effects. No legacy history is imported.

Real Claude/Codex/Antigravity adapters, provider-specific process certification, writable Engine
admission and product associations are subsequent packages. Their absence is not a fallback to
fixture data. Independent code/UX review has not been performed; the Plan 04 review gate stays open.

## Executed verification (2026-10-25)

| Boundary                        | Result                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root `pnpm check:quality`       | PASS: formatting, repository lint, document index, generated agents and version transition                       |
| Linux builds/type checks        | PASS: product, Runtime and UI plus their build dependencies                                                      |
| Linux contracts package         | PASS: 188 tests                                                                                                  |
| Linux HTTP client package       | PASS: 26 tests                                                                                                   |
| Linux Runtime package           | PASS: 704 tests                                                                                                  |
| Linux UI package                | PASS: 1187 tests                                                                                                 |
| Linux product package           | PASS: 131 tests; one existing process-fixture entry intentionally skipped                                        |
| Windows installed-product smoke | PASS: real packed/installed executable, project bootstrap, SQLite worker, Session create/start/read and shutdown |
| Complete Storybook build        | PASS                                                                                                             |
| Tagged Storybook corpus         | PASS: 662 tests with `pnpm test:storybook -- --maxWorkers=2`; 45 files outside selected tags skipped             |
| Connected product UI            | PASS: create, send, reload and inspect Work at 1440, 900, 375 and 320 px                                         |
| Responsive pending question     | PASS: inspected at those widths, including a 667 px viewport height; composer stays reachable                    |
| `git diff --check`              | PASS                                                                                                             |

Linux verification uses `tools/dev/linux-test.sh` against committed `540c87a6`, Node 24.22.1,
Linux/WSL2 in Docker, six CPUs and a 10 GiB memory limit. The command is:

```sh
pnpm turbo run build typecheck --filter=@nevo/specflow --filter=@nevo/specflow-runtime --filter=@nevo/specflow-ui
pnpm --filter @nevo/specflow-contracts test
pnpm --filter @nevo/http-client test
pnpm --filter @nevo/specflow-runtime test
pnpm --filter @nevo/specflow-ui test
pnpm --filter @nevo/specflow test
```

The Windows browser/packaging checks use Node 24.20.0 and Playwright Chromium. Connected checks
use the built product UI and a real local Runtime with a supplied Session storage context. They
do not certify real provider transports or writable Spec/Task/Document integration.

One earlier full Storybook run failed during Vite dependency optimization; another reported two
existing Documents/Create story interaction failures under parallel load. The final full run with
two workers passed all 662 tests. No unrelated Documents/Create behavior was changed to make it pass.
An initial full Runtime run exposed eager Engine context access while Sessions were disabled;
the composition fix and final full Runtime run cover that regression.

## Bounded-history measurement

`test/sessions/history-performance.test.ts` seeds one huge content body, 10000 conversation rows
in a single Turn and an identical bounded tail. The huge body's preview is also in the visible
tail. It closes/reopens the Worker and collects 30 warm snapshots. Each response uses the indexed
conversation range, at most 40 entries plus lookahead and zero content-chunk bytes.

Recorded Windows host: AMD Ryzen 7 7800X3D, Node 24.20.0, NTFS system temporary directory.
Cold time includes Worker startup and reconciliation; warm time is snapshot RPC round-trip.

| Content | Cold open | Warm p95 | Response    | Rows read | Content bytes read | Maximum sampled process RSS |
| ------- | --------- | -------- | ----------- | --------- | ------------------ | --------------------------- |
| 1 MiB   | 64 ms     | 0.362 ms | 12257 bytes | 42        | 0                  | 98 MiB                      |
| 64 MiB  | 64 ms     | 0.297 ms | 12259 bytes | 42        | 0                  | 100 MiB                     |

RSS is sampled from the Vitest process including its Worker, not an isolated production memory
profile. Timings characterize this fixture and host; they are not an arbitrary-hardware SLA.
The deterministic test gates are response/row/byte budgets and indexed access.

## Acceptance evidence and review focus

| Scenarios | Implemented evidence                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MS01–MS02 | Store/coordinator tests: independent create, durable replay after terminal/reopen, conflicting payloads, concurrent admission and two-Turn cancellation isolation |
| MS03      | Invocation fencing and terminal immutability; old terminal callbacks ignored; Work cannot reopen; immutable published content prefixes                            |
| MS04      | Live question and permission round trips; response replay; stale IDs rejected; unknown/restarted execution expires its interaction                                |
| MS05      | Pure terminal arbitration, durable cancellation, child-process loss/restart and a failed ToolAction within a completed Turn                                       |
| MS06      | 1/64 MiB cold/warm fixture above; UTF-8 range boundaries; bounded history paging and stable cursor membership                                                     |
| MS07      | Snapshot-to-stream handoff over a real socket, duplicate/gap reducers, expired replay requiring resync, history/live merge and stale UI operation fencing         |
| MS08      | Scope checks, rejection of client Spec association fields, cross-actor cursor rejection and live stream closure after auth revocation                             |
| MS09      | Real competing process refusal, clean release/reopen, interrupted orphaned mock, conservative PID policy and rejection of foreign schema-zero databases           |
| MS10      | Tail/composer, partial-content expansion, pending question and history failure stories; real UI reload and responsive Work inspector                              |
| MS11      | Linux installed-artifact suite and Windows installed Runtime smoke both launch the bundled Worker                                                                 |
| MS12      | Explicit configuration and no-effect driver; Session core has no Engine/Specs/Tasks dependency                                                                    |

Provider-specific deadlines, transport loss distinctions and process-effect restrictions still
need certification when each real adapter is introduced. Backpressure uses a bounded outbox,
three-event batches, bounded socket queue and drain/disconnect handling; an adversarial network
load test has not been performed. Independent reviewers should inspect those policies and the
single-owner/store recovery implementation before promoting the draft architecture guarantees.

PR #95 was rechecked at `98c72898`: `git merge-tree --write-tree HEAD <documents-head>` merged
without conflicts on the implementation head. Shared server/services wiring, locales and generated
indexes must be rechecked if either head changes. This proves textual mergeability, not combined
runtime acceptance. Nothing from the documents PR is silently merged into this feature branch.
