---
id: architecture.runtime.specflow-engine
type: architecture
title: SpecFlow Engine ownership and transport boundaries
status: current
scope: specflow
areas: [runtime, cli, server]
read_when:
  - changing the Engine, CLI or HTTP integration boundary
  - assigning ownership of durable Specification operations
summary: >
  Implemented E1/E2 ownership of the offline Engine, Runtime HTTP transport and product
  CLI.
related:
  - architecture.runtime.ownership-and-lifecycle
  - architecture.runtime.specflow-project-home
  - architecture.runtime.specflow-lifecycle
---

# SpecFlow Engine ownership and transport boundaries

## Implemented E1/E2 boundary

`@nevo/specflow-engine` owns verified Project Home discovery, physical workspace identity,
local registry and binding authority, canonical Specification reads, durable Create/Close journals,
Git operations and recovery. It runs in a CLI process without starting Runtime, HTTP or an AI
provider. There is one Engine-owned state machine for mutations, not parallel HTTP/CLI copies.

`@nevo/specflow` supplies the installed Commander CLI and calls Engine operations.
`@nevo/specflow-runtime` composes authenticated HTTP endpoints and translates Engine results
into `@nevo/specflow-contracts` DTOs. HTTP performs authorization before protected reads or
mutations. Neither adapter may own independent Git/journal/registry mutation logic.

Runtime remains responsible for long-lived provider processes, streams and managed Sessions.
Engine-local Create/Close operation records are **not** provider Session/Turn execution records.
E1/E2 do not implement the proposed E3 Workflow Kernel, E4 Sessions Foundation or E5 managed
dispatch. See [Runtime ownership](ownership-and-lifecycle.md).

## Sources of authority

- Verified Project Home supplies local state and committed Git policy, never arbitrary caller cwd.
- Registered `specId -> workspaceId` binding selects the canonical Specification source.
- Verified checkout `specification.yaml` holds canonical metadata/status; generated indexes,
  branch naming and unregistered duplicate files are not alternative binding authority.
- Unavailable or physically mismatched bound sources fail closed, without primary/fixture fallback.
- Snapshot read projections are not reservations: write admission independently revalidates them.
- Engine coordination fences cooperating local processes; it does not assert arbitrary editors or
  Git processes are quiescent.

Implementation: `packages/specflow-engine/src/{project,specs,version-control}/`,
`packages/specflow-runtime/src/features/specs/`, and `packages/specflow/src/specs/command.ts`.

See [Project Home](project-home-and-workspaces.md), [Specification lifecycle](specification-lifecycle.md),
and the [implemented HTTP contracts](../../reference/api/specflow-specification-operations.md).
