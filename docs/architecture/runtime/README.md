---
id: docs.architecture-runtime-readme
type: hub
title: Runtime architecture
status: current
summary: >
  Entry point for Nevo SpecFlow Runtime ownership, composition, lifecycle, recovery,
  and transport-boundary architecture.
---

# Runtime architecture

The **Nevo SpecFlow Runtime** is the long-lived local application backend.

- [Ownership and lifecycle](ownership-and-lifecycle.md)
- [Project configuration and local state](configuration.md)
- [Authentication and authorization](auth/)

AI-specific runtime semantics live under [AI architecture](../ai/). Deterministic workflow
semantics live under [workflow architecture](../workflow/).

## Engine

- [Engine ownership and transport boundaries](specflow-engine.md)
- [Project Home and registered workspaces](project-home-and-workspaces.md)
- [Specification Create/Close lifecycle](specification-lifecycle.md)
  - [Create admission and Git selection](specification-create-lifecycle.md)
  - [Specification Close archive](specification-close-lifecycle.md)
  - [Worktree integration and rebind](specification-worktree-integration.md)
- [Specification documents](specification-documents.md)
  - [Manifest, registry and validation](document-manifest-and-registry.md)
  - [Archetypes and definitions](document-definitions.md)
  - [Document limits](document-limits.md)
  - [Write journal and commit queue](document-write-and-commit-queue.md)
  - [Commit policy and workflow-state writes](document-commit-policy.md)
- [Workspace execution claims](workspace-execution-claims.md)

## Runtime reads and policy

- [Task read composition](task-read-composition.md)
- [Endpoint policy](endpoint-policy.md)
