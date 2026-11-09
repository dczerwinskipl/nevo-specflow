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
  - orienting in the system before working across package or process boundaries
  - explaining who uses SpecFlow through which surface, and which part talks to which
  - deciding which package or authoritative document owns a concern
summary: >
  Derived, diagram-first map of Nevo SpecFlow from the outside in: actors and use cases, the
  running parts (CLI, Runtime with the UI, Engine, provider agents), the components inside each
  part, then technical views (package dependencies, where state lives, the managed Session Turn).
  Every diagram links the authoritative document that owns its facts; on conflict those documents
  win.
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
  - product.specflow.ui.application-architecture
  - reference.cli.nevo-specflow-contract
---

# Architecture overview

This page is a **derived overview** for orientation. It restates facts owned by other documents in
diagram form and adds no rules. Each section names its owning documents; when a diagram and its
owner disagree, the owner wins and the diagram is fixed.

It reads from the outside in: who uses SpecFlow and for what, which parts run, what each part is
made of, and finally the technical views.

## 1. Context: who uses SpecFlow

SpecFlow is a local product, `nevo-specflow`, installed into a Git repository. A **person** works
mainly in the browser UI; an **agent the person runs themselves** (for example Claude Code or Codex
in a terminal) works through the CLI. SpecFlow can also run **managed agents** itself: Runtime
starts the provider CLI as a child process and relays the conversation to the UI.

```mermaid
flowchart LR
  person([Person<br/>developer, project owner])
  extagent([External agent<br/>run by the person in a terminal])

  subgraph sf["Nevo SpecFlow (local, one install per repository)"]
    ui["SpecFlow UI<br/>in the browser"]
    cli["nevo-specflow CLI"]
    rt["Runtime<br/>local server"]
  end

  managed([Managed agents<br/>Claude Code, Codex, Antigravity<br/>started by Runtime])
  repo[("Git repository<br/>Project Home + worktrees")]
  idp([OIDC identity provider<br/>optional])

  person -- "works in" --> ui
  person -- "init, start, operator commands" --> cli
  extagent -- "reads and writes Specifications" --> cli
  ui -- "HTTP" --> rt
  cli -- "start" --> rt
  rt -- "starts and talks to" --> managed
  managed -- "work in the workspace" --> repo
  cli --> repo
  rt --> repo
  rt -. "sign-in" .-> idp
```

Owners: [Product overview](../product/specflow/overview.md),
[CLI contract](../reference/cli/nevo-specflow-contract.md),
[Runtime authentication](runtime/auth/README.md),
[Provider boundary](ai/provider-boundary.md).

## 2. Use cases by actor

What each actor does today, and through which surface. The workflow kernel (steps, Tasks,
automatic continuation) exists in the Engine but is not yet exposed through the CLI, Runtime or UI,
so it has no use case here yet.

**Person.** Works mainly in the UI; uses the CLI to set up a project, start SpecFlow and recover
interrupted operations.

```mermaid
flowchart LR
  person([Person])
  subgraph ui["In the UI"]
    u1["Browse Specifications<br/>current and archive"]
    u2["Create a Specification<br/>archetype, workspace"]
    u3["Read and edit documents"]
    u4["Start a Session with an agent<br/>and converse in it"]
    u5["Answer agent questions,<br/>allow or deny permissions"]
    u6["Inspect Work history,<br/>telemetry, provider limits"]
    u7["Rename, archive, delete Sessions"]
    u8["Review Tasks"]
  end
  subgraph cli["In the CLI"]
    c1["init, project inspect|bootstrap"]
    c2["start the Runtime and UI"]
    c3["recovery: specs recover,<br/>close-reconcile-scratch"]
  end
  person --> ui
  person --> cli
```

**External agent.** An agent the person runs in a terminal reads and changes Specifications only
through the offline CLI. It never talks to the Runtime.

```mermaid
flowchart LR
  extagent([External agent])
  subgraph cli["In the CLI"]
    c1["specs create|list|resolve|close"]
    c2["specs documents ...<br/>list, save, add, move, status"]
    c3["commit [status]"]
    c4["definitions list|show|validate|install"]
  end
  extagent --> cli
```

**Managed agent.** A provider CLI started by Runtime for a Session. It works in the bound workspace
and reaches the person only through Runtime, which shows its questions and permission requests in
the Session screen.

