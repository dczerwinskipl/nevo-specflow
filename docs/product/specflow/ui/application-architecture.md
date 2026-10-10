---
id: product.specflow.ui.application-architecture
type: architecture
title: SpecFlow UI application architecture
status: current
read_when:
  - adding a SpecFlow UI screen or route
  - adding or changing remote data access, server-state, mutations, or application services
  - deciding how product navigation or route state is represented
  - deciding whether UI code belongs in the product app or Nevo UI
  - changing the product shell, localization, account menu, or brand composition
summary: >
  The SpecFlow UI composition root, routing, remote-data and authentication boundaries, reusable
  Nevo UI boundary, navigation/account composition, and application-level framework decisions.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.ownership-and-tooling
  - product.specflow.ui.interaction-model
  - product.specflow.ui.data-loading-and-integration
  - product.shared.localization
---

# SpecFlow UI application architecture

`packages/specflow-ui/` is the product UI capability and React application composition root. It
owns SpecFlow copy, localization, brand assembly, routing, screens, frontend build output,
authentication UI, and product-specific interaction decisions. It consumes reusable mechanics from
`@nevo/ui` and remains part of the single local product composed by `@nevo/specflow`; it is not
an independently deployed `apps/*` host.

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

- `features/tasks/` owns Full Task, Task Preview presentation, and Task-group/row controls.
  `features/specs/` owns Specification routing, Workspace composition and Secondary stack
  navigation. The existing aggregate Workspace projection remains an explicit migration seam.
- The existing backend `RuntimeFeature` is a separate composition boundary from `UiModule`.
  HTTP contracts connect those layers; neither UI modules nor plugins instantiate independent
  application HTTP transports or QueryClient lifecycles.
- Configuration of Git branch/push policy, Task lane/status settings, runtime module discovery,
  and dynamic third-party code loading are **out of scope**.

Task presentation is colocated under `features/tasks/pages`, Task Preview presentation under
`features/tasks/inspectors`, and the Work contribution under
`features/tasks/contributions/specification-work`. The aggregate Workspace data and actions
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

### Specification feature contributions (stacked migration)

The next UI composition increment, stacked on #45, adds two other **Specs-owned** extension
points without changing the generic registry:

- The previous `specification.views` tab registry is removed. Full Primary
  pages are owned by feature-specific TanStack Router routes, including
  Documents List, Full Document, Sessions List, Changes, Repository and Full Task.
  `/specs/:specId` is Specification Overview; old `?view` addresses redirect.
- `specification.attention.items`: Tasks, Sessions and Git select/present Runtime attention
  items, with feature-specific actions and icons. Specification owns the combined
  Requires Attention surface and preserves the order of the Runtime aggregate. Requests
  with no registered handler remain visible without an action instead of being dropped.

Git, Sessions and Documents own `specification.work.sections` contributions.
Their links navigate to canonical Primary routes or open contextual Secondary previews; they never
instantiate an independent Workspace HTTP client. `SpecificationSummarySection`,
`PreparationSection`, the attention container and Activity History remain host-owned
cross-feature coordination for now.

The host extension contexts still include transitional aggregate Workspace data and
semantic actions; the migration does not imply new per-feature backend endpoints,
dynamic plugin installation or independent React Query caches.

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

## Current implementation and migration state

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

Existing pre-Query request lifecycles are migration debt and MUST NOT be treated as architectural
precedent for new remote feature work.

The current product routes under the guarded layout remain:

- `/` for the read-only Specs Overview (`?collection=current|archive`);
- `/specs/:specId` for the owning Specification, with `?collection=current|archive` as parent return
  context; loads server state via TanStack Query and renders the Specification Workspace;
- `/specs/:specId/documents` and `/specs/:specId/documents/:documentId` for Documents List and Full Document;
- `/specs/:specId/sessions`, `/specs/:specId/changes`, `/specs/:specId/repository` for feature-owned pages (list data temporarily reads the Workspace projection);
- `/specs/:specId/tasks/:taskId` for Full Task detail, with the collection as optional return context;
  reads Task detail directly, independently of Workspace Task groups or Workspace read availability;
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

### Application services boundary (`SpecFlowServices`)

The browser/application-level HTTP transport (`HttpClient`) is created once at the application composition root.
Feature APIs are composed from this boundary via `SpecFlowServicesProvider` and `useSpecFlowServices()`:

- `SpecFlowServices` exposes `authApi`, `authStore`, `specsOverviewApi`,
  `specificationApi`, `taskApi` and `runtimeInfoApi`. The one shared `HttpClient` stays private
  to the composition root.
- `SpecificationApi` reads the Runtime Workspace endpoint, while feature-owned `DocumentApi` and `TaskApi`
  read their independent Detail endpoints through typed adapters and query keys.
  Both use the shared application HTTP client, and missing project-side sources produce
  explicit unavailable responses rather than browser fixtures.
