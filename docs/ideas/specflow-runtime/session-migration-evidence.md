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
