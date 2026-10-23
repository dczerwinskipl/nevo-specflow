---
id: design-system.implementation.react.secondary-navigation
type: engineering
title: Secondary navigation
status: current
read_when:
  - adding a contextual Secondary inspector to a workspace
  - navigating between nested inspector screens
  - debugging data refreshes, remounts or default Secondary behavior
summary: >
  Product-neutral in-memory Secondary screen catalogues and lifecycle, distinct from route navigation.
related:
  - design-system.principles.system-boundary
  - product.specflow.ui.interaction-model
---

# Secondary navigation

Secondary navigation is an ephemeral in-memory **single active flow**. It is not an application router.
Product routes remain owned by the application router. This is not the global navigation Drawer.

## Ownership

- `AppWorkspace.Primary` renders the main work surface.
- `AppWorkspace.Secondary` is the optional declarative base shown on split-capable layouts.
- A runtime Secondary flow temporarily takes precedence over the declarative base.
- `AppWorkspaceProvider` owns one active flow and its array of page descriptors. Pass `scopeKey={specId}` (or the owning route identity) when the provider stays mounted while the route context changes; a changed scope clears the transient flow immediately.
- Feature code defines available pages in `defineSecondaryStack`, usually in a separate module.
- A page descriptor contains a page name, small page-specific identifiers and an instance key. Do not store React elements or cached domain snapshots in navigation state.
- `useData(rootParams)` resolves current data **once per mounted entry** in a stable host; the header and content consume the same result. A refresh updates rendered props without a navigation transition.
- The pure `secondaryNavigationModel.ts` handles start/push/replace/pop and stale-entry invariants; the provider owns async guards, focus, scheduling and presentation.

## Consumer API

Define a catalogue outside the Primary React component, alongside its screen modules. The
Primary imports only the catalogue and calls `open`; the screen itself imports only the
navigation hook and its page types. The stack does not require an additional feature-owned
React Context. The public declaration is in `@nevo/ui`.

```tsx
interface TodoPages {
  details: Record<never, never>;
  history: Record<never, never>;
  event: { eventId: string };
}

const todoStack = defineSecondaryStack<{ id: string }, Todo, TodoPages>({
  id: 'todo',
  initial: 'details',
  useData: ({ id }) => useTodoSidebarData(id),
  screens: {
    details: { title: 'Todo', component: TodoDetails },
    history: { title: 'History', component: TodoHistory },
    event: { title: 'Event', component: TodoEvent },
  },
});

// In a Primary list or any descendant of AppWorkspaceProvider:
const navigation = useSecondaryNavigation();
void navigation.open(todoStack, { id: todo.id });

// Inside a registered Todo screen:
const stack = useSecondaryStack<TodoPages>();
void stack.navTo('history');
void stack.navTo('event', { eventId });
void stack.back();
void stack.close();
```

`open` always discards the prior flow and starts from its registered initial page.
`navTo('history')` pushes a page inside the current catalogue. Alternatively,
`navTo(changesStack, { id: changeId })` pushes the **initial screen of another module**
without discarding the current flow. Back then returns from File to Changes to Task,
even when the three modules use independent data subscriptions.
`replace` changes only the top page within its current catalogue.
`back` pops a page, and on the root closes the runtime flow.
`close` clears the runtime flow. Asynchronous callbacks from disposed screens cannot operate
on a newer flow.

`AppWorkspace secondaryCloseBehavior="page"` makes the host's Close control return from the active
page to its parent, or close the flow when already at its root. Use it for workspace readers whose
Close means returning to the source surface. The default `"flow"` retains whole-flow Close.
This changes only the host control; explicit `useSecondaryStack().close()` still clears the flow.

A screen may declare an optional `header` component in its definition. The screen
catalogue also declares `actions: ({ data, params }) => WorkspaceHeaderAction[]` and optionally
`actionLabels`. The action declaration is **pure** (no hooks, no side effects) and uses
the same live `useData` result as Header and Content. A custom Header receives only
`{ data, params }` and renders **product content only**, for example a
`WorkspaceHeaderIdentity` with title, status and subtitle. It must not render its own
`WorkspaceHeader`, Back/Close, or duplicate page actions. `AppWorkspace` automatically
renders the shared header frame and injects actions in both desktop and collapsed mobile
without requiring custom headers to forward props or inspecting React elements.

