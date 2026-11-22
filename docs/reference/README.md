---
id: docs.reference-readme
type: hub
title: Reference documentation
status: current
summary: >
  Exact contracts and factual lookup material such as public CLI, API, protocol, and
  configuration contracts.
---

# Reference documentation

## Runtime HTTP API

The complete, machine-readable Runtime contract is
[OpenAPI 3.1](api/openapi.generated.json). The
[OpenAPI guide](api/openapi.md) explains the served document, authentication,
viewers and regeneration. Operations are grouped by resource in the schema.

Choose the resource first:

| What you need                                          | API entry point                                              |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Login, session cookie and OIDC | [OpenAPI authentication operations](api/openapi.md) |
| Check caller capabilities and access scopes | [Authorization](api/authorization.md) |
| Create or close a Specification, worktree or workspace | [Create and Close](api/specflow-specification-operations.md) |
| Browse active and archived Specifications              | [Overview](api/specs-overview.md)                            |
| Read one Specification's combined workspace view       | [Specification Workspace](api/specification-workspace.md)    |
| List workspaces and availability                       | [Workspaces](api/workspaces.md)                              |
| Read, write or commit Specification and Task documents | [Documents](api/specification-documents.md)                  |
| List, inspect, create or edit Tasks                    | [Tasks](api/task-reads.md)                                   |
| Start, finish, return or abandon workflow steps        | [Workflow](api/specification-workflow.md)                    |
| Create, manage or stream Sessions and Turns            | [Sessions](api/sessions.md)                                  |
| Read costs, tokens, limits or context telemetry        | [Session telemetry](api/session-telemetry.md)                |
| Follow asynchronous Create progress                    | [Operation progress (SSE)](api/operation-progress.md)        |
| List recent Specification operations                   | [Specification operations](api/specs-operations-list.md)     |
| Read or search documentation from a workspace          | [Workspace documentation](api/workspace-docs.md)             |

The demo Runtime exposes additional in-memory creation endpoints; their current
behavior is documented in [Demo creation API](api/specification-creation-demo.md).
It does not imply that a physical Git checkout or native provider was started.

## Other contracts

- [SpecFlow CLI](cli/nevo-specflow-contract.md)
- [Offline Specification CLI commands](cli/specflow-specification-commands.md)
- [Authorization configuration](configuration/authorization.md)
- [Git and worktree configuration](configuration/specflow-git-worktrees.md)
- [Documentation and embeddings configuration](configuration/documentation-and-embeddings.md)
- [Session provider driver protocol](protocols/session-provider-driver.md)
- [Session provider compatibility](providers/README.md)