- Storybook/test fixtures live under `test-support` and must not be imported by production UI.

Component code never instantiates ad-hoc transport clients and does not know arbitrary endpoint URLs.

### Server state via TanStack Query

`@tanstack/react-query` is the canonical server-state mechanism.
An application-level `QueryClient` is initialized at the composition root (`App.tsx`) via `QueryClientProvider client={defaultQueryClient}`.

- Server reads, caching, invalidation, loading, error, and mutation lifecycle are owned by TanStack Query.
- Query keys are defined canonically per feature (`specificationKeys`, `specsOverviewKeys`).
- Local UI state (active local view, selected task, inspector drawer open/close, dialog visibility) remains local React state.

### Separation of screen composition and presentation

Production screens (`SpecificationSurfaceConnected`) own data fetching, loading spinners, and honest error/unavailable states.
Presentational components (`SpecificationWorkspace`, `WorkView`, `TaskRow`, `DocumentsView`, `SessionsView`, `RepositoryView`, `ChangesView`, `FullTaskView`) receive structured data and callbacks via typed props:

- **No fixture fallback in production**: Production screens never fall back silently to fixture domain data (`dataProp ?? createFixture(...)`). When backend endpoints are unavailable, an honest unavailable state is displayed.
- **No fixture scenarios in route search**: Query parameters like `?scenario=...` are forbidden in production routes. Scenario-driven fixtures are restricted to Storybook and tests, including test-owned typed API adapters and network interception.
- **No fabricated domain logic**: Execution readiness, completion counts, file changes, and repository status are consumed as typed semantic fields from authoritative models, never fabricated by matching task IDs or parsing localized UI text.

## Specs Overview increment

`src/features/specs/overview/` owns the typed collection projection, product steering rows,
Current/Archive presentation, collection search, and loading/refresh/error composition. The
screen follows the [Specs Overview contract](../../../ideas/specflow-ui/screens/specs-overview-ui-spec.md)
and its shared steering contract. Signal priority, concrete targets, human attention, and current
execution membership are supplied by the projection, not reconstructed from workflow lifecycle.

The `SpecsOverviewApi` reads `GET /api/specs/overview?collection=current|archive`.
The Runtime owns overview classification, signal priority and scoped `spec.view` filtering.
Normal project mode never silently substitutes demonstration data; the operator can explicitly
start Runtime with `--demo`. `GET /api/runtime/info` is the source for the UI demo indicator.
The TypeBox contract belongs to `@nevo/specflow-contracts/specs/overview`.

Network failures display an unavailable state without a fixture fallback. HTTP 401 enters
session recovery; 403 produces the standalone access-denied experience. Refresh retains the last
permitted projection on transient failures; collection changes hide the previous collection.
The application provides real Specification URLs for Current and Archive records. The guarded
`/specs/:specId` route reads the Runtime Workspace projection and separately loads Markdown
documents and Task detail through real HTTP, while unknown sources remain explicitly unavailable.
Creation, execution and archive/delete commands are not implemented by this increment.
URL search still owns the remaining Specification-local main views pending their route migration.
Full Task has a canonical resource path rather than `?view=task&task=...`; legacy links redirect.
Full Task uses its own detail query and presentation model, and Workspace list membership is never
a prerequisite for direct navigation. Local Task Preview remains a Secondary inspection surface.
Local Secondary navigation and selection remain in local workspace state.

The login and Runtime-recovery screens are product-owned compositions on Nevo UI's
`StandaloneShell`. That shared shell owns the navigation-free application frame: AppBackground,
responsive header placement, the compact centered desktop WorkspaceSurface, the single mobile
header plus full-height workspace sheet, safe-area spacing, and scroll ownership. SpecFlow owns the
Nevo brand lockup, locale action, screen copy, authentication/recovery semantics, and form/actions.
It deliberately does not use `AppShell` or add a login-specific Card. OIDC instance names come
from the Runtime session contract; password login remains one capability regardless of the number
of configured password accounts.

Product screens compose `AppWorkspace`, `WorkspaceHeader`, and `AppContent` from Nevo UI. The
runtime workspace connects compact screens to AppShell's drawer navigation and owns responsive
surface behavior; `AppWorkspaceSlots` remains the static split-layout and Figma projection
contract. Nevo UI owns those reusable layout mechanics but knows nothing about routes, SpecFlow
navigation, localization catalogs, or product data.

The UI intentionally depends on `@nevo/figma-core` for neutral authoring/IR contracts and on
`@nevo/figma-capture` for opt-in React metadata used by the projection pipeline. Those dependencies
do not transfer product ownership into the generic Figma packages.

## Localization