`AppWorkspace` continues to own the system Back/Close controls. When the mobile header
scrolls out of view, the entire declared action set moves to the floating overflow menu;
system Back stays outside it and Close may appear alongside the product actions.
Actions are unavailable while `useData` is not `ready`, avoiding stale callbacks after data
loss. Default Secondary retains its independent declarative header.

For ordinary **application route changes**, the application router's blocking adapter must
await `useSecondaryNavigation().canLeaveScope()` _before_ committing navigation. This
checks the active page's leave guard but does not change the Secondary stack. Once
the route transition has been approved, changing the provider's `scopeKey` invalidates
its flow. Forced context invalidation (logout, revoked global permissions, destroyed
workspace scope) intentionally bypasses leave guards and removes the flow.
Do not treat the `scopeKey` change itself as an ordinary guarded user navigation.
Browser/system Back implementation belongs in that router adapter, not inside feature screens.

`useSecondaryLeaveGuard` optionally registers a guard for the active page. Navigation checks
the guard before replacing, popping or closing that page; denied transitions leave the state intact.
For an editable screen with a local draft, opt into `preserveOnDataLoss: true` in its
screen definition. Once ready, the screen and its leave guard remain mounted but
hidden/inert during temporary `loading` or `error`, with a visible status message.
`unavailable` represents a confirmed missing entity; `access-denied` represents lost
permission. Both always dispose the screen and its local draft, regardless of this
flag. The feature still owns its authoritative data and permission invalidation;
it must map confirmed authorization loss to `access-denied` rather than a generic
network error. Hidden/inert is not an acceptable protection for revoked data.

This retention option applies **only to the current screen**. After Back, earlier
entries retain identifiers but can remount. If scroll, filters or an unsaved form must
survive Back, the product should explicitly own that state outside the unmounted page,
scoped to the flow. Full offscreen React subtree retention is intentionally deferred.
Avoid synchronizing two owners of the Secondary with effects in product screens.

## Refresh and missing data

The screen host always invokes the stack's `useData` hook while active.
Do not call navigation operations when data changes. `useData` MUST be a normal React hook
whose identity remains stable within one registered stack (TanStack Query, store subscriptions,
or equivalent). The optional header and screen consume one resolved result from an internal host,
not separate hook calls. Use a pure subscription or stable data hook: no data snapshots
in navigation entries.
Do not define screen components or hook factories inside a rerendering React component.
Its discriminated result is one of `loading`, `ready`, `unavailable`, `error` or `access-denied`.
The `loading` member accepts optional `presentation?: ReactNode`, supplied by the product's
`useData(rootParams)` from its existing data/fetch state. Undefined retains the default host loading
notice; an explicit null renders no notice. A supplied presentation owns its copy and single loading
status, so the host does not add another status. It never mounts the ready screen with missing data.
Header Back/Close, action readiness and `preserveOnDataLoss` retain their existing behavior.
No result automatically navigates away. Ordinary refetches should retain a `ready` result when
the previous usable data remains available, then update the `data` prop.

Keep IDs in root/page navigation params. Resolve nested events/files against **current** data in
the owning screen; their absence should show an unavailable state, not stale snapshots.
An entity missing from a filtered list is not necessarily deleted from its authoritative source.

The identity of the active React page is independent of refreshed data. A new page navigation
may remount screens; an ordinary data update must not.

## Presentation

AppWorkspace owns the responsive split/stacked choice and automatic header controls.
On Narrow, the active runtime Secondary replaces visible Primary and Back occupies the navigation
position instead of the global hamburger. On desktop/split, Back and Close are provided by the
workspace header. Default Secondary is not part of the runtime page stack.