```mermaid
flowchart LR
  managed([Managed agent])
  subgraph session["Inside a Session"]
    m1["Work in the bound workspace<br/>within its mode's write authority"]
    m2["Ask a question or<br/>request a permission"]
  end
  person([Person in the UI])
  managed --> m1
  managed --> m2
  m2 -- "answered by" --> person
```

Owners: [UI interaction model](../product/specflow/ui/interaction-model.md),
[Full Session](../product/specflow/ui/full-session.md),
[Specification creation](../product/specflow/specification-creation.md),
[Specification CLI commands](../reference/cli/specflow-specification-commands.md),
[Provider references](../reference/providers/README.md).

## 3. Containers: what runs

Two ways in share one Engine. Offline CLI commands open the Engine in their own process and exit.
`nevo-specflow start` runs the long-lived Runtime, which serves the built UI and the `/api` HTTP
surface from one origin, opens the same Engine in-process, and owns the managed provider processes.

```mermaid
flowchart LR
  person([Person])
  extagent([External agent])

  subgraph cliproc["CLI process (short-lived)"]
    cli["Commands<br/>@nevo/specflow"]
    engine1["Engine<br/>(library)"]
  end

  subgraph rtproc["Runtime process (nevo-specflow start)"]
    http["HTTP server<br/>/api + static UI"]
    features["Runtime features"]
    engine2["Engine<br/>(library)"]
    store[("Session store<br/>SQLite, worker thread")]
  end

  browser["Browser<br/>SpecFlow UI (React)"]
  git[("Git + filesystem")]

  subgraph providers["Provider CLIs (child processes)"]
    claude["Claude Code<br/>stream-json, stdio"]
    codex["Codex<br/>app-server JSON-RPC, stdio"]
    antigravity["Antigravity<br/>stream-json + hooks<br/>+ private loopback MCP"]
  end

  person --> browser
  person --> cli
  extagent --> cli
  cli --> engine1
  cli -- "start" --> rtproc
  browser -- "HTTP JSON + SSE" --> http
  http --> features
  features --> engine2
  features --> store
  features -- "spawn, stdio, process tree" --> providers
  engine1 --> git
  engine2 --> git
  providers --> git
```

Owners: [Runtime ownership and lifecycle](runtime/ownership-and-lifecycle.md),
[Engine boundaries](runtime/specflow-engine.md),
[Provider process ownership](ai/provider-process-ownership.md),
[Session provider driver protocol](../reference/protocols/session-provider-driver.md).

## 4. Components

### 4.1 CLI (`@nevo/specflow`)

The product composition root. Command groups open the Engine for the current checkout, except
`start`, which hands over to the Runtime, and `auth`, which belongs to the Runtime auth feature.

```mermaid
flowchart LR
  bin["bin: nevo-specflow"] --> program["program<br/>command composition"]
  program --> init["init"]
  program --> project["project inspect|bootstrap"]
  program --> specs["specs ...<br/>+ specs documents ..."]
  program --> commit["commit [status]"]
  program --> defs["definitions ..."]
  program --> auth["auth hash-password"]
  program --> start["start [--demo]"]

  init & project & specs & commit & defs --> engine["Engine<br/>openSpecFlowEngine"]
  auth --> rtauth["Runtime auth feature"]
  start --> runtime["Runtime<br/>startProjectRuntime + built UI"]
```

Owners: [CLI contract](../reference/cli/nevo-specflow-contract.md),
[CLI architecture](../engineering/cli/architecture.md),
[Product packaging](../engineering/repository/product-packaging.md).

### 4.2 Runtime (`@nevo/specflow-runtime`)

One composition root builds infrastructure, then the feature modules under `src/features/<feature>/`,
then starts the HTTP adapter. HTTP and SSE are adapters over the features, not owners of state.

```mermaid
flowchart LR
  subgraph adapters["Transport adapters"]
    routes["HTTP routes /api/..."]
    sse["SSE streams<br/>operations, session events"]
    webapp["Static UI host"]
  end

  subgraph feat["Feature modules"]
    auth["auth<br/>sign-in, capabilities"]
    specs["specs<br/>overview, create, close, workspace"]
    documents["documents"]
    tasks["tasks"]
    operations["operations<br/>progress of long operations"]
    sessions["sessions"]
    assoc["session-associations<br/>Session ↔ Specification/Task"]
    settings["settings"]
  end

  subgraph sess["sessions internals"]
    coord["lifecycle coordinator"]
    drivers["provider drivers<br/>claude, codex, antigravity, mock"]
    proc["process ownership<br/>scope, termination, Windows job"]
    persist["persistence<br/>SQLite worker"]
    inter["interactions<br/>questions, permissions"]
  end

  engine["Engine"]
  routes --> auth
  routes --> feat
  sse --> operations & sessions
  specs & documents & tasks --> engine
  sessions --> coord
  coord --> drivers --> proc
  coord --> persist
  coord --> inter
  coord -- "workspace execution claims" --> engine
  assoc --> persist
```

