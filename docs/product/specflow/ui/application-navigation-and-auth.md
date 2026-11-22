---
id: product.specflow.ui.application-navigation-and-auth
type: product
title: SpecFlow UI navigation, authentication and localization
status: current
scope: specflow
areas: [ui, security]
read_when:
  - changing login and guarded UI navigation
  - reviewing product menu, localization, account and accessibility
summary: >-
  Product routes, navigation shell, account/login recovery, localization, branding and keyboard-accessible product transitions.
related:
  - product.specflow.ui.application-architecture
  - architecture.ui.specflow-application-composition
  - product.specflow.ui.specs-overview
  - product.specflow.ui.interaction-model
  - product.shared.localization
---

# SpecFlow UI navigation and authentication

## Specifications list (Specs Overview)

`src/features/specs/overview/` owns the typed collection projection, product steering rows,
Current/Archive presentation, collection search, and loading/refresh/error composition. The
screen follows the [Specifications list](specs-overview.md) contract. Signal priority, concrete targets, human attention, and current
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
Creation is implemented ([Specification creation](../specification-creation.md)); Task execution
from the UI and archive/delete commands for Specifications are not.
Specification-local main views now use canonical child routes (Documents, Sessions, Git, Full Task). URL search carries validated collection and source/return context; legacy `?view=...` links only redirect to those routes.
Full Task has a canonical resource path rather than `?view=task&task=...`; legacy links redirect.
Full Task uses its own detail query and presentation model, and Workspace list membership is never
a prerequisite for direct navigation. A Task opened from the Overview (attention, activity) opens
the Full Task; there is no Task preview in the Secondary.
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

Product navigation starts with the Specification switcher (`SpecificationSwitcher`, with **Browse
all specifications** leading to the list). Within a selected Specification it shows that
Specification's views in this order: Overview, Sessions, Tasks (the Tasks page, also the parent
of a Full Task's Back), Documents, then Changes and Repository when Git is available
(`productNavigationModel.ts`).
Full Task is not a sidebar list page.

The Specification switcher wraps the current title. Switching retains the Current or Archive
collection and the Tasks, Documents or Sessions area when browsing that Specification. It opens
the destination area without carrying the previous Specification's filters or item selection.
Other routes open the destination Overview. Pending document edits use the existing leave guard.
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
- an authenticated session records password, or OIDC plus the concrete provider id;
- without required authentication the response also carries `localActorId`, the owner actor id the
  offline CLI records for the OS user the Runtime runs as (`local:<os-user>`; left out when the OS
  account has no user name).

Recorded people read as "you" for the viewer whichever channel recorded them: `user:<session user
id>`, the trusted local identity (`runtime:trusted-local`) and that `localActorId`. Anyone else is shown
by the recorded id without its `user:`/`local:` prefix. With required authentication a CLI action
(`local:<os-user>`) has no link to an authenticated user and is shown by its OS user name.

The browser UI never reads Runtime YAML to discover login methods.

Normal product execution is single-origin. `nevo-specflow start` serves the built SpecFlow UI at
`http://127.0.0.1:4318` by default and Runtime endpoints under `/api` on that same origin.
OIDC callbacks and browser redirects therefore use the same product origin users open in the browser.

The Runtime uses `@fastify/compress` to serve compressible built UI files as Brotli or gzip
when requested by the browser. Files produced by Vite under `/assets/` that contain a
content hash are cached for a year (`immutable`); other assets, `index.html` and
client routes use `no-cache`, so a new build is discovered on the next load.
Unknown paths under `/assets/` return 404 rather than the SPA HTML fallback.
Compression applies only to the UI, not to API responses or SSE. This reduces
transfer over slow links, for example from a phone connected to a workstation.

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
