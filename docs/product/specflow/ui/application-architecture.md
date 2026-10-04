---
id: product.specflow.ui.application-architecture
type: architecture
title: SpecFlow UI application architecture
status: current
read_when:
  - adding a SpecFlow UI screen or route
  - deciding whether UI code belongs in the product app or Nevo UI
  - changing the product shell or brand composition
summary: >
  The SpecFlow UI composition root, routing and authentication boundary, reusable Nevo UI
  boundary, and the intentionally minimal foundation screens.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.ownership-and-tooling
  - product.specflow.ui.interaction-model
---

# SpecFlow UI application architecture

`packages/specflow-ui/` is the product UI capability and React application composition root. It
owns SpecFlow copy, brand assembly, routing, screens, frontend build output, authentication UI, and
product-specific interaction decisions. It consumes reusable mechanics from `@nevo/ui` and remains
part of the single local product composed by `@nevo/specflow`; it is not an independently deployed
`apps/*` host.

## Runtime composition

`src/app/router.tsx` owns the TanStack Router tree. The root itself is neutral because not every
surface belongs inside the application shell.

Standalone routes:

- `/login` renders authentication outside `AppShell`;
- `/runtime-unavailable` renders bootstrap/recovery outside `AppShell`.

A pathless application layout owns `SpecFlowShell` and guards product routes. It asks the Runtime
for `GET /api/auth/session` before entering the application. Required authentication redirects an
unauthenticated user to `/login` with a local `returnTo`; trusted local mode enters directly.
An authenticated visit to `/login` returns to the requested app surface. Failure to load Runtime
authentication state is a distinct bootstrap failure and routes to the recovery screen rather than
being treated as an unauthenticated user.

The current product routes under the guarded layout remain:

- `/` for the foundation home screen;
- `/ui-playground` for a product-owned component/workspace integration screen.

The login screen is product-owned and composes existing Nevo UI fields, password input, buttons,
alerts, separators and typography. It deliberately does not use `AppShell` or add a login-specific
Card. OIDC instance names come from the Runtime session contract; password login remains one
capability regardless of the number of configured password accounts.

Product screens compose `AppWorkspace`, `WorkspaceHeader`, and `AppContent` from Nevo UI. The
runtime workspace connects compact screens to AppShell's drawer navigation and owns responsive
surface behavior; `AppWorkspaceSlots` remains the static split-layout and Figma projection
contract. Nevo UI owns those reusable layout mechanics but knows nothing about routes, SpecFlow
navigation, or product data.

The UI intentionally depends on `@nevo/figma-core` for neutral authoring/IR contracts and on
`@nevo/figma-capture` for opt-in React metadata used by the projection pipeline. Those dependencies
do not transfer product ownership into the generic Figma packages.

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
focus treatment, keyboard behavior, and accessible labels from Nevo UI contracts. Login methods
remain keyboard accessible, errors use semantic alerts, and busy controls are disabled and expose
`aria-busy`.

Screen changes MUST be reviewed at desktop and mobile widths and represented in the shared Storybook
when a stable screen state exists.
