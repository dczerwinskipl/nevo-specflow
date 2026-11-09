---
id: architecture.overview
type: architecture
title: Architecture overview
status: current
scope: specflow
areas:
  - runtime
  - ai
  - workflow
  - ui
  - cli
read_when:
  - orienting in the codebase before working across package or process boundaries
  - explaining which SpecFlow component talks to which, and over what transport
  - deciding which package or authoritative document owns a concern
summary: >
  Derived, diagram-first map of Nevo SpecFlow: processes and transports, package dependency
  direction, Runtime feature composition, where state lives, and the managed Session Turn flow.
  Every diagram links the authoritative document that owns its facts; on conflict those
  documents win.
related:
  - adr.0012-product-package-topology-and-dependency-direction
  - architecture.runtime.ownership-and-lifecycle
  - architecture.runtime.specflow-engine
  - architecture.runtime.specflow-project-home
  - architecture.runtime.workspace-execution-claims
  - architecture.ai.provider-boundary
  - architecture.ai.session-storage-and-lifecycle
  - architecture.workflow.workflow-kernel
  - architecture.repository-structure
---

# Architecture overview

This page is a **derived overview** for orientation. It restates facts owned by other documents in
diagram form and adds no rules. Each section names its owning document; when a diagram and its
owner disagree, the owner wins and the diagram is fixed.

## Processes and transports

One local product, `nevo-specflow`, has two ways in: offline CLI commands that open the Engine
in-process, and `nevo-specflow start`, which runs the long-lived Runtime. Runtime serves the built
UI and the `/api` HTTP surface from one origin and owns provider processes for managed Sessions.

```mermaid
flowchart LR
  human([Person])
  agent([External agent<br/>e.g. Claude Code in a terminal])

  subgraph product["nevo-specflow (one npm artifact)"]
    cli["CLI<br/>@nevo/specflow"]
    subgraph runtime["Runtime process (nevo-specflow start)"]
      http["HTTP server<br/>/api + built UI"]
      features["Runtime features"]
      store[("Session store<br/>SQLite in a worker thread")]
    end
    engine["Engine library<br/>@nevo/specflow-engine<br/>(in-process)"]
  end

  browser["Browser<br/>SpecFlow UI (React)"]
  git[("Git + filesystem<br/>Project Home and worktrees")]

  subgraph providers["Provider CLIs (child processes)"]
    claude["Claude Code<br/>stream-json over stdio"]
    codex["Codex<br/>app-server JSON-RPC over stdio"]
    antigravity["Antigravity<br/>stream-json + native hooks<br/>+ invocation-private loopback MCP"]
  end

  human --> browser
  human --> cli
  agent --> cli
  browser -- "HTTP JSON + SSE events" --> http
  http --> features
  features --> engine
  features --> store
  features -- "spawn, stdio, process tree" --> providers
  cli -- "offline commands" --> engine
  cli -- "start" --> runtime
  engine --> git
```

Owners: [Runtime ownership and lifecycle](runtime/ownership-and-lifecycle.md),
[Engine boundaries](runtime/specflow-engine.md),
[CLI contract](../reference/cli/nevo-specflow-contract.md),
[Provider boundary](ai/provider-boundary.md),
[Session provider driver protocol](../reference/protocols/session-provider-driver.md).

## Package dependency direction

Arrows point from a consumer to its dependency, as declared in each `package.json`. The UI is not a
package dependency of `@nevo/specflow`: its built assets are bundled into the artifact and served by
Runtime.

```mermaid
flowchart TD
  specflow["@nevo/specflow<br/>composition root, CLI, packaging"]
  runtime["@nevo/specflow-runtime"]
  engine["@nevo/specflow-engine"]
  contracts["@nevo/specflow-contracts"]
  authz["@nevo/authorization"]
  ui["@nevo/specflow-ui"]
  nevoui["@nevo/ui<br/>design system"]
  httpc["@nevo/http-client"]
  figma["@nevo/figma-core<br/>@nevo/figma-capture"]

  specflow --> runtime
  specflow --> engine
  specflow -. "bundles built assets" .-> ui
  runtime --> engine
  runtime --> contracts
  runtime --> authz
  engine -- "./documents only" --> contracts
  contracts --> authz
  ui --> contracts
  ui --> httpc
  ui --> nevoui
  ui --> figma
  nevoui --> figma
```

