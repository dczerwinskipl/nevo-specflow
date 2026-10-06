---
id: product.specflow.ui.application-architecture
type: architecture
title: SpecFlow UI application architecture
status: current
read_when:
  - adding a SpecFlow UI screen or route
  - deciding whether UI code belongs in the product app or Nevo UI
  - changing the product shell, localization, account menu, or brand composition
summary: >
  The SpecFlow UI composition root, routing, authentication and localization boundaries, reusable
  Nevo UI boundary, navigation/account composition, and intentionally minimal foundation screens.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.ownership-and-tooling
  - product.specflow.ui.interaction-model
  - product.shared.localization
---

# SpecFlow UI application architecture

`packages/specflow-ui/` is the product UI capability and React application composition root. It
owns SpecFlow copy, localization, brand assembly, routing, screens, frontend build output,
authentication UI, and product-specific interaction decisions. It consumes reusable mechanics from
`@nevo/ui` and remains part of the single local product composed by `@nevo/specflow`; it is not
an independently deployed `apps/*` host.

## Runtime composition

`src/app/router.tsx` owns the TanStack Router tree. The root itself is neutral because not every
surface belongs inside the application shell.

Standalone routes:

- `/login` renders authentication outside `AppShell`;
- `/runtime-unavailable` renders bootstrap/recovery outside `AppShell`;
- `/access-denied` renders explicit Specs forbidden failures outside `AppShell`.

A pathless application layout owns `SpecFlowShell` and guards product routes. It asks the Runtime
for `GET /api/auth/session` before entering the application. Required authentication redirects an
unauthenticated user to `/login` with a local `returnTo`; trusted local mode enters directly.
An authenticated visit to `/login` returns to the requested app surface. Failure to load Runtime
authentication state is a distinct bootstrap failure and routes to the recovery screen rather than
being treated as an unauthenticated user.

The current product routes under the guarded layout remain:

- `/` for the read-only Specs Overview (`?collection=current|archive`);
- `/specs/:specId` for the owning Specification, with `?collection=current|archive` as parent return
  context; the current increment is an explicitly labelled placeholder, not a Specification read API;
- `/ui-playground` for a directly routable development/integration screen, not a persistent product
  navigation item.

## Specs Overview increment

`src/features/specs/overview/` owns the typed collection projection, product steering rows,
Current/Archive presentation, collection search, and loading/refresh/error composition. The
screen follows the [Specs Overview contract](../../../ideas/specflow-ui/screens/specs-overview-ui-spec.md)
and its shared steering contract. Signal priority, concrete targets, human attention, and current
execution membership are supplied by the projection, not reconstructed from workflow lifecycle.

`SpecsOverviewSource` is the transport seam; its reader is abortable and scoped to the selected
collection. Refresh retains the last valid snapshot on failure, while a collection switch hides
the previous collection immediately and ignores late results. The default source calls
`GET /api/specs/overview?collection=current|archive` on the same Runtime origin. Runtime currently reads through a sample `SpecsOverviewRepository` adapter, not persistent repository/workflow state. The adapter is an implementation detail; the public response has no sample marker. Requests use the real authentication session and Runtime filters every item using server-owned `spec.view` scope. The shared TypeBox contract lives in `@nevo/specflow-contracts/specs/overview`.
Network/server failures display the unavailable state rather than silently falling back to fixtures.
A normalized 401 refreshes the authentication context and re-enters the existing login flow; a 403
renders the standalone Access denied screen. For Current, Runtime supplies ordered section IDs and one backend-owned classification per Spec. The feature mapper bounds rich evidence into row presentation without reclassifying it.
Development builds can still opt into isolated frontend fixtures using
`VITE_SPECFLOW_SAMPLE_DATA=true`; normal builds and dogfooding use the HTTP source.

The actual app supplies real Specification hrefs and router navigation to every Current and Archive
row, including Open specification in row overflow. Normal activation uses the router; modifier clicks
retain browser link behavior. The guarded `/specs/:specId` destination currently identifies only the
requested route identity and explicitly explains that documents, Tasks and Sessions are not implemented.
It does not claim the identity exists, fetch protected Specification detail, or invent workflow state.
Its Back link returns to the originating collection; direct entry defaults to Current. Task/Session
targets never replace the owning Specification destination. Creation and archive/delete mutations
remain unsupported. Isolated non-navigable component fixtures are not the production route contract.

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

Normal product navigation currently contains only Specs, also active while inside Specification.
Project Settings earns an entry when its real surface exists. UI Playground remains available by
direct URL for development, never as a persistent product entry.

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
