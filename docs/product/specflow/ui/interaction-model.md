---
id: product.specflow.ui.interaction-model
type: product
title: UI interaction model
status: draft
read_when:
  - designing a UI screen, its navigation, or its back behavior
  - choosing between an inline surface, an inspector, a sheet, and a page
  - defining what state is preserved across navigation
summary: >
  Responsive shell with independent navigation and workspace breakpoints, the product
  hierarchy and routes, the reachability of every surface, starting a Session and the
  navigator, Back/Close semantics, and when to use floating, Secondary, pushed-detail, or
  full-workspace surfaces.
related:
  - product.specflow.ui.personas
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.specs-overview
  - product.specflow.ui.specification-overview
  - product.specflow.ui.full-session
  - product.shared.vocabulary
  - design-system.principles.ui-ux-guidelines
---

# UI interaction model

`status: draft` — working guidance, expanded as the code it governs lands. Screen-by-screen
contracts are filled in with the implementation.

## Interaction principles

- **Preserve context.** Drilling down keeps the user oriented; going back returns them
  to where they were, with scroll and selection intact.
- **Drill-down increases specificity**, not just volume — each level answers a more
  precise question.
- **Back follows the product hierarchy**, not raw browser history.
- **Do not expose the internal model as navigation.** Users navigate product concepts,
  not database entities or provider payloads.
- **A route is not automatically global navigation.** Full Session and Full Task can have stable
  product routes without earning persistent sidebar items. Task Preview and contextual inspectors
  remain local Secondary state; Full Task is the explicit main routed destination.
- **Preserve the current work context when possible.** Use Secondary or floating interaction for
  contextual exploration; use a main workspace route when the user explicitly promotes that context
  into their primary task.

## Responsive shell

Navigation collapse and workspace stacking are separate responsive decisions.

| Shell       | Navigation             | Workspace                                                                                                    |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Wide**    | Persistent navigation. | Primary + Secondary can be visible together.                                                                 |
| **Compact** | Drawer navigation.     | Primary + Secondary can still be visible together.                                                           |
| **Narrow**  | Drawer navigation.     | One workspace surface is visible at a time; active Secondary replaces Primary until Back returns to Primary. |

Do not equate "no persistent sidebar" with "mobile". Compact layouts can still support the full split
workspace.

The product hierarchy is identical across breakpoints. On narrow layouts, any information that would
otherwise exist only in a desktop Secondary needs an explicit affordance from the visible Primary
surface.

## Product terminology

Use **Nevo SpecFlow** for the product as a whole. The UI does not introduce a separate collective
brand or a separate Home/dashboard route.

