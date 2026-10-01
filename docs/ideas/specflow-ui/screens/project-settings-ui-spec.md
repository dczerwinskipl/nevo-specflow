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

The default entry selects General unless the route/product navigation expresses another stable
Settings section.

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

## 4. Information hierarchy

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

## 5. Screen anatomy

### 5.1 Shared workspace

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

### 5.2 Header

Header content:

- title: Project Settings;
- no decorative status badge;
- no global Save button while the screen is read-only-first;
- future section-specific mutation actions may appear only when an actual editable contract exists.

The project selector remains global navigation responsibility and should not be duplicated in the
Settings header merely to fill space.

### 5.3 Local Settings navigation

Use a compact local navigation/list treatment.

Each item contains the section label. Add secondary metadata only when it helps navigation, not to
make every row look richer.

Do not render each category as a Card/tile.

### 5.4 Section content

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

## 6. Section-specific structure

### 6.1 General

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

### 6.2 Configuration

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

### 6.3 AI / Agents

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

### 6.4 Workflows

Purpose: inspect deterministic workflow definitions.

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

### 6.5 Repository / Git

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

### 6.6 Integrations

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

## 7. Responsive contract

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
section-nav + content composition while the available width remains comfortable.

Do not collapse local Settings navigation merely because global navigation collapsed.

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

## 8. Interaction flows

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

## 9. States

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

## 10. Component / composition map

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

## 11. Visual and token contract

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

## 12. Local containment rules

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

## 13. Accessibility, focus, and keyboard behavior

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

## 14. Data / read-model requirements

The screen needs application-level projections; it must not derive effective configuration or
availability by parsing unrelated runtime state in the UI.

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

## 15. Storybook scenarios

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

Visual review must explicitly check that repeated rows do not drift into Card-per-item treatment.

## 16. Acceptance criteria

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

## 17. Open questions / deferred

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
