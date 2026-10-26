---
id: ideas.multi-project-hosting
type: architecture
title: Multi-project hosting and future cross-project work
status: draft
scope: specflow
areas: [runtime, ai, configuration, server, cli, security, ui]
tags: [multi-project, docker, sessions, providers, workbench, worktree, tooling]
read_when:
  - designing Runtime composition, project discovery, or project selection
  - designing managed Sessions, provider execution, or cross-project access
  - separating global application settings from repository and Project Home state
  - planning Docker hosting, repository registration, or installed development tools
  - evaluating a logical workspace spanning multiple independent Git repositories
summary: >
  Non-authoritative product direction: one SpecFlow Runtime can eventually host multiple registered
  Git projects, with global app concerns separated from project-owned Engine state, and room for
  explicitly authorized cross-project agents and an optional logical Workbench without implementing them now.
related:
  - ideas.readme
  - architecture.runtime.ownership-and-lifecycle
  - architecture.runtime.configuration
  - architecture.runtime.specflow-project-home
  - architecture.ai.canonical-session-turn-work
  - ideas.specflow-runtime.ai-adapters
  - ideas.developer-workspace
---

# Multi-project hosting and future cross-project work

> **Idea, not a delivery plan or current contract.** Preserve the destination while implementing
> today's single-project Engine, managed Sessions and provider adapters. Do not infer that the
> features below are approved for implementation or are already available.

## Destination in one scenario

Run a packaged SpecFlow server (potentially in Docker), open its web UI, perform first-run admin
setup, register or clone Git repositories, and work on Specifications, Worktrees and agent Sessions
without starting a separate SpecFlow server per repository. A local single-project CLI remains a
useful supported entry point. Both entry points should ultimately compose the same domain behavior.

A later version may let an agent inspect or coordinate work across projects. More distant still,
a **Workbench** could group several Git projects as a logical alternative to a monorepo. Neither
capability needs to exist for the first multi-project server.

This direction does **not** require a user-facing `Instance` domain aggregate or public
`instanceId` just because a server hosts several projects. Internal deployment identity may still
be useful for operations. Global application state is not another Git Project.

## Conceptual boundaries

- **Application/Runtime:** HTTP, user access, registered projects, provider availability and
  installed tools. This is application state, not a Git Project.
- **Git Project / Project Home:** Committed project policy, canonical Specifications, verified
  primary checkout and registered linked worktrees.
- **Project-local state:** Existing `.nevo/local/` holds local configuration, registry, journals,
  claims and recovery evidence. The eventual physical location remains undecided.
- **Workspace:** Verified checkout belonging to a Project Home, not a cross-project Workbench.
- **Agent definition / provider:** May be reusable, but does not itself authorize access to
  other projects.
- **Managed Session / Turn / Work:** Runtime-owned execution; conversation context, execution
  target and mutation authority are different concepts.
- **Optional Workbench:** A group of references to projects, not a new Project Home.

The current canonical Session -> Turn -> Work model and E1/E2 Project Home verification remain
authoritative. This note does not revise their existing identities or mutation semantics.

## Keep these evolution paths possible

### Runtime and project lifecycle

- Do not bake the assumption of **exactly one project per Runtime process** into reusable Session,
  auth, provider, transport or persistence contracts. A local single-project composition may still
  use one Engine for now.
- A future registry can select projects by stable application-owned references and resolve a
  verified Project Home for each. Avoid using an arbitrary client-provided path, remote URL or
  branch as write authority.
- Engine Create/Close, reservations, Git locks, registry revisions and recovery remain **scoped to
  the actual Project Home**. Hosting multiple projects is not a reason to centralize or weaken
  those invariants. No distributed/atomic Git transaction across projects is implied.

### Managed Sessions and agents

- Keep provider/session identity independent from UI routes, project names and workspace paths.
  Do not prematurely encode `Session == one permanent project == one permanent worktree` as an
  irreversible storage invariant. E4's fixed verified checkout remains an appropriate initial
  execution boundary, not a demand to build multi-project Sessions.
