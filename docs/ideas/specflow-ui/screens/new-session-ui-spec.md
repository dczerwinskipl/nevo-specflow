---
id: ideas.specflow-ui.screens.new-session
type: product
title: New Session UI spec
status: draft
scope: specflow
areas:
  - ui
  - ai
tags:
  - session
  - creation
  - composer
  - naming
  - mock
read_when:
  - implementing or reviewing the New Session screen or its Session-start block
  - changing how a Session is named, or what a Session is started with
  - changing the agent choice shared by New Session and Create with an agent
summary: >
  UX contract of starting a new Session on an existing Specification: the Specification pinned as
  read-only context, the agent section shared with Create Specification (executor, work mode and
  model · effort), the default agent-generated name with an explicit own-name alternative (the same
  switch-and-field pattern as Create's branch name), and the Session that opens idle, whose first
  message is written in its own Composer and starts the naming. UI-only: the own name and naming
  are not yet delivered by the Runtime.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.screens.specification-creation
  - ideas.specflow-ui.components.session-composer-design
  - ideas.specflow-ui.screens.full-session
  - product.specflow.ui.ai-session-ux
---

# New Session UI spec

**Status.** Owner-requested UX contract, implemented as UI with mocked data (Storybook) on the demo
route `/specs/$specId/sessions/new`. No backend or contract change was made: the own name and the
agent-generated name are **not** sent to or produced by the Runtime yet (see
[Integration dependencies](#9-integration-dependencies)). It refines the open "Starting a new Session"
point of the [navigation and route model](../navigation-and-route-model.md#starting-a-new-session).

## 1. Purpose

A person working on a Specification wants to start a new conversation with an agent **about that
Specification**, choosing who works and how, without naming the Session first and without being
asked about workspace or worktree choices. The Session opens idle; the first message is written in
its own Composer.

## 2. Scenarios

- **(a)** **Start on an existing Specification.** The Specification is the pinned context, shown read-only (title, key, **Pinned** badge) — it is not a choice. There is no workspace section and no worktree/branch option: the Session runs where the Specification does. Task context cannot be pinned yet and is not mentioned.
- **(b)** **Agent.** The same section as Create Specification (`CreateAgentSection`, with New Session's own heading **Agent** and intro): provider tiles — the agent is fixed for the life of a Session, so it is never in the Composer — then the row **work mode and model · effort** with the Session Composer's own pickers. There is no first-message field. The model is a deliberate choice (none preselected); the work mode follows the model's capabilities (the provider's `defaultModeId` when the model runs it, else its first mode; modes are the provider catalogue's own, under its own titles); "no effort" means the provider default and is an explicit row of the effort section.
- **(c)** **Session name**, built like Create's branch name (`OwnValueSetting`: a switch, with the automatic value said in its description, revealing the own field). Default: the switch **Give it your own name** is off and its description says _"The agent names the session from your first message."_ — no field. Switching it on reveals the name field (max 256, the `CreateSessionSchema.title` limit; a character count appears in the last 32) and the description becomes _"The agent will not rename it."_; switching it off hides the field, keeps the typed text for a later switch and the agent names the Session. A chosen own name must not be blank. After start the Session opens **idle**: header title **New session**, empty Composer, no naming state. When the first message is sent in the Session and no own name was given, the header shows a small spinner and **Naming…**, then the generated name; an own name is shown at once and never replaced. A failed naming keeps the provisional title (Rename is in the header ⋯ menu).
- **(d)** **Create a Specification with a Session** uses the same agent section (it is the same component): provider tiles, then **Model and work mode**. Its Session opens idle and the message is written in the opened Session (unchanged Create contract).
- **(e)** **Blocked / failed.** The start button stays disabled and the footer names the one first reason, in reading order: configuration to refresh → **No executor is available right now** (every provider unavailable; each tile shows its own reason) → choose an available executor → choose a model → choose a supported mode (and an effort the model supports) → **Enter a name or let the agent name it**. A failed start keeps the form and the choices and shows the failure under the form (shared Create failure panel); an unknown outcome is checked, never blindly repeated (shared Create operation).
- **(f)** **Out of scope:** pinning Task (or any other) context, worktree/branch options, real agent naming, delivering the own name to the Runtime.

## 3. First scan and layout

Order answers: _what will this Session work on → who works and how → what will it be called_. One
primary action: **Start session** in the pinned footer, in a form (Enter in the name field submits it
like the button). Sections use Create's headings, spacing and separators.

```text
Wide (Primary only, content-form width)            Narrow 375px (same order, one column)
┌──────────────────────────────────────────────┐   ┌───────────────────────────────┐
│ New session                                  │   │ ‹ Specification               │
│ The agent works in the context of this spec… │   │ New session                   │
│──────────────────────────────────────────────│   │ The agent works in…           │
│ Context                                      │   │───────────────────────────────│
│ [doc] Logowanie SSO · Specification   Pinned │   │ Context                       │
│──────────────────────────────────────────────│   │ [doc] Logowanie SSO   Pinned  │
│ Agent                                        │   │───────────────────────────────│
│ [Codex ✓]            [Claude]                │   │ Agent                         │
│ Work mode and model · effort                 │   │ [Codex ✓]                     │
│ [codex model A ˅] [Agent ˅]                  │   │ [Claude]                      │
│──────────────────────────────────────────────│   │ Work mode and model · effort  │
│ Session name                                 │   │ [codex model A ˅] [Agent ˅]   │
│ [ ] Give it your own name                    │   │───────────────────────────────│
│     The agent names the session…             │   │ Session name                  │
├──────────────────────────────────────────────┤   │ [ ] Give it your own name     │
│ …opens without a message…   [Start session]  │   ├───────────────────────────────┤
└──────────────────────────────────────────────┘   │ note            [Start session]│
                                                   └───────────────────────────────┘
```

Session right after start (both widths): `New session   [Context]`, an empty Composer; after the
first message `New session  ◌ Naming…  [Context]`, then `<generated name>`.

## 4. Shared Session start block and the duplicated agent pickers

Before this change the agent's model, effort and mode were implemented twice: as form fields in Create
(`LocalizedOptionPicker` selects for model and effort, a `SegmentedControl` for the mode) and as the
Session Composer's two-section menus (`ModelEffortPicker`, `ComposerModePicker`). **Decision: one
presentation — the Composer's pickers** — because a Session must start with the controls it continues
with, the accepted V10 Composer has exactly one model · effort picker, and the route model asks for
the shared composer instead of one-off start controls. The provider stays tiles because the Composer
must never offer a provider switch.

| Piece                                     | Owner                                            | Used by                                       |
| ----------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| `session-start/ProviderChoice`            | `features/specs/creation` (catalogue projection) | New Session, Create agent section             |
| `session-start/AgentSettings`             | same; renders the sessions feature's pickers     | `CreateAgentSection` (both screens)           |
| `options/CreateAgentSection`              | same; heading/intro overridable                  | Create agent section, New Session             |
| `form/OwnValueSetting`                    | same; DS `SwitchField` + `Field`                 | Branch name, specification name, Session name |
| `session-start/SessionNameSection`        | same; heading + intro + `OwnValueSetting`        | New Session                                   |
| `ModelEffortPicker`, `ComposerModePicker` | `features/sessions` (exported from its barrel)   | Session Composer, both start screens          |
| `naming/SessionNamingStatus`              | `features/sessions`                              | Session header `status` slot                  |

Shared-picker extensions made for the start context (no new DS component, no lookalike):
`ModelEffortPicker` accepts any provider with a model list and the two override capabilities
(`ModelEffortProvider`) and an optional `defaultEffortLabel` that adds the explicit provider-default
effort row; `ComposerModePicker` takes catalogue-described `WorkModeOption`s (opaque id + the
catalogue's own title), so both start screens and the Session Composer list whatever modes the
provider's catalogue reports — no UI mode vocabulary (owner decision, 2026-11-03).

## 5. States

| State                          | What changes                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading catalogue              | Shared Create fallback (`Loading…`), retry on failure.                                                                                                                                                             |
| Ready, nothing chosen          | Model trigger **Choose a model**; no work-mode trigger yet; footer: **Choose a model.**                                                                                                                            |
| Model chosen                   | Work-mode trigger appears (provider default mode preferred); effort section shows the provider default checked. Footer note: _opens without a message and the agent names it after the first one_; button enabled. |
| Own name chosen                | Switch on, field visible; blank → disabled with reason; footer note: _opens without a message, with your name_.                                                                                                    |
| Starting / unknown / recovery  | Everything locked; shared Create labels (**Starting…**, **Check result**, **Check operation**).                                                                                                                    |
| Failed                         | Failure panel under the form; form and choices kept.                                                                                                                                                               |
| Session idle (after start)     | Title **New session** (or the own name), empty Composer, no naming status.                                                                                                                                         |
| Session header, naming pending | After the first message in the Session: `status` = spinner + **Naming…** (`role=status`); Context stays direct.                                                                                                    |
| Session header, named          | Title = generated or own name; no naming status.                                                                                                                                                                   |

## 6. Responsive and accessibility

- One column at every width; model and work mode wrap like Create's agent row (both pickers truncate
  with the full label in `title`); no horizontal scroll at 375px.
- The pickers keep their own menu labels; the provider tiles are one radio group named by the
  **Agent** legend.
- The own-name switch keeps focus where it is (a real switch with a description, as Create's branch
  name); the field appears under it.
- The naming status is a polite live region in the header.

## 7. Session header naming state

`ManagedSession` takes `namingPending?: boolean`, set once the first message was sent in an unnamed Session. While it is set, the header title is the provisional
**New session** and its `status` slot shows `SessionNamingStatus` (a provider-wait spinner still takes
precedence). Nothing sets it yet: the Runtime does not report naming, so the real route leaves it off and
the stories use a stand-in Session screen (`naming/sessionLanding.stories-support.tsx`) with the real
`WorkspaceHeader`.

## 8. Storybook scenarios

`SpecFlow/Screens/New Session`: Agent Names Session (a, b, c → idle Session → first message sent
there → naming → generated name), Agent Names Session Mobile (375), Own Name (c alternative, switching
off keeps the text; the own name is shown at once and never replaced), Own Name Mobile (count), Effort
And Mode (explicit effort and mode reach the allocation), No Provider Ready (+ Mobile), Start Failed.
`SpecFlow/Screens/Session Naming`: Idle Before First Message, Naming Starts After First Message, Naming
Pending (+ Mobile), Named By Agent, Own Name No Naming. Create (d) stays covered by
`SpecFlow/Contracts/Creation Demo` and the Owner V5 / Connected consistency contracts.

## 9. Integration dependencies

| Capability                                    | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Allocate a Session for a Specification (demo) | existing-new (`DemoSessionInput`: provider, model, effort, mode)                         |
| Own name at creation                          | `CreateSessionSchema.title` exists (max 256); the demo allocation has no title — missing |
| Session opens idle                            | existing: the first message is written in the Session's own Composer                     |
| Agent-generated name + naming state           | missing (no auto-title, no naming status in the Session read model)                      |
| Mode vocabulary                               | resolved: the creation catalogue's provider `modes` (id + title) and `defaultModeId`     |

## 10. Open questions

1. Should the Session header also show the provisional title as the first words of the first message
   (instead of **New session**) while naming is pending?
2. ~~Mode vocabulary~~ — **resolved** (owner, 2026-11-03: "Runtime jest źródłem prawdy"): the
   work modes are the provider catalogue's own, per provider, under the provider's own names; the
   UI has no Ask/Plan/Edit/Agent vocabulary (session-composer-design §3 owner decision).

Resolved: Create's agent row keeps the Composer pickers (owner, 2026-11-03: the Session Composer's
pickers are the refined presentation; the earlier `Select` + `SegmentedControl` contract is replaced).
