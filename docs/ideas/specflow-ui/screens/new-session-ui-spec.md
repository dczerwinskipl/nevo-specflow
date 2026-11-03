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
  - changing how a Session is named, or what the first message of a Session is written in
  - changing the agent choice shared by New Session and Create with an agent
summary: >
  UX contract of starting a new Session on an existing Specification: the Specification pinned as
  read-only context, the agent, the first message in the Session Composer (with the first Turn's
  work mode and model · effort), the default agent-generated name with an explicit own-name
  alternative, the read-only workspace, the naming state of the Session header, and the Session
  start block shared with Create. UI-only: the first message, own name and naming are not yet
  delivered by the Runtime.
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
route `/specs/$specId/sessions/new`. No backend or contract change was made: the first message, the
own name and the agent-generated name are **not** sent to or produced by the Runtime yet (see
[Integration dependencies](#9-integration-dependencies)). It refines the open "Starting a new Session"
point of the [navigation and route model](../navigation-and-route-model.md#starting-a-new-session).

## 1. Purpose

A person working on a Specification wants to start a new conversation with an agent **about that
Specification**, saying right away what the agent should do, without naming the Session first and
without being asked about workspace or worktree choices.

## 2. Scenarios

- **(a)** **Start on an existing Specification.** The Specification is the pinned context, shown read-only (title, key, **Pinned** badge) — it is not a choice. The workspace is shown read-only (path · branch); there are no worktree/branch options. Task context cannot be pinned yet and is not mentioned.
- **(b)** **Agent and first message.** The agent (provider) is chosen with tiles — it is fixed for the life of a Session, so it is never in the Composer. The **first message is the main input**, written in the same Composer the Session uses; its toolbar carries the first Turn's work mode and model · effort with the Session Composer's own pickers. The model is a deliberate choice (none preselected); the work mode follows the model's capabilities (the provider's `defaultModeId` when the model runs it, else its first mode; modes are the provider catalogue's own, under its own titles); "no effort" means the provider default and is an explicit row of the effort section.
- **(c)** **Session name.** Default: _"The agent names the session from your first message."_ — one line, no field. **Give it your own name** reveals a name field (max 256, the `CreateSessionSchema.title` limit; a character count appears in the last 32) and focuses it; **Let the agent name it** hides it again, keeps the typed text for a later switch and returns focus to **Give it your own name**. The footer note says which applies. A chosen own name must not be blank. After start, the Session header shows the provisional title **New session** with a small spinner and **Naming…**, then the generated name; an own name is shown at once with no naming state. A failed naming keeps the provisional title (Rename is in the header ⋯ menu).
- **(d)** **Create a Specification with a Session** uses the same start block without the first message: provider tiles, then **Model and work mode** with the same two pickers. Its Session opens idle and the message is written in the opened Session (unchanged Create contract).
- **(e)** **Blocked / failed.** The start button stays disabled and the footer names the one first reason, in reading order: configuration to refresh → **No executor is available right now** (every provider unavailable; each tile shows its own reason) → choose an available executor → choose a model → choose a supported mode → **Write the first message** (whitespace does not count; Enter does not start either) → **Enter a name or let the agent name it**. A failed start keeps the form, the message and the choices and shows the failure under the form (shared Create failure panel); an unknown outcome is checked, never blindly repeated (shared Create operation).
- **(f)** **Out of scope:** pinning Task (or any other) context, worktree/branch options, real agent naming, delivering the first message/own name to the Runtime, attachments in the start Composer.

## 3. First scan and layout

Order answers: _what will this Session work on → who works → what do I ask → what will it be called →
where does it run_. One primary action: **Start session** in the pinned footer. The Composer has no
Send button (one primary action per page); on a physical keyboard Enter in the message starts the
Session exactly like the button (same operation), on a touch layout Enter inserts a new line.

```text
Wide (Primary only, content-form width)            Narrow 375px (same order, one column)
┌──────────────────────────────────────────────┐   ┌───────────────────────────────┐
│ New session                                  │   │ ‹ Specification               │
│ The agent starts from your first message…    │   │ New session                   │
│──────────────────────────────────────────────│   │ The agent starts from…        │
│ Context                                      │   │───────────────────────────────│
│ [doc] Logowanie SSO · Specification   Pinned │   │ Context                       │
│──────────────────────────────────────────────│   │ [doc] Logowanie SSO   Pinned  │
│ Agent                                        │   │───────────────────────────────│
│ [Codex ✓]            [Claude]                │   │ Agent                         │
│──────────────────────────────────────────────│   │ [Codex ✓]                     │
│ First message                                │   │ [Claude]                      │
│ ┌──────────────────────────────────────────┐ │   │───────────────────────────────│
│ │ Write what the agent should start with…  │ │   │ First message                 │
│ │                                          │ │   │ ┌───────────────────────────┐ │
│ │ Agent ˅                 codex model A ˅  │ │   │ │ …                         │ │
│ └──────────────────────────────────────────┘ │   │ │ Agent ˅   codex model A ˅ │ │
│ The work mode and model apply to this…       │   │ └───────────────────────────┘ │
│ Session name                                 │   │ Session name                  │
│ The agent names the session…  [Own name]     │   │ The agent names the session…  │
│──────────────────────────────────────────────│   │ [Give it your own name]       │
│ Where do you want to work?  /demo · main     │   │───────────────────────────────│
├──────────────────────────────────────────────┤   │ Where…  /demo/project · main  │
│ …the agent names it.        [Start session]  │   ├───────────────────────────────┤
└──────────────────────────────────────────────┘   │ note            [Start session]│
                                                   └───────────────────────────────┘
```

Session header right after start (both widths): `New session  ◌ Naming…        [Context]` with the
activity subtitle below, then `<generated name>` once named.

## 4. Shared Session start block and the duplicated agent pickers

Before this change the agent's model, effort and mode were implemented twice: as form fields in Create
(`LocalizedOptionPicker` selects for model and effort, a `SegmentedControl` for the mode) and as the
Session Composer's two-section menus (`ModelEffortPicker`, `ComposerModePicker`). **Decision: one
presentation — the Composer's pickers** — because a Session must start with the controls it continues
with, the accepted V10 Composer has exactly one model · effort picker, and the route model asks for
the shared composer instead of one-off start controls. The provider stays tiles because the Composer
must never offer a provider switch.

| Piece                                     | Owner                                            | Used by                                  |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `session-start/ProviderChoice`            | `features/specs/creation` (catalogue projection) | New Session, Create agent section        |
| `session-start/AgentSettings`             | same; renders the sessions feature's pickers     | Start Composer toolbar, Create agent row |
| `session-start/FirstMessageComposer`      | same; DS `MessageComposer` + `Field`             | New Session                              |
| `session-start/SessionNameSection`        | same; DS `TextInput`, `Field`, `Button`          | New Session                              |
| `ModelEffortPicker`, `ComposerModePicker` | `features/sessions` (exported from its barrel)   | Session Composer, both start screens     |
| `naming/SessionNamingStatus`              | `features/sessions`                              | Session header `status` slot             |

Shared-picker extensions made for the start context (no new DS component, no lookalike):
`ModelEffortPicker` accepts any provider with a model list and the two override capabilities
(`ModelEffortProvider`) and an optional `defaultEffortLabel` that adds the explicit provider-default
effort row; `ComposerModePicker` takes catalogue-described `WorkModeOption`s (opaque id + the
catalogue's own title), so both start screens and the Session Composer list whatever modes the
provider's catalogue reports — no UI mode vocabulary (owner decision, 2026-11-03).

## 5. States

| State                          | What changes                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Loading catalogue              | Shared Create fallback (`Loading…`), retry on failure.                                                          |
| Ready, nothing chosen          | Model trigger **Choose a model**; no work-mode trigger yet; footer: **Choose a model.**                         |
| Model chosen                   | Work-mode trigger appears (provider default mode preferred); effort section shows the provider default checked. |
| Message written, agent names   | Footer note: _opens with this message and the agent names it_; button enabled.                                  |
| Own name chosen                | Field visible and focused; blank → disabled with reason; footer note: _opens with this message_.                |
| Starting / unknown / recovery  | Everything locked; shared Create labels (**Starting…**, **Check result**, **Check operation**).                 |
| Failed                         | Failure panel under the form; form, message and choices kept.                                                   |
| Session header, naming pending | Title **New session**, `status` = spinner + **Naming…** (`role=status`); Context action stays direct.           |
| Session header, named          | Title = generated or own name; no naming status.                                                                |

## 6. Responsive and accessibility

- One column at every width; the Composer toolbar keeps mode and model on one row at 375px (both
  pickers truncate with the full label in `title`); no horizontal scroll at 375px.
- The message has a visible label (**First message**); the pickers keep their own menu labels; the
  provider tiles are one radio group named by the **Agent** legend.
- Own-name disclosure moves focus into the field; switching back moves focus to the disclosure button.
- The naming status is a polite live region in the header.

## 7. Session header naming state

`ManagedSession` takes `namingPending?: boolean`. While it is set, the header title is the provisional
**New session** and its `status` slot shows `SessionNamingStatus` (a provider-wait spinner still takes
precedence). Nothing sets it yet: the Runtime does not report naming, so the real route leaves it off and
the stories use a stand-in Session screen (`naming/sessionLanding.stories-support.tsx`) with the real
`WorkspaceHeader`.

## 8. Storybook scenarios

`SpecFlow/Screens/New Session`: Agent Names Session (a, b, c → header naming → generated name), Agent
Names Session Mobile (375), Own Name (c alternative, switch back keeps text), Own Name Mobile (count),
Effort And Mode (explicit effort and mode reach the allocation, Enter starts), No Provider Ready (+
Mobile), Empty Message, Start Failed. `SpecFlow/Screens/Session Naming`: Naming Pending (+ Mobile),
Named By Agent, Own Name No Naming. Create (d) stays covered by `SpecFlow/Contracts/Creation Demo` and
the Owner V5 / Connected consistency contracts, now driven through the Composer pickers.

## 9. Integration dependencies

| Capability                                    | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Allocate a Session for a Specification (demo) | existing-new (`DemoSessionInput`: provider, model, effort, mode)                         |
| Own name at creation                          | `CreateSessionSchema.title` exists (max 256); the demo allocation has no title — missing |
| Start with a first message (first Turn)       | missing in the allocation; the route receives it (`SessionStart`) for that integration   |
| Agent-generated name + naming state           | missing (no auto-title, no naming status in the Session read model)                      |
| Mode vocabulary                               | resolved: the creation catalogue's provider `modes` (id + title) and `defaultModeId`     |

## 10. Open questions

1. Should the Session header also show the provisional title as the first words of the message
   (instead of **New session**) while naming is pending?
2. ~~Mode vocabulary~~ — **resolved** (owner, 2026-11-03: "Runtime jest źródłem prawdy"): the
   work modes are the provider catalogue's own, per provider, under the provider's own names; the
   UI has no Ask/Plan/Edit/Agent vocabulary (session-composer-design §3 owner decision).

Resolved: Create's agent row keeps the Composer pickers (owner, 2026-11-03: the Session Composer's
pickers are the refined presentation; the earlier `Select` + `SegmentedControl` contract is replaced).
