---
id: ideas.specflow-ui.screens.project-settings
type: product
title: Project Settings UI spec
status: draft
scope: specflow
areas:
  - ui
  - product
  - configuration
tags:
  - settings
  - project
  - configuration
  - workflows
  - agents
  - repository
  - integrations
read_when:
  - implementing or reviewing the Project Settings screen
  - deciding how project configuration should be navigated or grouped
  - designing Settings responsive behavior or Storybook fixtures
summary: >
  Vertical UI specification for Project Settings: user use cases, local section
  navigation, screen anatomy, responsive behavior, interactions, component usage,
  semantic token roles, borderless containment rules, states, and acceptance scenarios.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.information-navigation-inventory
  - product.specflow.ui.interaction-model
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
  - design-system.principles.system-boundary
---

# Project Settings UI spec

## 1. Purpose and ownership

Project Settings answers:

> **How is this project configured to work?**

It owns project-level configuration, defaults, policy, definitions, and integration setup.

It does not own the runtime answer to:

> What is happening right now?

Runtime workflow state, current branch/diff, active execution, current Session work, and contextual
actions remain on Specification, Task, Session, or another current-work surface.

The shared distinction remains:

~~~text
CONFIGURATION
How should it work?
-> Project Settings

RUNTIME STATE
What is happening?
-> Specification / Task / Session / current work

ACTION
What can I do now?
-> contextual action
~~~

This spec is read-only-first. It defines inspection/navigation now and reserves clear places for
future edits without inventing mutation contracts that do not exist yet.

## 2. User use cases

### U1 — orient within project configuration

The user opens Project Settings and needs to understand which configuration areas exist without
reading every field.

Expected areas:

- General;
- Configuration;
- AI / Agents;
- Workflows;
- Repository / Git;
- Integrations.

Future Tools configuration is not shown until it becomes an implemented product capability.

### U2 — inspect project and effective configuration

The user wants to inspect:

- project configuration YAML;
- local configuration YAML;
- effective/resolved configuration when available;
- source/effective-value provenance when the application can provide it.

The screen must not fabricate precedence or effective values when the application does not expose
them.

### U3 — inspect AI / agent policy

The user wants to understand project-level defaults and policy, such as:

- default provider/model/mode when the project defines them;
- provider availability/configuration;
- agent/profile definitions;
- execution policy/capability defaults.

Human-facing role/profile should be more prominent than provider/model internals.

Concrete runtime execution selection remains separate from Settings.

### U4 — inspect workflow definitions

The user wants to inspect configured workflow definitions and understand:

- steps;
- semantic statuses;
- gates;
- actions;
- transitions;
- source-control behavior when configured.

This is configuration inspection. Current Spec/Task workflow position does not belong here.

### U5 — inspect repository / Git configuration

The user wants project-level repository facts/settings such as:

- repository/remotes;
- workspace/worktree root;
- default branch;
- source-control settings.

Current branch, dirty worktree, current diff, or active PR may also be visible in current-work
surfaces and must not become Settings-only information.

### U6 — inspect integrations

The user wants to see configured integrations such as GitHub/GitLab and their configuration or
availability state.

Do not invent authentication/setup actions until the integration contract supports them.

## 3. Entry, navigation, and URL behavior

### Entry

Global product navigation contains:

~~~text
Specs

────────

Project Settings
~~~

Selecting Project Settings opens this workspace. It does not mutate project configuration.

### Settings sections

Settings sections are local navigation inside Project Settings. They are not new top-level product
sidebar items.

On split-capable layouts, local Settings navigation remains visible beside section content inside the
same Primary workspace.

This internal two-column composition is not AppWorkspace Secondary.

### Default section

The default entry selects General when that section is present and available, unless the
route/product navigation expresses another stable Settings section.

Because the Settings catalog is dynamic, General must not be assumed to exist forever. If the
requested/default section is absent after a version/plugin change, select the first available section
in backend-provided order, update the local route state, and keep the user oriented with the actual
selected section rather than rendering a broken empty page.

### Stable section intent