Owners: [Runtime ownership and lifecycle](runtime/ownership-and-lifecycle.md),
[Authorization](runtime/auth/authorization.md),
[Session storage and lifecycle](ai/session-storage-and-lifecycle.md),
[Task read composition](runtime/task-read-composition.md),
[Operation progress](../engineering/shared/operation-progress.md).

### 4.3 Engine (`@nevo/specflow-engine`)

A library with no server of its own. `openSpecFlowEngine` resolves the Project Home once per
process; every use case then runs against that verified project.

```mermaid
flowchart TD
  open["openSpecFlowEngine<br/>resolves the Project Home once per process"]

  subgraph uc["Use cases"]
    create["specs/create<br/>Create"]
    close["specs/lifecycle<br/>Specification, worktree<br/>and workspace Close"]
    docs["specs/documents<br/>tree, reads, writes"]
    commits["specs/manual-commit<br/>uncommitted changes, commit"]
    defs["specs/definitions<br/>archetypes, document types"]
    execc["execution<br/>workspace execution claims"]
    wf["workflow<br/>kernel: steps, Tasks,<br/>continuation, attention"]
  end

  subgraph infra["Shared infrastructure"]
    home["project<br/>Project Home, workspace registry"]
    lock["control lock +<br/>shared resources (project-write)"]
    policy["version-control<br/>worktree and commit policy"]
    gitp["git<br/>Git process runner"]
  end

  open --> uc
  uc --> infra
  policy --> gitp
```

Owners: [Engine boundaries](runtime/specflow-engine.md),
[Project Home and workspaces](runtime/project-home-and-workspaces.md),
[Specification lifecycle](runtime/specification-lifecycle.md),
[Specification documents](runtime/specification-documents.md),
[Workspace execution claims](runtime/workspace-execution-claims.md),
[Workflow kernel](workflow/workflow-kernel.md),
[Git/worktree configuration](../reference/configuration/specflow-git-worktrees.md).

### 4.4 UI (`@nevo/specflow-ui`)

A React single-page app on the Nevo UI design system. Feature UI modules contribute routes and
navigation to the shell; screens read through TanStack Query from services that talk to the
Runtime, with separate project and demo adapters.

```mermaid
flowchart LR
  subgraph shell["app"]
    router["router<br/>TanStack Router"]
    appshell["SpecFlow shell<br/>navigation, account"]
    registry["UI module registry<br/>extension points"]
    query["query client<br/>TanStack Query"]
  end

  subgraph features["feature UI modules"]
    specs["specs<br/>list, create, overview"]
    documents["documents<br/>explorer, editor, tabs"]
    sessions["sessions<br/>start, Full Session, list"]
    tasks["tasks<br/>workbench, detail"]
    gitf["git<br/>changes, repository"]
  end

  subgraph services["services"]
    apis["SpecFlowAppServices<br/>project and demo adapters"]
    authc["auth<br/>login, recovery"]
    http["HTTP client<br/>@nevo/http-client"]
  end

  nevoui["@nevo/ui<br/>design system"]
  runtime["Runtime /api"]

  router --> appshell
  registry --> router
  features -- "contribute" --> registry
  features --> query --> apis --> http --> runtime
  authc --> http
  features --> nevoui
  appshell --> nevoui
```

Owners: [UI application architecture](../product/specflow/ui/application-architecture.md),
[Data loading and integration](../product/specflow/ui/data-loading-and-integration.md),
[Design system boundary](../design-system/principles/system-boundary.md).

## 5. Technical views

### 5.1 Package dependency direction

Arrows point from a consumer to its dependency, as declared in each `package.json`. The UI is not a
runtime dependency of `@nevo/specflow`: its built assets are bundled into the artifact and served by
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

### 5.2 Where state lives

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

### 5.3 Managed Session Turn

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
