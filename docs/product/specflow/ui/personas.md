---
id: product.specflow.ui.personas
type: product
title: UI personas
status: draft
read_when:
  - designing a UI screen or surface
  - deciding whether a capability belongs in the UI or the CLI
summary: >
  Who uses the UI — the owner monitoring and steering work, and the reviewer
  checking a change — and what each needs from it. The UI observes and steers;
  it does not replace the CLI/PR workflow.
related:
  - product.specflow.ui.interaction-model
  - product.specflow.cli.personas
---

# UI personas

`status: draft`.

## 1. Repository owner (monitor & steer)

Opens the UI to see the state of active specifications at a glance, distinguish what
**requires attention** from what is merely **ready to start/continue**, drill into a
Task, inspect or interact with an AI Session, and take the deterministic owner action
available for the current workflow context.

Needs: an accurate overview without noise; one-click access from an attention signal
to the relevant context/evidence; live updates without manual refresh; worktree/branch
state visible when relevant; irreversible or state-changing actions behind an explicit
deliberate interaction.

## 2. Reviewer

Opens a change to understand what it does, read the spec against the implementation,
and inspect the attached pull request(s) and diffs. May not be the owner.

Needs: Specification/Task intent next to the evidence needed for review; clear
"what changed" summary; quick access to review artifacts, Handover, diffs, and linked
Sessions; read-only unless they are also the owner.

## Boundaries

- The UI is **not an authoritative owner of workflow/runtime state**. It may initiate supported
  actions and edit project files through shared application/filesystem contracts, but it must not
  maintain a second copy of authoritative state, bypass workflow gates, or replace the Git/PR
  source-of-truth flow.
- The UI may invoke deterministic workflow/agent operations through the same
  application contracts as other clients, but it MUST NOT bypass workflow gates,
  admission, or authoritative runtime state by maintaining a UI-only execution path.

> **Provisional:** the UI is intended to reflect the specification files and
> Git/PR state directly rather than own a separate datastore. Whether it is implemented
> exactly that way is a storage decision recorded in
> [`architecture/`](../../../architecture/), not asserted here.
