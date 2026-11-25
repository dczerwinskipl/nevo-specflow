---
id: spec.agent-workflow-entry-points-and-portable-skill
type: change
title: 'Agent workflow entry points and portable skill'
status: draft
change: agent-workflow-entry-points-and-portable-skill
---

# Agent workflow entry points and portable skill

## Context

The source is the draft Idea `ideas.specflow-engine.agent-workflow-entrypoints` from PR #189 (Git ref
gh/pr189). Only that Idea is in scope. E6 (ADR 0026) has since delivered managed single-step execution
(Run with agent, broker, brief, `workflow context`, finish proposals, Confirm). The documents:
research.md (what exists), decisions.md (D1 to D10), behaviour.md (rules and acceptance A1 to A11),
skill.md (the portable skill), ux.md (Create form, transcript), backend.md (contracts C1 to C6),
architecture.md (solution design S1 to S9).

## Goal

A user can ask an agent to work on a Specification from three entry points. All three use the same
one-step execution contract and the same Engine operations:

1. **External agent with the portable skill.** An agent started outside Runtime (Claude Code or Codex
   in a terminal) loads one product-owned, versioned `nevo-specflow` skill. The skill teaches it to
   find the subject, inspect before acting, read the step context, edit documents and Tasks through
   the CLI, start and finish only when the user asks, and stop. Its actions are recorded as the local
   owner, and the skill says so.
2. **Create with an agent in project mode (L131).** The project Create form gets "With an agent". It
   creates the Specification, then starts Run with agent on the first agent step as a real E6 attempt,
   and lands in that Session. It never reports the Specification as prepared.
3. **Ad-hoc Session guidance.** Every ad-hoc write Turn of a Specification Session carries a compact
   SpecFlow brief, shown apart from the owner's message. The brief says what the Turn may do (D11b),
   that it cannot start or finish a step, and that the owner uses Run with agent.

The skill and the briefs say how to use SpecFlow. The Engine's step context says what to do now. The
bound archetype says how to do the work, and it never switches during an attempt.

## Non-goals

P103 (full preparation), L140 (external agent identity and claims), MCP or native extensions,
starter packs, orchestration, the NEvo migration, and the Now-block **Start workflow** wording (a
separate UI bug). Also out: automatic continuation or Task selection, batches, schedulers, parallel
worktrees, PR automation, changes to E6 rules, aligning the demo Create, and any change to the Create
request.

## Constraints

- The skill and the briefs MUST use the existing CLI and Engine operations. They MUST NOT define their
  own transitions, context assembly (E6 D13) or state.
- The external skill runs with the local OS user's authority. The skill and the README MUST show the
  trust statement (skill.md, Rules).
- The external skill MAY run `workflow start` and `workflow finish` only on the user's request in that
  conversation. It MUST ask before any result the context marks as an owner decision. This is
  instruction-only, and the skill MUST say so.
- The skill MUST find the project, subject and workspace through the CLI. It MUST NOT infer them from
  a folder name, the prompt or an earlier Session.
- The skill has one provider-neutral, versioned source in the CLI package, and the wrappers are
  generated from it. A provider file MUST NOT become authoritative over the Engine definitions.
- Managed Turns MUST NOT depend on native skills or MCP. When a provider cannot take the
  invocation-bound tools, the action MUST refuse explicitly and MUST NOT fall back to an ad-hoc chat.
- Create with an agent MUST reuse the E6 start route. It adds no second start path or identity.
- An agent never manufactures owner approval, and a completed chat Turn is never a workflow completion.

## Affected Areas

- Engine: owner-decision marks in the step context, the documents read for an ad-hoc brief, each
  archetype's `firstStep` in the catalogue, and the project-file install that commits the wrappers.
- CLI package: the skill source, `skill show` and `skill install`, `init`, the command table, packaging.
- Runtime: the ad-hoc brief, its delivery, its `brief` conversation entry and the Turn's `brief` fact,
  and the catalogue ETag.
- UI: the project Create method and agent fields, the chaining, and the transcript's SpecFlow brief
  part.
- Docs: Create, CLI reference, agent step execution (ad-hoc brief), README trust note, the L131 open
  item, roadmap coverage.

## Acceptance Criteria & Verification

A1 to A11 in behaviour.md, plus the UX acceptance in ux.md and the verification list in backend.md.
A5, A9 and A10 confirm delivered E6 behaviour with tests. The rest is new work.

Readiness: ready for breakdown. The owner decided every open contract (D5 to D10). The solution design
(architecture.md, S1 to S9) settles where the skill source sits (S1), how the Engine commits the
wrappers (S3, S4), and how a Turn carries `brief` (a `brief` conversation entry, S5 and S6).
