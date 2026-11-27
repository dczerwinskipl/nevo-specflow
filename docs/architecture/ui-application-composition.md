---
id: architecture.ui.specflow-application-composition
type: architecture
title: SpecFlow UI application composition
status: current
scope: specflow
areas: [ui, runtime, server]
read_when:
  - changing SpecFlow UI routing, application service injection or feature ownership
  - modifying Task workbench and Specification Workspace read composition
summary: >-
  Router, feature ownership, service injection, TanStack Query state and Engine/Runtime-facing UI ownership boundaries.
related:
  - product.specflow.ui.application-architecture
  - product.specflow.ui.application-navigation-and-auth
  - architecture.runtime.specification-workspace-composition
  - architecture.runtime.task-read-composition
  - product.specflow.ui.data-loading-and-integration
---

# SpecFlow UI application composition

The app root composes feature-owned adapters; `@nevo/ui` owns reusable presentation. URL/navigation is product behavior, while server state and authorization belong to Runtime.

## Normative application architecture

### Routing and navigation

TanStack Router is the canonical routing and product-navigation mechanism for SpecFlow UI.

Route-worthy state, route params/search, deep links, guarded navigation, and browser-compatible links
MUST use the router rather than introducing a parallel routing/history mechanism.

Local workspace state that is explicitly defined as non-route state remains owned by the workspace
interaction model.

### Application services and transport

The browser application composition root owns shared Runtime-facing services and the application-scoped
HTTP transport.

SpecFlow UI MUST compose one application-scoped `HttpClient` and use it to construct typed
application/feature APIs and stores. Feature API factories MUST require their transport dependency
explicitly rather than silently constructing another transport.

The raw `HttpClient` MUST NOT be exposed as a general React/component dependency. New Runtime
capabilities should be represented by narrow typed feature/application APIs constructed from the shared
transport at application composition.

Tests MAY inject explicit clients or fake typed APIs at the same construction seams.

### Remote server state

TanStack Query is the canonical server-state mechanism for ordinary remote SpecFlow feature data.

New remote feature reads and mutations MUST use feature-owned TanStack Query definitions for query
keys, request lifecycle, cache behavior, invalidation, and mutation state. Screen composition consumes
that server state and passes bounded UI-facing models/callbacks into presentation components.

SpecFlow UI MUST use one application-scoped QueryClient lifecycle/provider for product feature state.
A feature MUST NOT create an independent QueryClient or introduce a parallel ad-hoc request/cache
lifecycle for ordinary remote feature state.

Authentication bootstrap is a deliberate exception to ordinary feature server-state ownership:
router guards need session state before normal feature rendering, so a dedicated authentication store
MAY own bootstrap session state while still using the application-scoped HTTP transport.

### Fixture boundary

Fixtures are permitted only in test-support, Storybook and explicit network-mocking test/dev harnesses.
A production UI module MUST NOT import a fixture, select mock data using Vite environment variables,
or implement a fixture-backed API adapter. Runtime Demo Mode is an explicit backend data source,
not a second frontend data-access mode.

A normal production route/surface MUST NOT use fixture/example data as its authoritative source or
silent fallback when production data is unavailable. Production composition surfaces real unavailable
or error state instead.

## Feature ownership and UI composition

A feature owns its domain-specific models, presentation and typed API/query behavior regardless
of which product surface displays it. Tasks, Documents, Git and Sessions may contribute to
Specification Work, Project Settings or other surfaces. The host owns placement, navigation,
responsive layouts and extension-point behavior; it does not become the owner of those features.