A stable Settings section should be representable by product navigation state when router
integration supports it, so reload/deep-link behavior can restore the same section.

This spec does not freeze the URL string.

### Nested definition detail

A section such as Workflows may contain a collection of definitions.

Selecting one definition changes the Settings content to that definition detail while retaining
Project Settings and the selected Settings section as parent context.

~~~text
Project Settings
  Workflows
    Workflow definitions
      -> Definition detail
      <- Workflows
~~~

Do not open a third global workspace pane merely because a definition has detail.

## 4. Data source and ownership contract

### 4.1 Product direction

The Settings UI should **not own a hard-coded complete list of settings**.

The application/backend should expose a project-scoped Settings read model describing the settings
available for the current product version and installed/enabled extensions.

Why:

- Settings will grow over time;
- different product versions may expose different capabilities;
- providers/integrations/extensions may contribute configuration;
- a setting may be unavailable, read-only, hidden, or unsupported depending on environment;
- the UI should not need a release merely to learn that a new ordinary setting exists.

This is a **proposed product/API contract**. The current repository does not yet define this canonical
Settings catalog/read model.

### 4.2 Backend/application responsibility

The backend/application layer should return an ordered semantic catalog roughly equivalent to:

~~~text
ProjectSettingsCatalog
  sections[]
    id
    title
    description?
    order
    source                  core | extension/plugin
    groups[]
      id
      title?
      description?
      settings[]
        key
        label
        description?
        valueKind
        value
        effectiveValue?
        defaultValue?
        sourceOfValue?
        options?
        readOnly
        required?
        availability/status?
        capability flags?
~~~

Names above are illustrative, not frozen DTO field names.

The important contract is that the application owns:

- which settings exist;
- their stable identity;
- grouping/order;
- value semantics;
- current/effective/default value where meaningful;
- provenance/source-of-value where meaningful;
- editability/availability/capabilities;
- extension/plugin contribution.

The UI must not infer those facts by reading YAML files directly or by maintaining its own parallel
registry of all settings.

### 4.3 UI responsibility

The frontend owns presentation, not the settings inventory.

It should map semantic setting kinds to established renderers, for example:

~~~text
string / number        -> label + value / future field
boolean                -> boolean presentation / future switch
enum                    -> selected value / future Select
path / file reference  -> path presentation + contextual open action
secret                  -> masked/safe presentation
structured/code value  -> read-only code/config inspection
status                  -> semantic status treatment
~~~

The backend must **not** return React component names, Tailwind classes, colour tokens, Card
instructions, or arbitrary layout markup.

This keeps the API semantic rather than turning it into a remote UI DSL.

### 4.4 Sections and extensions

The initial product navigation still has expected core areas:

- General;
- Configuration;
- AI / Agents;
- Workflows;
- Repository / Git;
- Integrations.

However, the rendered Settings catalog must tolerate:

- a core section being absent because a capability is unavailable;
- additional groups/settings appearing in a core section;
- a plugin/extension contributing a new group;
- a plugin/extension contributing a new section when it has a real independent configuration use
  case.

Unknown ordinary setting descriptors should not crash the whole screen. Unsupported value kinds
should fail visibly at the smallest responsible scope rather than being silently dropped.

### 4.5 Complex settings

The catalog model is intended for ordinary configuration.

If an extension needs a complex, bespoke interaction that cannot be expressed through established
semantic setting kinds, do not solve it by sending arbitrary UI markup from the backend.

That case needs an explicit product/plugin UI extension contract later.

### 4.6 Raw configuration files

Project/local YAML remain useful evidence and debugging/configuration sources, but they are **not the
primary source of the Settings navigation model**.

The normal flow is:

~~~text
backend/application Settings catalog
        -> Settings sections/groups/items

raw project/local config
        -> deeper source inspection / provenance
~~~

The UI may offer View source / View configuration without parsing raw files to discover what settings
exist.

---


## 5. API availability / migration status

Status vocabulary used by all screen specs:

- **existing-new** — implemented as a product API/read model in the current \`nevo-specflow\` repository;
- **legacy-available** — implemented in legacy \`dczerwinskipl/nevo\` and useful as migration evidence;
- **missing** — not available as the required new-product contract; add it deliberately.

For Project Settings:

| Need | New SpecFlow | Legacy Nevo | Direction |
| --- | --- | --- | --- |
| Dynamic Settings catalog | **missing** | **missing** | Add new project-scoped catalog/read model. |
| Provider availability/capabilities | **missing** | **legacy-available** via \`GET /api/agent-providers\` | Fold semantic provider configuration/availability into Settings read model or link to a shared provider capability. |
| Workflow definitions | **missing** | **legacy-available** internally in workflow definitions/registry, but not as a Settings catalog API | Expose human-readable workflow-definition projection through Settings/backend capability. |
| Project/local/effective config provenance | **missing** | partial filesystem/config evidence only | Add authoritative provenance/effective-value projection. |
| Repository/Git configuration summary | **missing** | partial runtime/source-control APIs, not a Settings contract | Add project-configuration projection; keep current worktree state out of Settings ownership. |
| Integration configuration | **missing** | no generic plugin-driven Settings catalog | Add through extensible Settings catalog contributions. |

The current \`@nevo/specflow-runtime\` package explicitly describes its backend as a bootstrap proof;
there is no current HTTP product contract to treat as \`existing-new\` for this screen.


### Legacy field evidence

There is no legacy Settings catalog to copy.

The closest reusable legacy provider descriptor already proves these provider fields exist as useful
semantic data:

~~~text
AgentProviderDescriptor
  id
  label
  enabled
  available?
  unavailableReason?
  capabilities
  supportedModes?
  defaultMode?
~~~

Workflow-definition data also exists in legacy workflow definitions/registry, but not as one
human-facing Settings read model.

Therefore most Settings-catalog descriptor fields above are **new product contract fields**, not
renamed legacy fields. The contract should stay additive/versioned so later ordinary setting
metadata can be added without breaking older clients.

### Proposed read API

Illustrative transport:

~~~text
GET /api/project/settings
~~~

Response shape:

~~~text
{
  schemaVersion,
  revision,
  generatedAt,
  project: {
    id,
    name?
  },
  sections: [
    {
      id,
      title,
      description?,
      order,
      source: { kind: "core" | "plugin", id? },
      groups: [
        {
          id,
          title?,
          description?,
          order?,
          settings: [
            {
              key,
              label,
              description?,
              helpRef?,

              valueKind,
              displayFormat?,
              configuredValue?,
              effectiveValue?,
              defaultValue?,
              valueState?,
              sourceOfValue?,
              sourceRef?,

              options?: [
                { value, label, description?, disabled?, disabledReason? }
              ],

              sensitive?,
              readOnly,
              required?,
              availability?: {
                status,
                reason?
              },
              capabilities?: {
                canInspectSource?,
                canReset?,
                canEdit?
              }
            }
          ]
        }
      ]
    }
  ]
}
~~~

Field coverage notes:

- `schemaVersion` is a compatibility discriminator for the descriptor contract; it is not a visual
  version.
- `revision` identifies semantic catalog/effective-value state and supports targeted refresh/cache
  validation.
- `configuredValue`, `effectiveValue`, `defaultValue`, `valueState`, and `sourceOfValue`
  are distinct so the UI can explain inheritance/defaulting without guessing precedence.
- `sourceRef` points to deeper source inspection without embedding whole YAML bodies.
- `sensitive` prevents accidental plaintext rendering; masking/redaction is application-owned, not
  a CSS convention.
- `availability` explains unsupported/unavailable settings without removing all evidence that a
  capability exists.
- `capabilities` expresses semantic operations, not component names.
- option descriptors carry labels/reasons so the frontend does not need a second registry for
  provider/model/plugin choices.
- ordinary new settings using an already-supported `valueKind` should require no screen-code
  change; a genuinely new semantic `valueKind` may require a new frontend renderer and therefore
  is a versioned contract extension, not arbitrary backend-driven UI.

Behavior:

- server/application composes core + enabled plugin contributions;
- ordering and stable setting identity are server-owned;
- effective values/provenance are resolved server-side;
- unsupported/disabled capabilities are represented semantically rather than silently omitted when
  the distinction matters to the user;
- ordinary catalog expansion does not require a frontend release;
- UI maps known semantic \`valueKind\` values to existing renderers;
- backend never returns component names, Tailwind classes, arbitrary HTML, or visual Card/layout
  instructions.

For raw source inspection, the catalog may expose a stable source reference. The actual source body
should be retrieved through the future shared file/config inspection capability rather than embedding
large YAML bodies into every Settings catalog response.

No write API is proposed yet because this screen is read-only-first. Editing gets its own contract
once field ownership, validation, authorization, dirty state, and concurrency semantics are decided.

## 6. Information hierarchy

On first scan the user should perceive:

1. Project Settings — clear workspace identity.
2. Current Settings section — General, Configuration, AI / Agents, etc.
3. Section purpose — one short explanation when necessary.
4. Actual configuration content.
5. Exceptional state requiring attention, only when one exists.
6. Technical/raw detail below the normal readable summary.

Do not lead with internal ids, provider implementation detail, raw YAML, or diagnostic payloads when
a human-readable summary exists.

Do not create a dashboard of counts merely because there is free space.

## 7. Screen anatomy

### 7.1 Shared workspace

~~~text
Project Settings header

Local Settings navigation     Section content
-------------------------     ------------------------------
General                       section title
Configuration                 optional short explanation
AI / Agents
Workflows                     content
Repository / Git
Integrations
~~~

Both columns belong to one Project Settings Primary surface.

The workspace itself supplies the page surface. There is no enclosing Settings Card.

### 7.2 Header

Header content:

- title: Project Settings;
- no decorative status badge;
- no global Save button while the screen is read-only-first;
- future section-specific mutation actions may appear only when an actual editable contract exists.

The project selector remains global navigation responsibility and should not be duplicated in the
Settings header merely to fill space.

### 7.3 Local Settings navigation

Use a compact local navigation/list treatment.

Each item contains the section label. Add secondary metadata only when it helps navigation, not to
make every row look richer.

Do not render each category as a Card/tile.

### 7.4 Section content

Default section structure:

~~~text
Section title
optional one-sentence explanation

content group

content group

content group
~~~

Separate substantial groups primarily through heading hierarchy and section-scale whitespace.

Use a subtle divider only when whitespace is insufficient.

## 8. Section-specific structure

### 8.1 General

Purpose: stable project facts.

Candidate structure:

~~~text
General

Project
  Name                     Project Alpha
  Workspace root           ...
  Repository               ...

Additional project facts
  ...
~~~

Use definition-style label/value rows or aligned text.

Do not create one Card per fact.

Do not create separate Name / Repository / Root Cards.

### 8.2 Configuration

Purpose: inspect authored and effective configuration.

~~~text
Configuration

Project configuration
  human-readable source/path metadata
  [View configuration]

Local configuration
  human-readable source/path metadata
  [View configuration]

Effective configuration                when available
  resolved values / provenance
~~~

Raw YAML/code is deeper detail, not the primary visual hierarchy.

When a raw configuration surface is shown inline, use the shared code/file surface when available.
Until that capability exists, a restrained read-only code treatment is acceptable.

Do not place each source in a heavy Card merely to distinguish the files.

### 8.3 AI / Agents

Purpose: inspect project policy/defaults and available definitions.

Suggested order:

~~~text
AI / Agents

Defaults / policy
  human-readable default role/provider/model/mode where configured

Providers
  provider row
  provider row

Agent profiles
  profile row
  profile row

Advanced execution policy
  collapsed/deeper when needed
~~~

Provider/model is implementation context; role/profile is normally more important to the human.

Provider and profile collections are homogeneous lists/rows by default, not Cards.

A provider unavailable state may use a compact semantic status and explanation. It should not become
a warning Card unless the condition actually requires user action or blocks a configuration task.

### 8.4 Workflows

Purpose: inspect deterministic workflow definitions.

This section configures/inspects deterministic workflows; it does **not** choose between legacy and
deterministic product modes. Nevo SpecFlow has no legacy-flow mode to enable.

List state:

~~~text
Workflows

Definitions

Implementation
Review
...
~~~

Selecting a definition:

~~~text
Workflows
← Definitions

Implementation

Steps
  1. ...
  2. ...

Gates
...

Actions / transitions
...

Source-control behavior
...
~~~

Steps and gates are linear configuration. Prefer headings, rows, ordered lists, and progressive
disclosure over Cards per step.

A gate type is technical detail unless it helps explain the configuration.

### 8.5 Repository / Git

Purpose: inspect repository-level configuration.

~~~text
Repository / Git

Repository
  remote / URL
  workspace root
  default branch

Source-control settings
  ...
~~~

Current dirty state/current diff is runtime/current-work information and should not be presented here
as if it were project configuration.

### 8.6 Integrations

Purpose: inspect configured external integrations.

~~~text
Integrations

GitHub
  Connected / unavailable / not configured
  short relevant configuration summary
  contextual action only when supported

GitLab
  ...
~~~

Use rows or sections, not one decorative integration Card per provider by default.

If an integration has a real setup/reconnect flow later, the whole row may become a stronger
interactive object; that change should be justified by the actual interaction.

## 9. Pseudo-layout

This is an information/layout sketch, not a pixel-perfect visual design.

Wide example with **Configuration** selected:

~~~text
┌──────────────────┬──────────────────────────────────────────────────────────────┐
│ Nevo SpecFlow    │ Project Settings                                             │
│                  │                                                              │
│ [Project Alpha ▾]│  General                 Configuration                       │
│                  │ >Configuration                                                │
│ Specs            │  AI / Agents             Project configuration               │
│                  │  Workflows               nevo.yaml                  [View]   │
│ Project Settings │  Repository / Git        source: project                    │
│                  │  Integrations                                                │
│                  │                         Local configuration                   │
│                  │                         local.yaml                 [View]    │
│                  │                         source: local override                │
│                  │                                                              │
│                  │                         Effective configuration               │
│                  │                         Provider        Claude                │
│                  │                         Model           Sonnet                │
│                  │                         source          project config        │
│                  │                                                              │
└──────────────────┴──────────────────────────────────────────────────────────────┘
~~~

Important visual intent:

- AppWorkspace is already the containing surface;
- one Settings section is selected at a time;
- the local Settings navigation is a simple column/list, not a stack of Cards;
- content groups are separated by heading hierarchy and whitespace;
- one light divider may separate major groups when needed;
- facts and settings are rows/label-value pairs;
- no Card around configuration sources or effective values;
- a strong attention surface appears only for an exceptional state that genuinely needs emphasis.

The actual sections/groups/items are driven by the Settings catalog/read model. The sketch
illustrates the default composition, not a hard-coded field inventory.

---

## 10. Responsive contract

### Wide

Global navigation is persistent.

Inside Project Settings:

~~~text
Navigation | Project Settings workspace
             local section nav | section content
~~~

Local Settings navigation remains visually subordinate to global product navigation.

### Compact

Global navigation becomes a Drawer, but Project Settings can still use its internal two-column
section-nav + content composition while the **Settings content container itself** remains comfortable.

The local Settings-navigation collapse decision must be based on its available/container width, not
blindly coupled to the global navigation breakpoint. A compact shell can still have enough room for
two Settings columns; a constrained embedded workspace may not.

### Narrow

Show one Settings content column.

Replace the persistent local section column with a compact, explicit section selector near the top
of Project Settings content.

~~~text
☰  Project Settings

[ General ▾ ]

General
...
~~~

Selecting another section replaces section content in the same workspace.

This is section switching, not a workflow mutation and not AppWorkspace Secondary.

If a user is in a nested definition detail:

~~~text
Project Settings
Workflows
← Definitions

Implementation
...
~~~

Back returns to the parent Settings collection/detail level, not to arbitrary browser history.

The exact selector primitive may be Menu/Select/another established Nevo UI navigation composition;
the behavior is fixed here, not the primitive.

## 11. Interaction flows

### Flow A — enter Settings

~~~text
Global navigation
  -> Project Settings

Project Settings
  General selected
  General content visible
~~~

No modal, no welcome Card, no intermediate dashboard.

### Flow B — switch section

~~~text
User selects AI / Agents
  -> local selection changes
  -> content changes to AI / Agents
  -> workspace header remains Project Settings
  -> no backend mutation
~~~

If section intent is URL-addressable, the product navigation state updates accordingly.

### Flow C — inspect workflow definition

~~~text
Workflows
  user selects Implementation
    -> definition detail replaces Workflows list content
    -> Project Settings + Workflows parent context remain clear

Back / Definitions
    -> Workflows definition list
~~~

Opening a definition must not start, modify, or validate a runtime workflow.

### Flow D — inspect raw configuration

~~~text
Configuration
  user selects View configuration
    -> open read-only configuration detail
    -> preserve Settings context
~~~

When compact file/code inspection exists, use it rather than inventing a second bespoke code viewer.

### Flow E — exceptional configuration issue

Example:

~~~text
AI / Agents
  Provider unavailable
~~~

The row/status explains the condition.

Only if the user must resolve it here does the screen promote a stronger attention treatment and
relevant action.

Do not style every unavailable optional provider as a page-level warning.

## 12. States

### Loading

Keep the page structure stable:

- Project Settings identity remains;
- local section navigation remains when known;
- section content uses restrained loading placeholders.

Do not replace the whole screen with a large centered spinner unless nothing meaningful can render.

### Empty / not configured

Examples:

- no integrations configured;
- no custom workflow definitions;
- no local configuration file.

Use concise empty-state copy inside the relevant section.

Do not render an empty Card simply to say Nothing here.

### Unavailable / failed to read

Show the failure at the smallest responsible scope:

- one configuration source failed -> error near that source;
- entire Settings read model unavailable -> section/page error as appropriate.

Keep other readable sections usable when the application contract allows partial availability.

### Read-only

Read-only is the default assumption for this spec.

Do not show disabled Save/Edit controls as decoration.

### Editable — deferred

Future editing must define:

- field ownership;
- validation;
- dirty state;
- Save/Cancel semantics;
- concurrent/external file change behavior;
- authorization.

Do not infer those from the inspection UI.


## 13. Data loading, invalidation, and Refresh

This screen inherits the shared
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md) contract.

### Loading strategy

- initial request loads one coherent Settings catalog/effective-value projection;
- raw project/local source bodies are lazy/deeper resources;
- plugin-contributed ordinary settings arrive through the same catalog composition rather than one
  frontend request per plugin;
- if one plugin contribution fails and the backend can isolate it, core Settings remain usable and
  the failed contribution is represented locally.

### Refresh

Project Settings has one screen-level **Refresh** action in the workspace header overflow unless
future testing shows it deserves a visible button.

Refresh invalidates/refetches:

- the Settings catalog;
- effective values/provenance;
- current plugin/extension contribution inventory.

It does **not** blindly refetch:

- raw YAML/code bodies that are not open;
- Sessions;
- Specification runtime state;
- unrelated repository diffs.

If an open raw source has its own revision/change signal, that local detail may expose its own
Refresh/reload behavior.

Keep existing Settings visible while refresh is in flight. A refresh error should report that the
visible data may be stale rather than replacing the entire page with an empty error state.

Short polling is not justified for Settings. Prefer config/plugin change invalidation when available,
window-focus refetch, and explicit Refresh.

The descriptor/value-kind rendering contract is defined in
[Settings catalog renderer UI spec](../components/settings-catalog-renderer-ui-spec.md).

## 14. Component / composition map

This map names responsibilities, not a mandatory file tree.

| Region / behavior | Use | Ownership |
| --- | --- | --- |
| Product shell | AppShell | Nevo UI |
| Settings workspace | AppWorkspace with Primary only by default | Nevo UI |
| Workspace title/actions | WorkspaceHeader | Nevo UI |
| Scroll/content width | AppContent, AppWorkspaceBody, AppContentContainer | Nevo UI |
| Wide/compact local settings navigation | SideNavigation or equivalent generic nav primitive | Nevo UI primitive, SpecFlow composition |
| Narrow section selector | existing Menu/Select/navigation primitive chosen during composition | Nevo UI primitive, SpecFlow composition |
| Section headings/body | Typography | Nevo UI |
| Light section separation | whitespace first; Separator only when needed | Nevo UI |
| Status / availability | StatusIndicator and semantic feedback primitives | Nevo UI |
| Exceptional action-required message | Alert when it truly needs emphasis | Nevo UI |
| Advanced disclosure | Collapsible | Nevo UI |
| Actions | Button, IconButton, Menu, Link | Nevo UI |
| Raw authored prose/config docs | MarkdownDocument where Markdown is the source format | Nevo UI |
| Project Settings sections/view models | feature-local compositions | SpecFlow UI |
| Workflow definition detail | feature-local composition | SpecFlow UI |
| Provider/profile rows | feature-local composition over list/row primitives | SpecFlow UI |
| Effective-config provenance | product composition/read model | SpecFlow UI/runtime |
| Compact code/file inspection | existing Developer Workspace capability track | Product/platform |

Do not create generic Nevo UI components named SettingsCard, ProviderCard, WorkflowCard, ConfigCard,
or similar merely for this screen.

## 15. Visual and token contract

This screen inherits semantic typography/colour rules from the shared design-system docs.

Use the current Nevo UI semantic roles; concrete token values remain design-system-owned.

| Purpose | Semantic treatment |
| --- | --- |
| Workspace/page surface | existing AppWorkspace/workspace material; no extra enclosing background Card |
| Primary title/value | text-content-primary |
| Supporting explanation | text-content-secondary |
| Low-priority metadata/path/source hint | text-content-muted |
| Section separation | whitespace first; then border-divider / border-border-subtle only when needed |
| Interactive row hover | shared interactive treatment such as bg-surface-hover through the owning primitive |
| Form/control surface | shared control treatment such as bg-surface-control through the owning primitive |
| Selected local navigation | use SideNavigation/navigation primitive selected treatment; do not invent a Settings-only colour |
| Action colour | use Button/Link semantic action variants; do not hard-code brand/action colours in screen code |
| Warning/error/info | resolve product state to semantic tone, then use shared feedback primitives/tokens |
| Code/raw config | neutral code surface; syntax/state colour only when semantically meaningful |

Do not use colour merely to make every Settings category visually different.

Do not use alternating Card backgrounds to create hierarchy.

## 16. Local containment rules

This screen deliberately uses stricter containment than many dashboard-style surfaces.

Project Settings is a linear inspection/configuration surface.

Therefore:

- no Card around the whole Settings page;
- no Card per Settings category;
- no Card per label/value fact;
- no Card per provider;
- no Card per agent profile;
- no Card per workflow step/gate;
- no Card per integration by default;
- no nested Cards/surfaces to express hierarchy;
- no shadowed sections in normal content;
- prefer headings + section whitespace;
- use dividers only when whitespace does not make the boundary clear;
- use a stronger contained surface only for an exceptional top-level summary/attention state or a
  genuinely independent interactive object.

Any implementation that introduces a new Card on this screen should be able to state the semantic
reason that content needs an independent boundary.

## 17. Accessibility, focus, and keyboard behavior

- Local Settings navigation must be keyboard operable and expose the selected section semantically.
- Switching sections moves/announces context in a way that makes the new section identity clear; do
  not unexpectedly move focus into arbitrary content.
- Nested detail Back returns focus to the control/item that opened the detail where practical.
- Narrow section selection must have an accessible name that communicates it changes the Settings
  section.
- Status cannot be encoded by colour alone.
- Raw configuration/code inspection needs keyboard scrolling and an accessible region name when it
  forms an independently scrollable region.
- Icon-only actions use accessible labels and comfortable hit targets.

## 18. Data / read-model requirements

The screen consumes the project Settings catalog/read model described earlier. It must not maintain
a second hard-coded inventory of settings and must not derive effective configuration or availability
by parsing raw YAML or unrelated runtime state in the UI.

### General

- project identity;
- stable workspace/repository facts.

### Configuration

- configured project source;
- configured local source when present;
- raw/readable content reference;
- effective/resolved values when the application can authoritatively provide them;
- provenance/source-of-value when available.

Exact precedence remains an open product/configuration contract.

### AI / Agents

- project defaults/policy;
- provider availability/configuration summary;
- agent/profile definitions;
- capabilities/defaults meaningful at project scope.

Do not mix a concrete Turn effort option or a reserved execution snapshot into project defaults
unless the authoritative configuration actually defines them.

### Workflows

- definitions;
- steps;
- gates/actions/transitions;
- semantic configuration metadata needed for human understanding.

### Repository / Git

- configured repository/remotes/root/default branch/settings.

### Integrations

- configured integration identity;
- availability/configuration state;
- supported setup/reconnect actions only when authoritative.

## 19. Storybook scenarios

The first composed Project Settings stories should use typed product view-model fixtures.

Minimum scenarios:

1. General — normal project.
2. Configuration — project + local + effective config available.
3. Configuration — local config absent.
4. AI / Agents — multiple providers + profiles, all normal.
5. AI / Agents — one provider unavailable but not user-blocking.
6. AI / Agents — configuration issue that genuinely requires user attention.
7. Workflows — definition list.
8. Workflows — selected definition detail with steps/gates/actions.
9. Repository / Git — normal configuration.
10. Integrations — none configured.
11. Partial read failure — one section/source unavailable while the rest remains usable.
12. Compact — Drawer global navigation + local Settings nav still visible beside content.
13. Narrow — explicit section selector + one-column section content.
14. Narrow workflow detail — Back returns to Workflows definitions.
15. Catalog variation — a new backend-provided ordinary setting appears without a screen-code change.
16. Extension contribution — an additional Settings group/section is rendered from the catalog.
17. Unsupported descriptor — one unknown value kind fails visibly without breaking other Settings.

Visual review must explicitly check that repeated rows do not drift into Card-per-item treatment.

## 20. Acceptance criteria

A composed implementation is acceptable when:

1. Project Settings clearly reads as one product workspace, not a dashboard of unrelated Cards.
2. Configuration/runtime/action ownership remains distinct.
3. A user can switch Settings sections without leaving Project Settings or triggering a mutation.
4. Wide/compact local section navigation and narrow section selection express the same hierarchy.
5. General facts are readable without individual fact Cards.
6. Provider/profile/workflow/integration collections default to rows/lists.
7. Workflow detail is readable linearly without a Card per step/gate.
8. Raw configuration is available as deeper inspection rather than dominating the normal summary.
9. Semantic status uses shared tones/components and is not colour-only.
10. An exceptional action-required state can stand out without making every normal section equally
    heavy.
11. Keyboard/focus behavior preserves orientation across section and nested-detail navigation.
12. The screen does not invent configuration precedence, provider actions, workflow mutations, or
    edit semantics that the application contract does not supply.
13. The frontend does not own a hard-coded complete Settings inventory.
14. Ordinary backend-provided settings/groups using known semantic value kinds can appear without
    bespoke screen implementation.
15. Extension/plugin-contributed Settings remain semantic data, not backend-provided UI markup.
16. Effective/default/configured values can be distinguished and their provenance explained.
17. Sensitive values cannot accidentally fall through to an ordinary plaintext renderer.
18. Refresh has one documented scope and does not invalidate unrelated product domains.

## 21. Open questions / deferred

Do not guess these during initial composition:

1. Exact project/local/default configuration precedence and effective-value provenance contract.
2. Which Settings areas become editable in the first product version.
3. Provider authentication/setup/reconnect flows and permissions.
4. Exact workflow-definition read model after deterministic workflow migration.
5. Whether some integration setup deserves a dedicated screen later.
6. Final compact code/file inspection component.
7. Exact URL shape for Settings sections and nested definition detail.
8. Whether future Tools configuration becomes a Settings section once a real tool-configuration use
   case exists.