Owners: [ADR 0012](decisions/0012-product-package-topology-and-dependency-direction.md),
[Repository structure](repository-structure.md). Repository tooling under `tools/*` is private and
never a dependency of product packages ([ADR 0005](decisions/0005-repository-tooling-is-separate-from-the-product-api.md)).

## Runtime composition

Runtime has one composition root. Feature modules under
`packages/specflow-runtime/src/features/<feature>/` contribute routes and services; HTTP is an
adapter over them, not the owner of state.

```mermaid
flowchart LR
  subgraph adapters["Transport adapters"]
    routes["HTTP routes<br/>/api/..."]
    sse["SSE streams<br/>operations, session events"]
    webapp["Static UI host"]
  end

  subgraph feat["Feature modules"]
    auth["auth<br/>authentication + capabilities"]
    specs["specs<br/>overview, create, close, workspace"]
    documents["documents"]
    tasks["tasks"]
    operations["operations"]
    sessions["sessions<br/>coordinator, drivers, persistence"]
    assoc["session-associations"]
    settings["settings"]
  end

  engine["Engine"]
  routes --> auth
  routes --> feat
  sse --> operations
  sse --> sessions
  specs --> engine
  documents --> engine
  tasks --> engine
  sessions -- "workspace-execution claims" --> engine
```

Owners: [Runtime ownership and lifecycle](runtime/ownership-and-lifecycle.md),
[Authorization](runtime/auth/authorization.md),
[Task read composition](runtime/task-read-composition.md),
[Operation progress](../engineering/shared/operation-progress.md).

## Where state lives

```mermaid
flowchart TD
  subgraph home["Project Home (primary checkout)"]
    config[".nevo/config.yaml<br/>committed project policy"]
    defs[".nevo/definitions/&lt;kind&gt;/<br/>committed archetypes, templates"]
    subgraph local[".nevo/local/ (ignored, workstation-local)"]
      localcfg["config.yaml<br/>local overrides"]
      registry["registry, journals, locks"]
      sqlite[("state/sessions/sessions.sqlite")]
      wfjournal["state/engine/operations/workflow/&lt;specId&gt;.json<br/>workflow change journal"]
    end
  end

  subgraph ws["Bound workspace checkout (primary or worktree)"]
    spec["specs/active|archive/&lt;slug&gt;/specification.yaml<br/>+ documents"]
    exec["specs/active|archive/&lt;slug&gt;/.execution/<br/>specification.yaml, tasks/&lt;taskId&gt;.yaml"]
  end

  registry -- "specId → workspaceId binding" --> ws
```

Owners: [Configuration](runtime/configuration.md),
[Project Home and workspaces](runtime/project-home-and-workspaces.md),
[Specification documents](runtime/specification-documents.md),
[ADR 0017](decisions/0017-definitions-as-project-data.md),
[Workflow kernel](workflow/workflow-kernel.md),
[Session storage and lifecycle](ai/session-storage-and-lifecycle.md).

## Managed Session Turn

The happy path of one workspace-writing Turn. Read-only invocations take no Engine claim. Failure,
`unknown` dispatch outcomes and restart recovery are owned by the session storage document and the
driver protocol.

```mermaid
sequenceDiagram
  autonumber
  participant UI as SpecFlow UI
  participant RT as Runtime sessions
  participant DB as Session store
  participant EN as Engine
  participant PR as Provider CLI

  UI->>RT: POST /api/sessions/:id/turns
  RT->>DB: persist Turn and invocation intent
  RT->>EN: admit workspace-execution claim (project-write)
  RT->>EN: mark claim dispatched
  RT->>PR: start the driver invocation
  UI->>RT: GET /api/sessions/:id/events (SSE)
  loop Provider facts
    PR-->>RT: native events
    RT->>DB: normalized Work and messages
    RT-->>UI: session events
  end
  PR-->>RT: terminal result, process tree settled
  RT->>EN: settle claim with receipt
  RT->>DB: settle Turn
```

Owners: [Canonical Session, Turn and Work](ai/canonical-session-turn-work.md),
[Session storage and lifecycle](ai/session-storage-and-lifecycle.md),
[Sessions API](../reference/api/sessions.md),
[Workspace execution claims](runtime/workspace-execution-claims.md).
