---
id: product.specflow.ui.interaction-model
type: product
title: UI interaction model
status: draft
read_when:
  - designing a UI screen, its navigation, or its back behavior
  - choosing between an inline surface, an inspector, a sheet, and a page
  - defining what state is preserved across navigation
  - choosing an icon for a product concept, or naming a page in its header and trail
  - choosing typography, action emphasis, colour, spacing, containers or disclosure on the
    Specification Overview, the Task page or a Session
summary: >
  Responsive shell with independent navigation and workspace breakpoints, the product
  hierarchy and routes, the reachability of every surface, starting a Session and the
  navigator, Back/Close semantics, page identity and the product icon dictionary, the shared visual
  conventions of the Specification, Task and Session screens, and when to use floating, Secondary,
  pushed-detail, or full-workspace surfaces.
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
  product routes without earning persistent sidebar items. Contextual inspectors remain local
  Secondary state; Full Task is the routed destination of every Task link.
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
Document previews, independent from URL search state; promoting one to Full is an explicit
Primary route navigation. A Task opens at `/specs/:specId/tasks/:taskId` (there is no Task
preview, owner decision 2026-11-16). A Full Task deep link reads the Task by ID through the authenticated
Runtime detail API, not through the Workspace Task collection. Specification overview shows its
Activity history in the Secondary, open by default only when the history has entries
([Specification overview](specification-overview.md#activity-history)).

```text
Project
├── Specifications                        default entry; Current / Archive are collection views
│   └── Specification overview            /specs/:specId
│       ├── Documents, Sessions, Changes, Repository   Primary pages under the Specification
│       ├── Tasks                         /specs/:specId/tasks (optional ?blocking or ?group filter)
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

| Surface                   | Normal entry                                                                                                                                                                      | Representation                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Specifications            | default entry `/`; **Browse all specifications** in the switcher                                                                                                                  | Primary                                                   |
| Specification overview    | a Specifications row, the switcher, or its stable route                                                                                                                           | Primary                                                   |
| Tasks page                | the navigator's Tasks, the Overview's **All tasks**; filtered: "Show N more tasks: <group>" and the compact group links (`?group=`), **Review tasks** (`?blocking=specification`) | routed Primary                                            |
| Full Task                 | a Task row, attention or activity item of the Specification, or its stable route                                                                                                  | routed Primary                                            |
| New Session               | the Specification's Sessions list, its empty state, Continue session, the preparation block                                                                                       | routed Primary (`/specs/:specId/sessions/new`)            |
| Session (Full Session)    | a Session row or Continue session, Create with an agent (demo mode only), a stable route                                                                                          | routed Primary + Secondary                                |
| Session Context           | default on split-capable Session entry; the **Context** action on Narrow                                                                                                          | Secondary or pushed local detail                          |
| Session inspection detail | an explicit click on a Work block, a Related Task or another Context row (the Task tab is a stand-in)                                                                             | a tab or the active tab's local stack; never a third pane |

The table defines reachability. A product row keeps a stable neutral destination: a Specifications
row always enters its Specification and never deep-links to whichever Task or issue currently has
the highest priority; status prose inside the row is not a link. Opening a Task performs no
workflow action.

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

**Peer areas and stacked screens.** Overview, Sessions, Tasks, Documents, Changes and Repository
are equal areas of a Specification, reached from the navigation. On Narrow they keep the navigation
trigger in the header and have no Back in their body; the Specifications list stays reachable from
the navigation (the Specification switcher and its list). A peer area never replaces the navigation
trigger. A subordinate screen (a document opened from Documents, a documentation article, Activity
history, a Task page, and so on) is a stacked screen: on Narrow its header shows a
Back instead, icon only, named for the parent ("Back to <parent>", "Wróć do: <parent>"; never a bare
"Back", also at depth 1), with a 44 px touch target. Wide and Compact layouts carry the way back in
the location trail (breadcrumbs, the split Secondary's detail header row).

**Back and Close never appear together on Narrow.** A stacked Secondary shows its Back and no
Close beside it (`AppWorkspace` hides the stacked Close by default).

**Back goes to a defined parent**, not to raw browser history, and it resolves the same way for a
screen opened from a deep link, a reload or another tab (`app/navigation/backParent.ts`):

| Screen (Narrow)                       | Back leads to                                                     |
| ------------------------------------- | ----------------------------------------------------------------- |
| A document of Documents               | the Documents list (the tree under it), a deep link included      |
| A document promoted from the Overview | the Overview it came from (that visit's router state; see below)  |
| A documentation article               | the previous article, then the documentation (the reader's rules) |
| Activity history                      | the Overview (the owning Primary)                                 |
| A Task page                           | the Tasks page (the navigation's Tasks), a deep link included     |
| A refused new Session (Sessions off)  | the Overview (not the turned-off Sessions area)                   |
| A deeper Secondary screen             | its parent in the same stack                                      |

Back keeps the context the existing contracts provide: the selected Specification and its
collection, and the documentation's workspace, search and reading positions (the reader's own
rules). A Task page's Back, and its Tasks crumb on Wide and Compact, open the Tasks page
unfiltered: a `group` or `blocking` filter of the Tasks page the Task was opened from is not carried
to the Task page. A Back to a routed parent moves in one of two ways:

- when the previous history entry is the parent's own visit (a document opened from the Overview
  records that entry's index), Back steps back in history, also after a reload of the document
  (the history entries survive it): the Overview returns at the scroll it was left at, through the
  router's own scroll restoration (per history entry, kept in `sessionStorage` across a reload,
  enabled for the Overview only), and its title takes the focus;
- otherwise (a deep link, or a document tab opened since, which pushed an entry) Back navigates to
  the parent, which opens at its top with its title focused. (Rare: if that Overview entry was
  replaced meanwhile, Back still steps to the entry at its index.)

The Narrow header names the screen by its icon: a peer area with the Specification's key
("Overview · KEY"), a stacked item by its own identifier (see
[Page identity](#page-identity-and-product-icons)). It shows a context notice (stale, or the
Specification's information could not be read) in full under the title, wrapping to a second line,
since a peer area has no line in its body.

**Body backs exist only in flows**: Create steps (back to the Specifications list, or a step back
such as "Change method"), a new Session (back to Sessions) and the way back to a Session from a
document or the documentation tree. They use one component (`FlowBack`) with one look and no
per-call-site spacing.

Product Back inside Secondary follows the local inspection stack:

- a dependent detail Back returns to its parent in the same tab or stack (for example ToolAction to
  Work history, a Task to the Tasks list it was opened from);
- a tab is closed explicitly; Context stays pinned and is never closed as a tab;
- closing the whole Secondary returns to the owning Primary and does not reset it.

Browser/system Back normally follows router history. On **Narrow**, when a local pushed Secondary
stack is active, the product first lets that stack pop or close before leaving the routed surface;
the URL still represents only the Primary route. This uses router/history integration that keeps
normal browser semantics; Secondary does not become a URL-addressable route.

## Page identity and product icons

**Page identity.** Every page says what it is and which item, and never shows its title twice
(the Document pattern: a document's tab names its file, its body carries its title):

- A **Task page** names itself in its location by its type, never by its long technical key
  (owner, 2026-11-26): on Narrow the header reads `← [Task] Task · nevo-2` (the Specification's
  key); on Wide and Compact the trail ends with it: `Specifications › [Specification] nevo-2 ›
Tasks › [Task] Task` (the Task's key is the item's tooltip). The body keeps the title as its
  heading; the line under it starts with the type's icon and name, "[Task] Task · Implementation",
  and the Task's key follows as secondary metadata in mono with a copy icon action. A Task opened
  from a Session's Context is the same page. Another stacked item (a document) is named by its own
  identifier, as its tab names its file.
- The **Specification Overview**'s line under its title reads "[Specification] Specification ·
  nevo-2", only "Specification" when the Specification has no key. The trail's Specification item
  carries the Specification icon and the key (its title when there is no key).
- A **peer area**'s Narrow header names the area with its icon and the Specification's key
  ("[Tasks] Tasks · nevo-2"). Peer lists (Specifications, Sessions, Tasks, Documents) keep their
  visible heading.
- A **Session**'s header is the Session icon and the Session's one title (the same in the
  Overview's Sessions, the Sessions list and the header, see
  [Specification Sessions](specification-sessions.md)), with its state under it. The agent is named
  once, by the transcript's speaker line ("Claude Code · Opus 5.5"). "Generated by SpecFlow" carries
  the Nevo mark.
- Identity adds no band or bar: on Narrow it scrolls away with the header, and the floating
  navigation and actions stay as they are.

**Product icons.** One icon per product concept, used for nothing else. The four items have a
related pair: the single icon on item rows, item page headers and the trail's item; the collection
icon on the navigation and on section and list headers. State icons (done, running, waiting, on
hold, attention, failed, cancelled) are a separate set and never replace an item's icon: a done Task
keeps its Task icon, with the done check beside it. The set was chosen by an all-pairs silhouette
comparison at 16 and 20 px across every icon here, states included, then by the owner (PR #169).

| Concept               | Single / collection            | Meaning                                                   |
| --------------------- | ------------------------------ | --------------------------------------------------------- |
| Specification         | BookOpen / Library             | An organised unit of work: workflow, Tasks and documents. |
| Task                  | ClipboardCheck / ClipboardList | One unit of implementation work, an object of its own.    |
| Session               | MessageSquare / MessagesSquare | A conversation with an agent (not the agent).             |
| Document              | FileText / Files               | A file of a Specification or Task without a type icon.    |
| Start a conversation  | MessageSquarePlus              | The "New session" / "Create with AI" action.              |
| Documentation         | BookMarked                     | The repository's documentation (the reader).              |
| Workflow step         | Workflow                       | A step of the workflow, and nothing else.                 |
| Agent / provider      | provider mark; Bot             | Who does the work; Bot before a provider is chosen.       |
| Generated by SpecFlow | Nevo mark                      | Text SpecFlow wrote (a brief, a continuation).            |
| Context               | Paperclip                      | What an agent is given to read.                           |
| Dependency            | Network                        | A Task this Task waits for.                               |
| Commit                | GitCommitHorizontal            | A recorded Git commit.                                    |
| Changes               | GitCompare                     | Uncommitted or compared workspace changes.                |
| Branch                | GitBranch                      | A Git branch, and nothing else.                           |
| Repository            | FolderGit2                     | The Git repository area.                                  |
| History               | History                        | Activity, Work and attempt history (Clock is Waiting).    |
| Overview              | Home                           | A Specification's Overview area.                          |
| Tool action           | Wrench                         | Something an agent did with a tool.                       |
| File read             | Glasses                        | A file an agent read (a Work row), not a Document.        |
| Changed files         | Diff                           | The repository files an attempt changed.                  |
| Review                | ScanEye                        | A result waits for the owner's review (Eye: preview).     |
| Instructions          | ScrollText                     | Standing instructions (an agent's, a step's).             |
| Artifacts             | Package                        | Files an agent produced.                                  |
| Environment           | Container                      | Where a Session runs.                                     |

Document types declare their icon in their definition
(`packages/specflow-engine/definitions/document-type/*.yaml`, `icon:`), and a typed document shows
it in place of the Document icon: overview.md Telescope (`telescope`), architecture.md Boxes
(`boxes`), backend.md Server (`server`), behaviour.md ListOrdered (`list-ordered`), decisions.md
Scale (`scale`), research.md FileSearch (`file-search`), user-story.md UserPen (`user-pen`), ux.md
PanelsTopLeft (`panels-top-left`). These glyphs belong to the dictionary too; an unknown name shows
the file's format icon.

**One source.** `packages/specflow-ui/src/shared/product-icons/productIcons.ts` exports the
dictionary by concept (`productIcons.task.item`, `productIcons.task.collection`,
`documentTypeIcons`); features name the concept, never the glyph. ESLint
(`specflow-icons/no-direct-product-icon`, `tools/eslint/no-direct-product-icon.mjs`) refuses these
glyphs from `lucide-react` under any of their names, and their `Icon` registry names in an icon
position, everywhere in SpecFlow UI's production sources but that module. A test keeps the rule's
list (`productGlyphs.json`) equal to the module and checks that no glyph means two things.

**A concept's icon means only that concept.** A glyph reused through the dictionary is still a
second meaning: a file an agent read is not a Document, and the files an attempt changed are not the
Documents collection. A new meaning gets its own named entry, chosen with the all-pairs silhouette
test (no pair above 0.75 at 16 or 20 px). Rows whose concept sits next to a dictionary item (the
Work rows' operations, an attempt's changes) have a test that pins their entry. Review checklist: a
changed `productIcons.<concept>` use shows that concept, and nothing near it.

## Visual conventions

The Specification Overview, the Task page and a Session read as one product (owner review,
2026-11-26). Each convention maps to an existing token or component; a feature never restyles one
locally. The semantic roles are in
[Semantic information hierarchy](../../../design-system/principles/information-hierarchy.md); this
section names what the three screens use them for.

**Application header vs workspace header.** The application header (the `WorkspaceHeader` of
`AppWorkspace`, with `ApplicationLocationIdentity`) carries navigation, the view's identity (its
icon, a short name and the Specification's key: "Overview · nevo-2", "Task · nevo-2"), its context
notice and the screen's actions. The workspace header is the top of the body: the entity's human
title (`title-lg`, the page's `h1`), its type line ("[icon] Task · Implementation", `body-sm`), a
technical identifier as secondary metadata (`CopyableIdentifier`) and its description. A Session is
the exception: a conversation has no workspace header above the transcript, and its application
header carries its title and state.

**Typography levels.** One level per role, tokens only:

| Level                 | Token and colour                                       | Example                                  |
| --------------------- | ------------------------------------------------------ | ---------------------------------------- |
| Entity title          | `title-lg`, `content-primary`                          | the Specification's or Task's title      |
| Current workflow step | `title-sm`, `content-primary`                          | "Waiting for Tasks", "Implement" in Now  |
| Section label         | `section-label`                                        | NOW, DOCUMENTS, TASKS                    |
| Primary content       | `body-md`, `content-primary`                           | the Goal, an agent's answer, a count     |
| Progress commentary   | `body-md` or `body-sm`, `content-secondary`            | a step's purpose, the agent's Commentary |
| Metadata              | `body-sm`, `content-muted`                             | "Task · Implementation", a time          |
| Agent name            | `AgentName` (`body-md` in Now, `body-sm` in a Session) | "Claude Code · Opus 5.5"                 |
| Text action           | `TextAction` or the DS `Link`, `content-link`          | View dependencies, Open session          |

**Action hierarchy.** **Primary** (`Button`, default variant) is the one main action of the state
(Continue, Start Implement, Approve). **Secondary** (`Button variant="secondary"`) is its
alternative, at most one beside it (Take over, Run with agent). A **text action** (`TextAction` for
an in-page action, `Link` for an address) leads to details (View dependencies, Open session, View
full brief, Show feedback). An **icon action** (`IconButton`, or a header action with
`presentation: 'icon'`) is a compact auxiliary action with a tooltip (copy, history, ⋯). Context in
a Session is an icon action that shows its label from the split width (`labelWhenWide`), so it
never competes with Continue or Start.

**Page-level toggles.** A toggle that changes how the whole screen shows its content (Work
history's **Show every operation**, a tool detail's **Wrap lines**) is an icon action in the
screen's header (`presentation: 'icon'`, `labelWhenWide`, pressed while on, a checked row where a
header keeps its actions in the "…" menu): icon-only below the split width (a phone) and on a
narrow header, its words as accessible name and tooltip; icon with its words from the split width
when the header has room. One builder, one place, one pressed state. An action on one block (Copy
of one code block) stays on the block, icon-only at every width with its words as accessible name
and tooltip; a page toggle is never placed in the body. A toggle while on is accent-tinted (blue
background tint, blue icon and words), never only a brighter icon.

**Colour semantics.** Blue (`content-link`, `action-primary`, the active step of the track) is
actions and navigation only. Green (`status-success`) is success, and an agent's work running
normally. Yellow (`status-attention`) is waiting or attention (Waiting for dependencies, an
interrupted attempt). Red (`content-error`, `status-danger`) is an error (failed tool actions, an
unknown outcome). Colour never stands alone: a word or an icon carries the meaning too.

**Spacing.** Tighter inside a logical group (`gap-0.5` to `gap-2`: a title and its quiet line, a
description and its Show more, a Commentary and its tool row), larger between groups (`gap-3`
inside Now, `gap-4` between conversation entries, the section rhythm between page sections).
Backgrounds and borders appear only where they separate or highlight: Now's `AccentBlock`, the
request and brief bubbles, notices and interaction prompts.

**Containers.** Errors, warnings and required interactions keep a strong container (`Alert`,
`InlineNote` in its tone, the interaction prompt). Routine items have none: an agent's Commentary
is plain prose and its tool work a light row ("[icon] 5 commands ›").

**Monospace.** `font-mono` only for code, commands and technical ids (a Task's key, a commit, a
path), never for a title, a header name or a trail item.

**Disclosure chevrons.** Chevron down expands in place and turns up while open
(`DisclosureToggle`: Show more, Show description, Show feedback, the Goal's Show more). Chevron
right navigates to details elsewhere (`TextAction chevron="navigate"`, navigation rows, the tool
row, Last hand-off).

**One shared Now.** The Now block of a Specification and of a Task is one composition
(`NowBlock`) of shared pieces: the state (the step, or an actionable readiness such as "Waiting for
dependencies" with the lifecycle position as its quiet line, `ReadinessLine`), the progress
(`StepProgress`, `TaskProgress`), the executor (`NowExecutor`: the agent's mark and name, the state
of its work in its tone, Open session) and the actions. There is no per-execution-kind component;
actions and ownership come from the workflow projection.

**The edges of the screen.** The floating ☰ and ⋯ of a stacked layout stay as decided (#208). The
Composer and the scroll-to-latest button never cover the last content: the conversation reserves
the Composer's height under its last entry, and scroll-to-latest floats above the Composer.

| Need                            | Use                             | Owner                      |
| ------------------------------- | ------------------------------- | -------------------------- |
| Text action, navigating chevron | `TextAction`                    | `shared/actions`           |
| Expand in place                 | `DisclosureToggle`              | `shared/actions`           |
| Identifier with copy            | `CopyableIdentifier`            | `shared/clipboard`         |
| Agent name                      | `AgentName`, `agentDisplayName` | `shared/agents`            |
| Who works on the step           | `NowExecutor`                   | `features/tasks/execution` |
| Actionable readiness count      | `ReadinessLine`                 | `features/tasks/execution` |
| Status tone                     | `StatusIndicator`, `statusTone` | `@nevo/ui`                 |