Browser history/Back interception and serialization of transient pages are **out of scope**.
The current implementation preserves the mounted active page across ordinary `ready`
refreshes. Without `preserveOnDataLoss`, non-ready states replace the screen content
and can discard its local draft or leave guard. `access-denied` and `unavailable`
always unmount current content, even if retention is enabled. A previous screen reached via Back is
mounted afresh unless the product stores its state outside that component. This prototype
does not persist offscreen screen-local state or intercept browser/system Back.

Stack catalogue types constrain `navTo` for each declared set of pages, but the generic
`useSecondaryStack<TPages>()` parameter is currently asserted by the caller and is
not tied statically to its rendered catalogue. The runtime rejects unknown screen names.
Do not claim full end-to-end catalogue-type inference.

## Agent checklist

1. Read this document and `design-system.implementation.react.component-guidelines`.
2. Keep feature stack catalogue, screen components, and Primary list in separate modules when substantial.
3. Open with the root entity ID from Primary, not with a React node or stale domain object.
4. Use `navTo(page, { childId })` for contextual depth. Read the current entity from `useData`.
5. Treat missing nested records as a screen state, not navigation.
6. Render no custom Back or Close button when the workspace already provides the action.
7. Add Storybook interaction cases for root replacement, Back/Close, refresh without remount,
   and unavailable entities. Confirm narrow stacked and wide split.
8. Do not call removed `setSecondary/pushSecondary/popSecondary/closeSecondary` APIs.

## Verification

The canonical Storybook examples in
`packages/nevo-ui/src/app/workspace/examples/SecondaryStackExample.stories.tsx`
and `CrossFeatureNavigationExample.stories.tsx` exercise deep Todo navigation,
Task → Changes → File across independent modules, scoped invalidation, refresh
without remounts, unavailable nested events/root entities and mobile Back.
`SecondaryHeaderActionsExample.stories.tsx` verifies declarative Save/Refresh/Open full view
actions on desktop and collapsed mobile headers.
`WorkspaceContext.contract.stories.tsx` covers a shared header/body data source,
retention of a hidden editable draft during temporary failures, and its disposal on revoked access. The CRM example provides an independent
consumer. Keep every legacy runtime-node navigation API removed from code, tests and exports.

## Cross-feature composition

Independent modules export their screen catalogues (or factories) and accept only the
navigation capabilities they need. Wire Task → Changes → File at the application
composition root rather than importing all modules into one catalogue; use lazy
callbacks for cyclic connections if necessary. Do not add a global registry or
new feature contexts simply to navigate between these modules.

The public generic `useSecondaryStack<Pages>()` currently relies on the caller's
asserted page type, as noted above. Keep the runtime unknown-page check; complete
static catalogue coupling is a separate follow-up, not a prerequisite for this flow.

### Measured split capability

Products can call the public `useWorkspaceCapabilities()` inside the shell to read
`supportsSplit`. It uses the same measured available workspace width and threshold
as `AppWorkspace`, including a narrow workspace in a wide browser window. Use it to
expose an overflow entry for a default Secondary surface on stacked layouts. Do not
import shell internals or derive this decision from browser width.

Secondary content that establishes an inline-size container must declare its supported
content width (for example `w-content-standard max-w-full`) and use `AppWorkspaceBody`
for scrolling. An intrinsic-width surface cannot measure content through size containment.

Use `AppWorkspaceBody scroll="area"` for the shared `ScrollArea` edge indicators and
viewport on a desktop surface. On stacked layouts the host already owns `ScrollArea`;
the body then contributes content and padding without nesting another scroll viewport.
In `scroll="area"` mode `className` styles the ScrollArea root; refine the padded content box with
`contentClassName` (merged after the `padding` preset, for example `padding="md" contentClassName="py-6"`)
instead of wrapping the content in an extra padding element.

### Workspace width fit

`AppWorkspace fit` decides how wide the workspace is in split-capable (Wide/Compact) layouts.
Stacked layouts always fill the available width, whatever the value. The resolution lives in
`resolveWorkspaceFit` (`workspaceSizing.ts`) and is covered by `workspaceSizing.test.ts`.

