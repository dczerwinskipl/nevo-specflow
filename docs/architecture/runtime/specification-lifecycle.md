---
id: architecture.runtime.specflow-lifecycle
type: architecture
title: Specification Create and Close lifecycle
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - distinguishing Specification Create, Specification Close and Worktree Close
  - locating Create recovery, Git integration and workspace disposal contracts
summary: >-
  Entry point to durable Specification Create, Specification Close, Worktree Close, Git integration, CAS rebind and interruption recovery.
related:
  - architecture.runtime.specification-create-lifecycle
  - architecture.runtime.specification-close-lifecycle
  - architecture.runtime.specification-worktree-integration
  - engineering.shared.specification-create-recovery
  - architecture.runtime.specification-documents
  - engineering.shared.specflow-git-recovery
  - reference.api.specflow-specification-operations
---

# Specification Create and Close lifecycle

The Engine owns durable admission, filesystem and Git effects, operation journals and workspace registry bindings. Runtime, CLI and UI expose the operations without maintaining competing lifecycle states.

Specification Close archives a selected Specification; Worktree Close may integrate and dispose an entire worktree; Workspace Close has its own binding and active-resource preconditions.

## Create and the three distinct Git choices

[Create admission and Git selection](specification-create-lifecycle.md) defines the starting checkout, `baseRef`, branch/worktree selection, journal retention, scaffold commits and the Git-disabled case. An interrupted Create requires [operator recovery](../../engineering/shared/specification-create-recovery.md), not automatic takeover after a timeout.

## Explicit Close intents

[Specification Close](specification-close-lifecycle.md) defines archive-only and integration intents, exit gates and Abandon; Git-disabled Close is archive-only. For physically integrating or disposing a workspace, see [Worktree Close](specification-worktree-integration.md).

## Safe integration, rebind and disposal

[Worktree integration and registry rebind](specification-worktree-integration.md) require physical Git proof, explicit conflict handling and compare-and-set binding updates. [Engine Git recovery](../../engineering/shared/specflow-git-recovery.md) defines durable mutation and process coordination.