- `features/tasks/` owns Full Task, the Tasks page, the workflow Now blocks and Task-group/row
  controls.
  `features/specs/` owns Specification routing, Workspace composition and Secondary stack
  navigation. The existing aggregate Workspace projection remains an explicit migration seam.
  `features/documents/` owns the Documents explorer and editor, and `features/sessions/` the Session
  screens, composer and recovery, even though Create and the Specification surfaces display them.
  Module ownership, barrels and shared code rules: see
  [Code organization](../engineering/shared/code-organization.md#module-ownership-and-boundaries).
- The existing backend `RuntimeFeature` is a separate composition boundary from `UiModule`.
  HTTP contracts connect those layers; neither UI modules nor plugins instantiate independent
  application HTTP transports or QueryClient lifecycles.
- Configuration of Git branch/push policy, Task lane/status settings, runtime module discovery,
  and dynamic third-party code loading are **out of scope**.

Task presentation is colocated under `features/tasks/pages` (the Task history under
`features/tasks/detail/history`), and the Overview contribution under
`features/tasks/contributions/specification-overview`. The aggregate Workspace data and actions
are a transitional host-owned adapter, not a standard public contract for other features.

### Typed UI extension registry

A **UiModule** is a feature-owned group of UI contributions. A **UiContribution** has a stable
identity and a contract belonging to a **UiExtensionPoint**. A **UiRegistry** validates registration
and offers typed `registry.get(extensionPoint)` lookup. A **host** owns the extension-point
definition, data context, placement, filtering, rendering, and error recovery. Generic registry
infrastructure must not import feature models, layout slots, or domain actions.

A host declares a typed point through `defineUiExtensionPoint<T>()`. A feature uses
`contributeTo(point, contribution)` to register a point-specific contract. Registration and
lookup preserve its TypeScript type. No central union of all contribution contracts is required.
The registry checks point identities and duplicate module/contribution IDs, and preserves module
registration order with read-only lookup results.

Application composition explicitly declares supported extension points and statically imported
built-in modules in `app/ui-modules/builtInUiModules.ts`. It passes the resulting registry through
`UiModulesProvider`. The generic provider does not import production built-ins; tests and
Storybook provide their own registry explicitly.

Specification owns its implemented point in
`features/specs/extensions/specificationWorkSections.ts`. Its
`specification.work.sections` contributions contain an ID, `context`, `main` or `related` slot,
optional visibility rule and React Component. The host filters by slot and renders the
component through JSX. Other hosts (such as a future Project Settings screen) may define
different typed contribution contracts without modifying generic registry infrastructure.
Tasks registers its work contribution in `features/tasks/uiModule.tsx`; WorkView does not
import the Tasks implementation.

### Specification feature contributions

Besides `specification.work.sections`, Specs owns these extension points, without changing the
generic registry:

- The previous `specification.views` tab registry is removed. Full Primary
  pages are owned by feature-specific TanStack Router routes, including
  Documents List, Full Document, Sessions List, Changes, Repository and Full Task.
  `/specs/:specId` is Specification Overview; old `?view` addresses redirect.
- `specification.attention.items`: Tasks, Sessions, Git and Specification own their
  own Attention facts, priority, actions, and presentation. The backend's domain
  sections provide the corresponding attention arrays within a coherent Workspace
  transport snapshot. Each contribution's `AttentionItem.id` is unique **within that
  contribution**, not globally; different features may use the same local ID. The host
  creates a stable render identity from `(contribution.id, item.id)` without changing
  the domain item ID, and orders entries by explicit `critical > high > normal`
  priority (stable within each level). Duplicate or empty local IDs fail their
  contribution visibly rather than silently discarding another entry. The slot
  does not infer priorities from feature kinds or silently recover domain items from
  a global Specs attention array. An available Tasks, Sessions or Git Runtime section MUST
  contain its complete `attention` collection; `[]` means authoritative no Attention.
  `source_unavailable` is never mapped to `[]`: the feature reports its unknown state
  and the host shows a partial-Attention warning alongside healthy entries.
  `not_implemented` and `forbidden` remain explicit source states and do not
  reveal entries or create a misleading availability alarm. Failures of a
  contribution are isolated and visible.

Git, Sessions and Documents own `specification.work.sections` contributions.
Their links navigate to canonical Primary routes or open contextual Secondary previews; they never
instantiate an independent Workspace HTTP client. `SpecificationSummarySection`,
`PreparationSection`, the attention container and Activity History remain host-owned
cross-feature coordination for now.

Work section extension contexts still carry transitional aggregate Workspace data
and semantic actions. Attention comes from each owning domain section of the Runtime
read model, not from a global host-owned Attention list. The current HTTP snapshot
is shared for coherence; separate per-feature read endpoints, event lifecycles,
dynamic plugins and additional Query clients are not implied. Runtime producers own these facts directly in their respective sections;
the Specification projection owns only Specification-level entries. No central
Attention collection or global fallback remains.

### Transitional context and future plugins

The current `SpecificationWorkSectionContext` includes aggregate `SpecificationWorkspaceData`
and `WorkspaceRuntime` semantic actions. That is **transitional**, and must not be copied into
unrelated host contracts. Internally, `TasksSection` already uses narrow props and callbacks.

This static UI registry is not a full plugin system: there is no dynamic discovery, installation,
remote loading, grant model, YAML configuration, or Runtime/CLI registry. Future multi-part
SpecFlow plugins may optionally supply UiModules, but their Runtime, CLI, workflow and configuration
contracts remain **undecided**. Runtime endpoints, not contribution visibility, enforce access.

### Obsolete Extensions placeholder

The pre-module `ExtensionsSection` and `hasExtensions` boolean were removed. The Runtime
Workspace mapper never exposed a genuine extension payload and always returned `false`;
keeping the empty placeholder would imply a capability that did not exist. Real optional
Specification Work sections are contributed through `specification.work.sections`.
Dynamic discovery and enablement of external plugins remain follow-ups, not features of
this registry.

## Current route and service composition

The current router tree is owned by the application routing composition. The root is neutral because
not every surface belongs inside the application shell.

Standalone routes currently include:

- `/login` for authentication outside `AppShell`;
- `/runtime-unavailable` for bootstrap/recovery outside `AppShell`;
- `/access-denied` for explicit Specs forbidden failures outside `AppShell`.

A pathless application layout currently owns `SpecFlowShell` and guards product routes. It asks the
Runtime for `GET /api/auth/session` before entering the application. Required authentication redirects
an unauthenticated user to `/login` with a local `returnTo`; trusted local mode enters directly.
An authenticated visit to `/login` returns to the requested app surface. Failure to load Runtime
authentication state is a distinct bootstrap failure and routes to the recovery screen rather than
being treated as an unauthenticated user.

`createSpecFlowAppServices()` is the current composition factory for shared Runtime-facing services.
It creates the application HTTP client and constructs the current typed services from that transport.
This symbol is an implementation mapping, not the architectural identity of the composition boundary.

TanStack Query is the canonical remote server-state architecture. The application-level
`QueryClientProvider` is initialized at the application composition root (`App.tsx`) using
`defaultQueryClient`, providing a shared query cache across all features and routes.

Remote feature reads and mutations use the shared Query boundary; screen-specific request lifecycles are not architectural precedent.

The current product routes under the guarded layout are:

- `/` for the Specifications list (Specs Overview, `?collection=current|archive`), with
  **New specification** when creation is available;
- `/specs/new` for Create Specification and `/specs/new/creating/:operationId` for the page of one
  Create operation (bookmarkable progress and recovery);
- `/specs/:specId` for the owning Specification, with `?collection=current|archive` as parent return
  context; loads server state via TanStack Query and renders the Specification Workspace;
- `/specs/:specId/documents` and `/specs/:specId/documents/:documentId` for Documents List and Full Document;
- `/specs/:specId/sessions`, `/specs/:specId/changes`, `/specs/:specId/repository` for feature-owned pages (list data temporarily reads the Workspace projection);
- `/specs/:specId/tasks/:taskId` for Full Task detail, with the collection as optional return context;
  reads Task detail directly, independently of Workspace Task groups or Workspace read availability;
- `/specs/:specId/sessions/new` for New Session of that Specification;
- `/sessions/:sessionId` for the Session (Full Session), a top-level route; the nested
  `/specs/:specId/sessions/:sessionId` only redirects there with `replace`;
- `/sessions/new`, which has no UI entry and redirects with `replace` to `/`;
- `/ui-playground` for a directly routable development/integration screen, not a persistent product
  navigation item.

## Application services and server-state architecture

SpecFlow UI establishes a clear data-boundary hierarchy:

```text
Runtime HTTP contracts
        ↓
Feature API adapters (`SpecificationApi`, `TaskApi`, `DocumentApi`, `SpecsOverviewApi`)
        ↓
TanStack Query query/mutation definitions
        ↓
Feature hooks (`useSpecificationWorkspace`, `useSpecificationTask`, `useSpecsOverview`)
        ↓
UI projection / presentation models
        ↓
Screen composition (`SpecificationSurfaceConnected`, `SpecsRouteScreen`)
        ↓
Presentational components (`SpecificationWorkspace`, `WorkView`, `SpecsOverview`)
```

### Application services boundary (`SpecFlowAppServices`)

The browser/application-level HTTP transport (`HttpClient`) is created once at the application composition root.
Feature APIs are composed once and exposed to guarded routes and connected components through TanStack Router context (`useAppServices()`):

- `SpecFlowAppServices` exposes the feature APIs, for example `authApi`, `specsOverviewApi`,
  `specificationApi`, `taskApi`, `documentApi`, `managedSessionsApi`, `projectCreationApi` and
  `runtimeInfoApi`. The one shared `HttpClient` stays private to the composition root.
- `SpecificationApi` reads the Runtime Workspace endpoint, while feature-owned `DocumentApi` and `TaskApi`
  read their independent Detail endpoints through typed adapters and query keys.
  Both use the shared application HTTP client, and missing project-side sources produce
  explicit unavailable responses rather than browser fixtures.
- Storybook/test fixtures live under `test-support` and must not be imported by production UI.

Connected components and route guards consume the same Router context; there is no
parallel React services provider or runtime dependency-injection container. Missing Router
context is an explicit error. Isolated tests use a **test-only** `RouterContextProvider`
adapter with a real injected router, and standalone presentational components require
neither services nor a router. Dynamic Task/Session/Workspace state stays in TanStack
Query and local UI state, never on the router services object.

Component code never instantiates ad-hoc transport clients and does not know arbitrary endpoint URLs.

### Server state via TanStack Query

`@tanstack/react-query` is the canonical server-state mechanism.
An application-level `QueryClient` is initialized at the composition root (`App.tsx`) via `QueryClientProvider client={defaultQueryClient}`.

- Server reads, caching, invalidation, loading, error, and mutation lifecycle are owned by TanStack Query.
- Query keys are defined canonically per feature (`specificationKeys`, `specsOverviewKeys`).
- Local UI state (selection, local Secondary stack, dialog visibility) remains local React state.

### Separation of screen composition and presentation

Production screens (`SpecificationSurfaceConnected`) own data fetching, loading spinners, and honest error/unavailable states.
Presentational components (`SpecificationWorkspace`, `WorkView`, `TaskRow`, `SessionsView`, `RepositoryView`, `ChangesView`, `FullTaskView`) receive structured data and callbacks via typed props:

- **No fixture fallback in production**: Production screens never fall back silently to fixture domain data (`dataProp ?? createFixture(...)`). When backend endpoints are unavailable, an honest unavailable state is displayed.
- **No fixture scenarios in route search**: Query parameters like `?scenario=...` are forbidden in production routes. Scenario-driven fixtures are restricted to Storybook and tests, including test-owned typed API adapters and network interception.
- **No fabricated domain logic**: Execution readiness, completion counts, file changes, and repository status are consumed as typed semantic fields from authoritative models, never fabricated by matching task IDs or parsing localized UI text.

## Specification Workspace Runtime integration

The ordinary route uses `SpecificationApi` backed by a single app-scoped
`HttpClient`; the server owns the concrete `/api/specs/:specId/workspace`
endpoint and scoped authorization. Transport DTOs in
`@nevo/specflow-contracts/specs/workspace` are mapped by the feature to the
presentation-oriented `SpecificationWorkspaceData` model. The UI does not
select repositories or resolve host filesystem paths.

`GET /api/runtime/info` provides `dataMode` for environment identification.
Demo is enabled by the operator at Runtime startup (`nevo-specflow start
--demo`), not via browser configuration. Feature sections distinguish an
authoritatively empty collection from an unavailable/forbidden source.

The demo Runtime runs the Engine's workflow over in-memory state
([ADR 0025](decisions/0025-demo-runs-the-engine-in-memory.md)), so the UI
renders the same Overview Now, Tasks page and Full Task in both modes and has no demo branch for
them. Multi-project ownership remains a separate future capability.

Workspace header Refresh invalidates **only the exact Workspace snapshot** query. Full Task,
Document and Git Changes queries own independent freshness, error and Retry lifecycles; they
are not implicitly refetched merely because the user refreshes the overview. A domain mutation
may separately invalidate every authoritative projection it actually changes.
A failed detail load exposes Retry. The temporary aggregate-backed Documents, Sessions and Git
list pages may retain a successful snapshot after a transient HTTP 503, but MUST visibly mark
it as stale and offer a local Query Retry. A later 401/403/404 must never display previously
cached protected or deleted content.

A contribution error boundary catches **render failures only**. Its Retry resets its own
render boundary without refetching Workspace or inferring a feature Query key. Connected
feature components own their data-load error and Retry UX; modules that introduce independent
queries MUST implement their own scoped refetch and error presentation. The host MUST NOT
turn a render retry into broad Query invalidation.
The feature caches semantic lifecycle/status codes, not labels in a particular locale;
product presentation resolves those codes using the current i18next locale. A single
`recommendedSessionId` originates in Runtime; UI does not assume the first Session is preferred.

### Sidebar navigation read model

Navigation is deterministic: the same canonical URL settles to the same navigation (text and
links) whether it was reached by client navigation or opened cold (direct link, F5).

- **Source.** The Specification route (`/specs/$specId`, parent of every per-spec route) owns the
  Specification Workspace query (`specificationKeys.detail(specId)`,
  `GET /api/specs/:specId/workspace`); `ProductNavigation` and the location trail observe the
  same entry as an _active_ query. When the
  Workspace is already cached (Overview, Documents, Sessions) the same key is reused and no
  duplicate request is issued; when it is cold (Full Task, Full Document, Session) it is fetched
  once. Title, the optional Specification `key`, document count, Git capability and the
  Sessions summary all come from that one snapshot. The Overview catalogue is not a navigation
  source.
- **Loading.** Until the read settles, the switcher shows a neutral placeholder and the
  Sessions entry renders without count or previews. No failure copy or activity status is shown, and the Git destinations
  (Changes, Repository) are not rendered, so a cold load never flashes items that the settled
  metadata would remove.
- **Failure.** "Unable to load Specification information" is shown only after the Workspace
  request actually failed without a snapshot, with Retry wired to that query. A failed refresh
  keeps the last snapshot and marks it stale. A resource-wide HTTP 401, 403 or 404 suppresses
  any retained metadata. The wide location trail does not repeat the notice (the navigation
  owns it); the narrow header shows it under the screen's title because navigation is hidden
  there (a peer area has no line in its body).
- **Capabilities.** An explicitly unsupported (`not_implemented`) or forbidden Git source hides
  the Git entries; a settled `source_unavailable` remains unknown and keeps them (unknown is not
  absent). An unavailable document collection is never presented as an authoritative zero.
- A dedicated lightweight Runtime navigation endpoint remains a possible later optimisation, not
  a requirement.

### Authentication recovery boundary

Typed protected Runtime APIs share one decorated transport created in the application
services factory. `AuthApi` uses the undecorated underlying transport, preventing
recursive authentication recovery.

The application-owned `AuthRecoveryCoordinator` coordinates HTTP 401 revalidation,
single-flight requests and generation-based late responses. Safe reads are replayed
at most once after a valid session. Mutations never replay automatically.
Persistent 401 and resource-specific 403 remain errors rather than causing loops.
SSE errors revalidate the session without blindly restarting the stream.
Protected SSE subscriptions are bound to their opening authentication session:
a login/logout or confirmed identity change actively closes a stream, and
late events from the old identity are never yielded into the UI.

The application root owns Login/Runtime Unavailable navigation. Individual feature
routes must not refresh sessions or redirect after 401. TanStack Query retains
feature data when revalidation confirms the same identity, while logout and
identity changes isolate and clear previous-user cached data.

Feature APIs must not use raw `HttpClient.axios`, which bypasses application
recovery. It remains an exceptional, explicitly documented low-level escape hatch.

## Task workbench composition

The Full Task is the Task resource of its Specification: Task authoring, Now (the workflow
action projection), documents, context and dependencies in the Primary, and the attempt history
behind the header's history toggle ([Workflow execution](../product/specflow/ui/workflow-execution.md)). A Task read
without its resource is the unavailable state, never a partial page. The earlier snapshot-based
Task screen (human requirements and evidence, related resources, recovery, Task preview) is
not part of the current screen; it must be implemented as new functionality if needed. The Tasks feature
owns the detail/history queries; Nevo UI owns InformationList geometry and the measured split
capability. Task disclosure state and history scroll survive nested inspection and Back.

Operational lists reserve a leading rail only for a real affordance or a selectable
collection's shared axis. Text-only rows use InformationList's default control-height
minimum; actual controls retain their own height plus row padding. The leading box is anchored
at the row top (`InformationList.Leading` default `align="top"`). A decorative mark that
identifies a short row (a Session's provider mark beside its title and one line of facts, the
`inline` facts layout of `OperationalRow`) uses `align="center"`, a line-height box centred on the
row (owner, 2026-11-26); `align="first-line"` keeps such a mark on the first text line of content
that can run to many lines. Rows of many stacked lines (the Last hand-off, the tracked
`OperationalRow` layout, a timeline entry) keep their marks at the top. On wide rows,
metadata has a bounded content-sized rail (up to 18rem), leaving the primary/supporting
region flexible; on narrow rows it follows the content. Long metadata must never collapse
that region. Task history facts, purpose, transitions and feedback occupy separate blocks;
source availability also occupies its own block below Task identity.

Step context is opened at its owner: a ghost Details action inside a compatible human-step
Attention row, Step details beside active agent work, or Next step details beside known
next work. Terminal and unknown-next positions expose no fictitious active-step action.
There is no generic Step context footer. Flow remains in the work section menu.

A human-step inspection combines work and requirement only when specification, Task,
step, attempt (or unstarted next) and definition revision match. Both distinct instructions,
hints, blockers, previous feedback provenance, evidence and separately named work transitions
and requirement decisions remain reachable. Independently available requirements survive an
unavailable work source. Open inspections pin the snapshot revision; refresh shows a stale
context instead of silently substituting another attempt. Hints currently carry raw references
only, so their content is explicitly unavailable without typed resolution and an owning reader.

History has inline Attempt details per keyed record, including its own hints, resources and
provenance. A history document target uses Documents with the recorded revision and returns to
the expanded record, scroll and resource opener. History never borrows current work to fill a
historical gap. Historical inspect conditions, gate evidence and decision state are not part of
the current history read model and are described as unavailable. This does not add readers or
workflow mutations. Storybook promotion exercises the Full Task callback seam; canonical routing
and project reader availability remain separate integration concerns.

The dedicated Task Workspace stories exercise the revised workspace composition on
explicit fixtures, separately from the connected Full Task surface. Session links in
these stories open a clearly labelled, read-only Session Demo story in a new tab.
That development handoff carries the exact displayed fixture snapshot, including
session status, association and optional question; invalid snapshots remain unavailable.
It does not add a global Session client, production route, reader or workflow mutation.
The presentation accepts a real owner-supplied Session URL at the application boundary.