| `fit`               | Primary only                                        | Primary + Secondary                                                 | Use for                                                                       |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `content` (default) | fills the available width                           | fits intrinsic content (`max-content`), centred with the navigation | ordinary pages; unchanged default                                             |
| `available`         | fills                                               | fills; the split shares follow `split`                              | editors, creation flows and other surfaces that should use all measured space |
| `bounded`           | fits intrinsic content, centred with the navigation | fits intrinsic content                                              | Primary-only collection pages whose readable unit has a fixed optimal width   |

With `bounded`, the Primary must declare its width (for example
`<AppContent className="w-content-standard max-w-full">`); the workspace then shrinks to that
width and `AppShell` centres navigation and workspace as one group, so header actions stay next to
the content they act on at wide and ultrawide sizes. A Primary without a declared width has no
intrinsic bound and behaves like `content`. Do not combine `bounded` with ad-hoc `max-w-[…]` or
centring wrappers. `AppWorkspaceFit.contract.stories.tsx` covers the three values (`Available*`, `Content*`,
`BoundedPrimaryOnly*` contracts at 1024/1440/1920/2560 and 390).

The shell-owned workspace surface has an edge border (`border-l`, plus `border-r` when inset). `AppShell`
publishes two widths through the workspace context: `availableWidth` (the surface border-box, which decides
split/stacked mode and the dominance thresholds) and `contentWidth` (`availableWidth` minus
`APP_WORKSPACE_EDGE_BORDER` per border, `resolveWorkspaceContentWidth`), which the Primary/Secondary max
widths are computed from, so a Secondary never exceeds the surface content box by the border width.
Never compensate with a `-1px` on a region. The `SecondaryFitsSurface*` contracts cover 1280-1600.

### Bounded content scrolling

`AppWorkspace` defaults to `scroll="workspace"`, retaining the mobile host-owned scrolling
described above. Use the explicit `scroll="content"` opt-in for a workspace whose regions contain
bounded editors, composers, or readers with fixed controls. This applies to Primary, declarative
Secondary, and runtime Secondary pages in that workspace; it does not change split proportions,
navigation, or the Secondary lifecycle.

In content mode the mobile host keeps its header and system Back/Close controls fixed and provides
a height-constrained content region instead of an outer `ScrollArea`. The content owns scrolling:
use `AppWorkspaceBody scroll="area"` for an ordinary reader, or the editor's own scroll viewport.
Keep file identity, toolbars, save actions, and composers outside that viewport. Flex/grid ancestors
must retain `min-height: 0` and the content must fill the available region. A native read-only
scroll region also needs keyboard access. Do not recreate a second outer product scroll container.

Content mode does not install `AppContentScrollProvider` on mobile, so `AppWorkspaceBody` retains
its own bounded scrolling behavior. The mobile floating action replacement is unnecessary because
the shared header remains visible. Default workspace mode and its scrolling header/floating actions
remain unchanged. `AppWorkspaceScroll.contract.stories.tsx` verifies a 320×740 editor, fixed controls,
internal scrolling, and preservation of the default mobile scroll owner.

### Anchors under the floating navigation row

In stacked (mobile) mode the in-flow header scrolls away and the fixed floating navigation row overlays
the top of the same scroll viewport. `AppWorkspace.css` owns that zone with two custom properties, so no
page ever computes pixel offsets:

- `--workspace-overlay-top`: where the row sits (`max(0.75rem, env(safe-area-inset-top))`), used by
  `.mobile-floating-navigation { top }` and the scroll area.
- `--workspace-overlay-inset-top`: row top + default control height + 0.5rem, set on
  `.mobile-workspace-scroll-area` and applied as `scroll-padding-top` of `.mobile-workspace-scroll`.