Name product surfaces by their product concept, as the UI shows them (see
[Product vocabulary](../../shared/vocabulary.md#screen-names)): Specifications, Specification
overview, Task detail, Session, New specification. **Workspace** and its qualified meanings (a
checkout, the Workspace layout terms, the Workspace screen mode) are defined in the vocabulary; this
document uses them only in those meanings.

## Product hierarchy

The default product entry is the **Specifications** list at `/`
([Specifications list](specs-overview.md)). Specification overview owns `/specs/:specId`
([Specification overview](specification-overview.md)). Documents, Sessions, Changes and
Repository are feature-owned canonical Primary pages under that Specification, not tabs controlled
by `?view` (legacy `?view` URLs redirect). They do not become global product areas.

TanStack Router owns routable Primary surfaces. Nevo UI Secondary Stack owns contextual
Task/Document previews, independent from URL search state. Promoting a preview to Full is an
explicit Primary route navigation: short Task Preview in Secondary, explicit Full Task at
`/specs/:specId/tasks/:taskId`. A Full Task deep link reads the Task by ID through the authenticated
Runtime detail API, not through the Workspace Task collection. Specification overview shows its
Activity history in the Secondary, open by default only when the history has entries
([Specification overview](specification-overview.md#activity-history)).

```text
Project
├── Specifications                        default entry; Current / Archive are collection views
│   └── Specification overview            /specs/:specId
│       ├── Documents, Sessions, Changes, Repository   Primary pages under the Specification
│       ├── Task Preview                  contextual Secondary
│       └── Full Task                     /specs/:specId/tasks/:taskId
└── Session                               /sessions/:sessionId, top-level route
    └── Secondary local inspector         Context (default on split entry) and user-selected detail
```

A Session is owned by its Specification in the product (every UI start is from a Specification),
but its route is top-level: `/sessions/:sessionId`, with the owning Specification resolved from the
Session's association read (see below; the nested `/specs/:specId/sessions/:sessionId` only
redirects there). Sessions are not a global sidebar area. That the navigator recovers the
Specification only from the association, and has none for a standalone Session, is an
[open finding](shell-geometry.md#open-findings-for-later-work).

Global navigation is deliberately small: the Specification switcher (with **Browse all
specifications**) and, inside a Specification, its views (Overview, Sessions, Tasks, Documents,
Changes, Repository). Project Settings earns a global entry once its real surface exists.
UI Playground is development-only direct navigation.

Every Current/Archive row of the Specifications list is a real link to `/specs/:specId`. The
Specification destination is connected to the Runtime read API; Documents and Task details use typed
projections, and absent project read sources are shown as unavailable rather than fabricated
content.

Changes, pull requests, documentation, files, Work details, and similar concepts are contextual
surfaces until a proven independent human task justifies promoting them into global navigation.

Within a Session ([Full Session](full-session.md)):

```text
Session conversation Primary
└── Secondary local inspector
    ├── Context                     default on split-capable entry, pinned tab
    └── user-selected detail        Task / Work / future File, Handover, artifact
```

Secondary changes because the user explicitly opens something. Normal agent activity must not
replace what the user is currently inspecting.

A Session reference opens the Session (`/sessions/:sessionId`). A Wide-only Floating Session that
keeps the current Specification/Task context visible is a target presentation, not implemented;
Compact/Narrow always open the Session directly, with no miniature floating replacement.

## Reachability

| Surface                   | Normal entry                                                                                          | Representation                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Specifications            | default entry `/`; **Browse all specifications** in the switcher                                      | Primary                                                   |
| Specification overview    | a Specifications row, the switcher, or its stable route                                               | Primary                                                   |
| Task Preview              | a Task row in the Specification                                                                       | Secondary on split layouts; pushed local detail on Narrow |
| Full Task                 | explicit promotion from Preview, or its stable route                                                  | routed Primary                                            |
| New Session               | the Specification's Sessions list, its empty state, Continue session, the preparation block           | routed Primary (`/specs/:specId/sessions/new`)            |
| Session (Full Session)    | a Session row or Continue session, Create with an agent (demo mode only), a stable route              | routed Primary + Secondary                                |
| Session Context           | default on split-capable Session entry; the **Context** action on Narrow                              | Secondary or pushed local detail                          |
| Session inspection detail | an explicit click on a Work block, a Related Task or another Context row (the Task tab is a stand-in) | a tab or the active tab's local stack; never a third pane |

The table defines reachability. A product row keeps a stable neutral destination: a Specifications
row always enters its Specification and never deep-links to whichever Task or issue currently has
the highest priority; status prose inside the row is not a link. Opening a Task Preview is
inspection only and performs no workflow action.

## Starting a Session and the navigator

Every UI start of a Session is from a Specification. **New session** opens
`/specs/:specId/sessions/new` from the Specification Sessions list toolbar, its empty state,
Continue session's header menu and the Overview's preparation block, gated by the workspace
`actions.startSession` (shown when available or with `no_provider`; omitted with `forbidden` or
`sessions_disabled`), and posts the composed `POST /api/specs/:specId/sessions`, which records the
association. There is no UI entry to a standalone Session: the Specifications list has no create
session action, and `/sessions/new` opened directly redirects with `replace` to `/` without a toast.
Existing standalone Sessions stay reachable by direct link; their Context and navigator show no
Specification. The start screen itself is specified in [Full Session](full-session.md).

On `/specs/:specId/**` the navigator shows that Specification. On `/sessions/:sessionId` the active
Specification is the home `specId` of the Session's association read when it is `available`, with
**Sessions** active; while the association loads, and for `standalone`, `forbidden`, `missing` or
`unavailable`, no Specification section shows. There is no "last opened Specification" cache. The
Specification's Session preview comes from the workspace Sessions section (first three
`active`/`attention` rows, attention first); its active count shows only when the section has no
`hasMore` and no row of status `unknown`, otherwise a partial-activity line says so. **All
sessions** opens the [Specification Sessions list](specification-sessions.md) `/specs/:specId/sessions`.

## Surface choice

| Surface                  | Use for                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Info / tooltip / popover | A short clarification; no navigation, no actions of substance.                                                  |
| Floating surface         | Quick interaction with related context, especially a Session, without abandoning the current workspace.         |
| Secondary                | Contextual detail that supports the Primary without replacing its product context on split layouts.             |
| Pushed / stacked detail  | Narrow representation of Secondary: it becomes the visible workspace surface and provides an explicit way back. |
| Main page / workspace    | A distinct product surface the user explicitly navigated/promoted to.                                           |

## Specifications list

The list's sections, row anatomy, search and layout-follows-the-data rule are specified in
[Specifications list](specs-overview.md).

## State preservation

The router/URL owns main product navigation. Local Workspace Secondary state is intentionally not part
of the URL contract.

Preserve local selection, scroll, disclosure, and in-progress composer text while the relevant
component state remains alive where practical, but do not require browser navigation to serialize a
Task/detail inspector stack.

On Narrow, browser/system Back may first pop the active local pushed-detail stack before delegating
to router history. This keeps physical Back natural without turning Secondary into a route.

Deep links address stable main product resources. Raw provider/runtime identifiers must not define
navigation semantics merely because they exist internally.

Reload or direct URL entry reconstructs the routed surface, not the previous Secondary stack.
Returning from a Session goes back through router history to the previous routed surface; the
product does not promise to restore a Task or other Secondary selection there.

## Back and Close

Product Back inside Secondary follows the local inspection stack:

- a dependent detail Back returns to its parent in the same tab or stack (for example ToolAction to
  Work history, a Task to the Tasks list it was opened from);
- Task Preview Back/Close returns to the owning Primary;
- a tab is closed explicitly; Context stays pinned and is never closed as a tab;
- closing the whole Secondary returns to the owning Primary and does not reset it.

Browser/system Back normally follows router history. On **Narrow**, when a local pushed Secondary
stack is active, the product first lets that stack pop or close before leaving the routed surface;
the URL still represents only the Primary route. This uses router/history integration that keeps
normal browser semantics; Secondary does not become a URL-addressable route.
