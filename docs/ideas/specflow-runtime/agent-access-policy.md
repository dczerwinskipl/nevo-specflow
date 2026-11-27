---
id: ideas.agent-access-policy
type: product
title: Agent access policy separate from the provider mode
status: draft
scope: specflow
areas: [runtime, ai, security, ui]
tags: [agent, sessions, authorization, permissions, auto-mode, sandbox, roles]
read_when:
  - deciding who may run agent Sessions in provider Auto mode
  - confining agent writes or commands to the Specification worktree
  - adding roles or per-user limits to agent execution
summary: Proposed second axis next to the provider mode. An admin-assigned access policy ("Full access" or "Workspace only") that the user cannot change, enforced with the provider's native sandbox and deny rules where possible.
related:
  - adr.0026-agent-step-execution
---

# Agent access policy

**This is a proposal, not an implemented contract.** It records an owner idea from 2026-11-26 and is a candidate subject for a dogfood round.

## Why this exists

Since PR #169, provider Auto mode behaves the way it does in Claude Code. Claude's own classifier decides about ordinary tool use, and the owner is asked only when Claude would ask. See ADR 0026 D20, "What Auto hands to Claude". This is what the owner wants for themselves. It does mean an agent in Auto can do more than its step needs:

- it can write outside the worktree;
- it can run network commands;
- it can call the product CLI without the broker by dropping `NEVO_AGENT_*` or using `--project-root`.

These are fine for an admin who accepts the same risk as in Claude Code. They are not fine for every user.

## Idea: two independent axes

| Axis          | Who sets it                                           | Values                                                          | Decides                                                      |
| ------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Provider mode | the user, per Session or Turn                         | Plan, Manual, Accept edits, Auto (whatever the provider offers) | how often the provider asks before acting                    |
| Access policy | an admin, per user or role; the user cannot change it | **Full access**, **Workspace only**                             | where the agent may write and what it may run, in every mode |

- **Full access** means the provider's mode, unchanged. Auto works exactly as in Claude Code.
- **Workspace only** limits the agent in every mode, including Auto and Accept edits:
  - writes and edits are allowed only inside the Specification worktree, plus the scratch area;
  - no command can reach outside it;
  - the product CLI always goes through the broker.

## Owner principles

- **Don't reinvent the wheel.** Enforce "Workspace only" with the provider's native mechanisms: the Claude Code sandbox for filesystem and network, deny rules, managed settings. Don't build a SpecFlow classifier.
- **Explain before action.** A user without Full access sees it in the mode picker and the Session header, with one sentence explaining why, before sending anything.
- **The server enforces it.** The Runtime refuses to start a Turn whose settings exceed the user's policy.

## Open questions

- Does the Claude Code sandbox work on Windows hosts? The current Runtime runs on Windows. If not, what is the closest native equivalent, and what does "Workspace only" mean there?
- How does the policy map onto the authorization capabilities? Granular capabilities are preferred over a hard-coded admin check.
- Can a single Runtime-side check, made while an agent attempt is open, stop the "CLI without broker" bypass for every policy?
- Other providers: which native confinement do they offer?

## Status

Not planned yet. For now the owner, as admin, runs Full access Auto for testing.