- Distinguish **context access** (a session can read information about another project),
  **execution target** (where a specific operation runs), and **mutation authority** (which
  project/workspace the operation may change). These can differ.
- Cross-project read/write needs explicit selection and authorization, not automatic access to
  every repo in the same server. Project policy, user identity, provider process credentials and
  Engine writer claims must not be conflated.
- A future coordinator may operate across projects while individual Specifications, tasks, Git
  operations and their recovery stay project-owned. Do not introduce cross-project Specification
  lifecycle or shared Git commits until a real use case requires them.
- This is **not** a request to implement multi-project Sessions now. Introduce only seams that are
  justified by the immediate feature, and record assumptions that would be expensive to change.

### Configuration, persistence and packaging

- Separate eventual **global application config/state** (server bind/origin, administrator,
  account access, project catalogue, provider/tool catalogue) from **committed project policy**
  and **project-local operational state**.
- Today `runtime.server` and `runtime.authentication` live under project configuration,
  while the Engine pins Project Home, common Git directory and absolute paths in local identity
  and recovery evidence. Moving ownership or files is a deliberate migration, **not** a path
  rename or a config override.
- A Docker image can bundle the SpecFlow Runtime/UI and common provider tools; project-specific
  SDKs, CLIs and dependencies could later be installed through an authorized UI workflow.
  Installed tools need version, scope, persistence, execution-environment and rollback semantics.
  Installing one project's toolchain must not silently alter another project's environment.
  UI-triggered installation is privileged code execution, not a general shell endpoint.
- Credentials are not committed project definitions. Prefer explicit host/user/project-scoped
  bindings and minimal provider process environments over handing agents every host secret.
- Container restart, persistent volumes, Git worktree paths, filesystem identity and recovery
  are part of correctness, not deployment-only details.

### Optional cross-project Workbench

A future Workbench might be a SpecFlow-managed set of project references or a portable manifest
stored in a separate Git repository (not necessarily Git submodules). It may group backend,
frontend and infrastructure repositories or selected worktrees for one goal.

It is **a possible read/context/coordination layer**, not automatically a new Project Home,
Specification owner, scheduler, permission grant or distributed transaction. One project may
participate in more than one grouping. Do not rename Engine `Workspace` to mean Workbench.

## Explicitly deferred, not required for current E3-E5 delivery

- Workbench domain entity, manifest syntax, nested groups and workbench-local Specifications.
- Cross-project agent writes, cross-repo workflow orchestration, global Task lifecycle and
  all-or-nothing multi-repository integration.
- Full multi-user tenancy, central secrets platform, container-per-agent orchestration,
  arbitrary tooling installation and a remote IDE platform.
- Final public CLI/API routes, database schema, server/CLI mode names and data migration design.

The initial multi-project feature, when selected for implementation, can simply be: **register
several projects, select one, run the existing per-project flow**.

## Questions to resolve at the point of implementation

1. Can an existing host-initialized Project Home be safely mounted into a container at a different
   path, or does first support require a Docker-owned clone/state with stable container paths?
2. Which global settings and credentials leave the committed project configuration, and how do
   local CLI and hosted mode share configuration without conflicting authorities?
3. How does a managed Session authorize and identify its current execution workspace if its read
   context later spans more than one project?
4. What is the minimum safe project-registry and server exposure model (admin bootstrap, TLS,
   external origin, reverse proxy, user/project authorization)?
5. When does the real product need a Workbench rather than a project selector plus explicitly
   delegated agent actions?

## Trigger for promotion

When implementing **managed Sessions/provider execution**, revisit the Session scope and access
sections. When implementing **project registration or Docker hosting**, revisit global versus project
configuration, durable identity and Runtime composition. Promote any accepted invariants
into their respective authoritative architecture/product/reference documents; keep the deferred
features here until they have evidence and a separate approved scope.