`scrollIntoView`, `#hash` navigation and focus scrolling honour `scroll-padding-top`, so targets
(for example `#tasks-heading`) land below the row (WCAG 2.2 2.4.11 Focus Not Obscured). Products only
provide an `id`/focusable target and keep calling `scrollIntoView({ block: 'start' })`; there is no
per-target marker attribute and no `scroll-margin-top` is required. Descendants that need the zone
(for example a sticky element inside the page) can read `var(--workspace-overlay-inset-top)`.
The properties do not exist in split/desktop mode or in `scroll="content"` workspaces, which have no
overlay. `AppWorkspaceScroll.contract.stories.tsx` verifies 390 and 320 (including `#tasks-heading`
through `location.hash`) and a safe-area override.

### Header actions

`WorkspaceHeader` (and the Secondary header, through the same `WorkspaceHeaderFrame`) takes
`actions: WorkspaceHeaderAction[]`:

```ts
{ id, label, primary?, disabled?, tone?: 'neutral' | 'danger', onPress,
  icon?: IconGlyph,
  presentation?: 'button' | 'icon',      // 'icon' requires `icon` (type-enforced): IconButton sm + Tooltip(label)
  direct?: 'wide' | 'always' | 'never',  // default: primary -> shown directly, everything else -> 'never'
  pressed?: boolean,                     // icon actions only: toggle state, see below
  group?: 'display' | 'actions',         // complete menu only: section, default 'actions'
  checked?: boolean,                     // menu toggle state (trailing check); falls back to `pressed`
  shortcut?: string }                    // trailing hint in the menu row, e.g. 'Ctrl+S'
```

- Budget: **2 direct actions on wide headers, 1 on narrow**; the rest go to the `•••` menu in input
  order. A `tone: 'danger'` action is never direct. When more actions qualify than the budget allows,
  `direct: 'always'` wins, then the `primary` action, then `direct: 'wide'` in input order. Direct actions
  render in input order with the filled `primary` last.
- "Narrow" is the **measured** width of the header frame (`WORKSPACE_HEADER_NARROW_MAX_WIDTH`, 384px,
  `ResizeObserver`, `data-workspace-header-density`), not a CSS-only query, because menu membership depends
  on it and menus portal outside any container query. A direct text `primary` with an `icon` collapses to
  an icon-only button on narrow headers (as before, now driven by the measured density).
- A menu action that moves focus itself (for example mounts an inline input) sets
  `onMenuClosed: () => void`. The menu then does not return focus to the `•••` trigger; it calls the
  handler once it has closed and no longer traps focus, so the consumer needs no timers or retakes.
- An icon action's `label` is its accessible name and its tooltip (also on keyboard focus).
- The stacked floating row (`compact` density) lists **all** actions in `•••`, a superset of the in-flow
  header (which is `inert` while covered), so nothing is exposed twice.
- **Icon toggles.** `pressed` on an icon action renders `aria-pressed` on the `IconButton` (absent when
  `pressed` is undefined) and a subtle `bg-surface-selected` state. The icon and label keep naming the
  action, never the state. In the menu the same action is a `menuitemcheckbox` whose check sits in the
  trailing slot (`checked`, or `pressed` when `checked` is not set).
- **Complete menu.** `menu="complete"` on `WorkspaceHeader` / `WorkspaceHeaderFrame` (and the header read by
  `CompactWorkspaceActions`) makes the `•••` menu list **every** action, promoted ones included (same id
  and label; the duplication is intended and carries no marker). Rows are split into DS `MenuGroup`s with
  `MenuLabel`s, `display` (options and toggles) above `actions`, joined by one `MenuSeparator`; an empty
  group renders nothing. Section labels come from `labels.menuDisplay` / `labels.menuActions` (default
  `Display` / `Actions`); `shortcut` shows only where provided. The direct budget, one primary last and
  never-direct danger are unchanged. The default (`menu="default"`) keeps the overflow-only menu.
- `resolveWorkspaceHeaderActions(actions, 'wide' | 'narrow' | 'compact')` is the pure resolver
  (`true`/`false` still mean compact/wide). Document view: `[{ id: 'edit', icon: 'edit',
presentation: 'icon', direct: 'always', ... }]`; edit: `[preview (icon, direct: 'wide'), save (primary,
direct: 'always'), discard]` -> wide `[eye][Save][•••]`, narrow `[Save][••• Show preview, Discard]`.
