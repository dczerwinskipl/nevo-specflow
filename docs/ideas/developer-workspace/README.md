---
id: ideas.developer-workspace
type: hub
title: Developer workspace ideas
status: draft
scope: specflow
areas:
  - ui
  - server
  - runtime
tags:
  - code-editor
  - worktree
  - vscode
  - remote-development
read_when:
  - designing in-product code inspection or editing
  - adding remote access to the current worktree from a phone or another laptop
  - integrating a full IDE with Nevo without duplicating workspace ownership
summary: >
  Candidate design for a lightweight in-product code surface plus a separate VS Code-based full IDE,
  both operating on the same current worktree on the host running SpecFlow.
related:
  - ideas.readme
  - architecture.runtime.ownership-and-lifecycle
---

# Developer workspace ideas

## Goal

Let a human inspect and make small edits to the code an agent is changing without leaving the
SpecFlow session, while keeping a full IDE available when the task needs project navigation, source
control, extensions, or a terminal.

The package deliberately separates two interaction modes:

1. a compact code surface embedded in the SpecFlow UI;
2. a full VS Code-based IDE opened as a separate page or route.

Both modes target the same current worktree on the host running SpecFlow. The proposal does not
make either UI the owner of workspace identity or filesystem state.

## Current proposal

See [Code inspection, editing, and full IDE integration](code-inspection-and-editing.md).

## Status

The direction has an external proof of concept, but that PoC has not yet been user-tested. In
particular, mobile editor behavior, full-IDE provider choice, and non-TypeScript language support
still need validation before this becomes an implementation specification.