`LocalizationProvider` wraps the router, so guarded application routes and standalone auth/recovery
routes share one active locale. SpecFlow UI uses `i18next` + `react-i18next`; translation data
lives in per-locale JSON catalogs under `src/i18n/locales/`.

Locale resolution, persistence, stable-key rules, and CLI/UI ownership are defined in
[Localization](../../shared/localization.md).

`@nevo/ui` remains localization-agnostic. SpecFlow translates labels before passing them to
`AppShell`, `AppWorkspace`, or other reusable component seams.

## Product navigation and account footer

`SpecFlowShell` owns the product navigation composition. Its layout has three structural regions:

Normal global product navigation contains Specs. Within a selected Specification it also
shows an expandable, non-navigating Specification folder, with Overview first, then feature-owned
Documents, Sessions, Changes and Repository quick links. Full Task is not a sidebar list page.
Project Settings earns a global entry when its real surface exists. UI Playground remains available
by direct URL for development, never as a persistent product entry.

1. a non-scrolling brand header;
2. a `min-height: 0`, flexible, vertically scrollable navigation body;
3. a non-scrolling account footer at the physical bottom of the navigation surface.

The account footer is not merely the last navigation item and must not scroll away when navigation
content grows. The same `ProductNavigation` composition is rendered in the desktop navigation rail
and inside AppShell's compact/mobile drawer. The footer includes bottom safe-area spacing for mobile
gesture areas.

The account trigger uses the effective user supplied by the Runtime session contract. Trusted local
mode shows the local identity but has no meaningless sign-out action. Authenticated sessions expose
sign out. Locale selection is available in both modes.

Signing out first invalidates the Runtime browser session, then explicitly navigates to `/login`.
Do not rely on an already-mounted protected route to rerun its `beforeLoad` guard automatically.

Because standalone auth/recovery routes intentionally do not render `AppShell`, their shared
standalone layout exposes the same locale selector separately.

## Authentication state

The Runtime session response is the UI source of truth. It explicitly distinguishes whether
authentication is required from whether a browser session is authenticated. This is necessary
because trusted local mode intentionally has an effective local user without a login flow.

Login methods are represented according to their actual semantics:

- password is a single enabled/disabled capability;
- OIDC is a list of named configured instances;
- an authenticated session records password, or OIDC plus the concrete provider id.

The browser UI never reads Runtime YAML to discover login methods.

Normal product execution is single-origin. `nevo-specflow start` serves the built SpecFlow UI at
`http://127.0.0.1:4318` by default and Runtime endpoints under `/api` on that same origin.
OIDC callbacks and browser redirects therefore use the same product origin users open in the browser.

When developing the UI package directly, Vite may run at `http://127.0.0.1:5173` and proxy
`/api` to Runtime on `http://127.0.0.1:4318`. Port 5173 is a development convenience only; it
is not the normal installed-product topology or the address users should open after
`nevo-specflow start`.

## Brand and tokens

The Nevo product-brand adapter lives under `src/brand/nevo/`. Shared semantic tokens remain owned
by Nevo UI; the application owns only the SpecFlow lockup, palette mapping, and product-specific
Figma resources.

## Interaction and accessibility

Navigation uses real links and router state. Interactive controls use semantic elements, visible
focus treatment, keyboard behavior, and accessible labels from Nevo UI contracts. Locale choices
use menu radio semantics rather than visually simulating selection with ordinary actions. Login
methods remain keyboard accessible, errors use semantic alerts, and busy controls are disabled and
expose `aria-busy`.

Screen changes MUST be reviewed at desktop and mobile widths and represented in the shared Storybook
when a stable screen state exists.

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

The present Runtime increment has a demonstration source and integration tests but does not
claim a completed project-side Specification read adapter. Multi-project and
multi-worktree ownership remain separate future capabilities.

Workspace refresh invalidates the Specification query prefix (snapshot, Tasks, documents and
changes) rather than only re-fetching the initial snapshot. A failed detail load exposes Retry.
The feature caches semantic lifecycle/status codes, not labels in a particular locale;
product presentation resolves those codes using the current i18next locale. A single
`recommendedSessionId` originates in Runtime; UI does not assume the first Session is preferred.

### Sidebar navigation read model

`ProductNavigation` reads a cached Specification title and small document-count/Git-availability projection from
an existing TanStack Query Workspace cache entry, using a disabled observer.
It does not issue `GET /api/specs/:specId/workspace` merely because the user
opened Full Task or Full Document directly. When the Workspace has not yet
been loaded, those optional navigation hints stay unknown (document count
is omitted; Git destinations are not hidden based on missing metadata).
This is a cache-only transitional adapter, not a second authoritative
read model. A dedicated lightweight Runtime navigation endpoint may replace
it if fresh sidebar metadata becomes a product requirement.

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
