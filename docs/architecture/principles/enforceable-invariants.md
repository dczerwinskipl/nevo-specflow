---
id: architecture.principles.enforceable-invariants
type: architecture
title: Enforceable invariants
status: current
read_when:
  - deciding whether a rule belongs in code, documentation, or an instruction
  - designing a workflow gate, lifecycle guard, or state transition
  - reviewing a rule that agents or users are expected to remember manually
summary: >
  Durable system invariants MUST be enforced deterministically by software whenever
  the system can observe and decide them. Prose explains the rule; it MUST NOT be the
  only mechanism protecting a machine-verifiable invariant.
related:
  - architecture.workflow.deterministic-workflow
  - architecture.runtime.ownership-and-lifecycle
  - engineering.shared.code-organization
  - architecture.principles.normative-language
---

# Enforceable invariants

A durable invariant that software can observe and decide **MUST be enforced by software**.

Documentation explains why an invariant exists and how it behaves. Instructions route humans and
agents toward the right operation. Neither MUST be the only protection for a condition the
product can verify deterministically.

## Rule

For machine-verifiable invariants, the enforcement path MUST use deterministic validation or
transition logic that produces explicit success or machine-readable failure:

```text
authoritative state
    ↓
deterministic validation / transition
    ↓
explicit success or machine-readable failure
```

over a prompt or README that merely says to remember a rule.

Examples include:

- one active non-terminal AI turn for a session;
- a workflow step cannot finish while a required gate is blocked;
- terminal state cannot transition back to active;
- work cannot silently escape an allowed scope;
- a transition result must match one declared branch;
- a durable operation must resume rather than duplicate already-completed effects.

## Prose still matters

Not every engineering judgment is machine-verifiable. Naming quality, readability, visual
hierarchy, or whether an abstraction is appropriate still require human or review judgment.

The distinction is:

- **observable invariant** → enforce it deterministically and document it;
- **judgment or intent** → document it and review it.

## Fail closed

When authoritative state is missing, contradictory, or cannot be validated safely, operations
that would mutate durable state fail closed.

The system MUST NOT convert "unknown" into "probably safe" merely to keep a workflow moving.

## One authoritative decision point

The same invariant MUST NOT be independently reimplemented by CLI, Runtime, UI, and agent
instructions. One authoritative application/domain operation MUST own the decision; external
surfaces MUST consume that result rather than reproduce the rule.
