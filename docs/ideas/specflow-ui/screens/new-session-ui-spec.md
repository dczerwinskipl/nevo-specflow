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
  - implementing or reviewing how a new Session is started (the start form in the Session shell)
  - changing how a Session is named, or what a Session is started with
  - changing the agent choice shared by New Session and Create with an agent
summary: >
  UX contract of starting a new Session on an existing Specification inside the Session screen
  itself: the full Session shell renders at once with the pinned Specification as context, the agent
  is chosen on a start form directly in the conversation column (provider tiles, then labelled
  Model, Effort and Work mode fields, then the optional own name), the Composer is inactive (hidden
  on a phone) until Start, and Start allocates the Session in place: the conversation shows the
  ready empty state with the agent's logo and the user continues straight into the first message.
  The same labelled agent fields replace the Composer pickers in Create with an agent.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.screens.specification-creation
  - ideas.specflow-ui.components.session-composer-design
  - ideas.specflow-ui.screens.full-session
  - product.specflow.ui.ai-session-ux
  - reference.api.sessions
---

# New Session UI spec

**Status.** Owner-requested UX contract, revision 2 (owner decisions 2026-11-04). Revision 1 (a
separate New Session form page that opened the Session afterwards) is superseded; its naming rules
(section 7) stay. Mocked in Storybook; no backend or contract change is needed for the
New Session part (see [Integration dependencies](#10-integration-dependencies)).

## 1. Purpose

A person working on a Specification wants to start a new conversation with an agent about it and
then simply write. Starting must not feel like a separate form followed by a jump to another screen:
the user is in the Session screen from the first moment, chooses who works and how, and continues
in the same place. From the user's perspective Start is a short loading state while the Session is
saved.

## 2. Owner decisions

- **Start in the Session shell** (owner, 2026-11-04): _New session_ opens the full Session screen
  at once. Its regions that need a started Session are inactive until Start; the agent is chosen in
  the shell, not on a preceding page.
- **Start form in the conversation column, without its own surface** (owner, 2026-11-04): the choice
  sits where the conversation will be, above the inactive Composer, directly on the conversation's
  background. A modal was rejected because closing it leaves a dead shell with no agent, and on a
  phone it becomes the same full-screen form as before. A `Card` around the form was rejected after
  review ("a card in a card": the conversation pane is already a surface).
- **The empty conversation has an empty state** (owner, 2026-11-04): after Start, and in every
  Session without messages, the conversation shows the DS `EmptyState` (`pane`) with the agent's
  logo large, that the agent is ready, and that writing a message starts the conversation. It
  replaces both the start summary line of the first mock (rejected: "the small text on top looks
  bad") and the plain _Rozpocznij rozmowę._ line of today's Session.
- **Labelled fields for model, effort and work mode wherever a Session is started** (owner,
  2026-11-04: the Composer pickers are "tiny and easy to miss, yet the choice is important"; small
  is fine in the Composer because it is rarely changed there). This **reverses** the 2026-11-03
  decision that the start screens reuse the Composer's `ModelEffortPicker` and `ComposerModePicker`.
  The Composer keeps its compact pickers.
- **Create with an agent** keeps its own flow (the Create form). On success it lands in the Session
  screen as soon as the Session id is known (section 9).

## 3. Scenarios

- **(a) Open.** _New session_ on a Specification opens the Session screen: header **New session**,
  Context (Specification pinned, read-only), the start form in the conversation column and the
  inactive Composer. Nothing is saved yet.
- **(b) Choose the agent.** Provider tiles (the first available one preselected), then **Model**,
  **Effort** and **Work mode** fields, then **Session name**. The model is a deliberate choice (none
  preselected); choosing it enables Effort (the provider default selected) and Work mode (the
  provider's `defaultModeId` when the model runs it, else its first mode). Changing the provider
  resets everything below it. Context's executor row mirrors the choice as it is made.
- **(c) Start.** **Start session** (or Enter in the name field) locks the form and shows
  **Starting…** in the button. The Session is allocated; the URL is replaced with the Session's own
  (`/specs/$specId/sessions/$sessionId`, history replace, so Back does not return to the empty
  start state) without remounting the shell. The form is replaced by the ready empty state, the
  Composer becomes active with the chosen model and mode in its pickers, and focus moves to the
  message field.
- **(d) Write.** The first message is sent from the Composer as in any idle Session; naming follows
  section 7.
- **(e) Blocked.** Start stays disabled and the form's note names the one first reason, in reading
  order: configuration to refresh → **No executor is available right now** (every tile shows its own
  reason) → choose an available executor → **Choose a model** → choose a supported mode → **Enter a
  name or let the agent name it**.
- **(f) Failed or unknown outcome.** A failure shows an alert in the form, above its action
  row; the choices stay and the form unlocks. An unknown outcome is checked (**Check result**), never
  blindly repeated (the shared Create operation semantics).
- **(g) Leave before Start.** Nothing was saved, so leaving needs no confirmation; the Sessions list
  does not show anything. A reload shows the start state again with fresh defaults.
- **(h) Out of scope:** pinning Task or other context, worktree/branch options, delivering the own
  name and agent naming from the Runtime (section 10).

## 4. First scan

On open the user must answer, in order: _what is this Session about_ (Context, header) → _who will
work and how_ (the form, the only active region) → _what do I do next_ (Start). After Start the
questions are _is it ready, with whom_ (the empty state) and _what do I write_ (the focused
Composer).

The start form is the screen's single active region until Start; the Composer and the header's
Session actions do not compete with it. The rest of the shell is visible so the user sees where they
are and what will happen, not as content to read.

## 5. Composition

```text
Wide (split: conversation | Context)
┌ New session ─────────────────────── [panel] ┐┌ Context ───────────────┐
│                                              ││ Specification          │
│    Start a session                           ││ [doc] Logowanie SSO  📌 │
│    Agent                                     ││                        │
│    [Codex] [Claude ✓] [Antigravity]          ││ Executor               │
│    Model                                     ││ Claude · not chosen    │
│    [ Choose a model                    ˅]    ││                        │
│    Effort                                    │└────────────────────────┘
│    [ Default | low | high ]                  │
│    Work mode                                 │
│    [ Accept edits                      ˅]    │
│    ( ) Give it your own name                 │
│    note: Choose a model.     [Start session] │
│ ░ Choose the agent first ░░░░░░░░░░░░░░ [➤] │  ← Composer, inactive
└──────────────────────────────────────────────┘

After Start (and any Session without messages)
┌ New session ─────────────────── [panel] [⋯] ┐
│                                              │
│                  (Claude logo)               │
│               Claude is ready                │
│   Write a message below to start the         │
│   conversation.                              │
│                                              │
│ [ Message…                     ] mode model ➤│  ← Composer, focused
```

- **Start form, no own surface.** The form sits directly on the conversation background, at the
  conversation's content width (the messages' column), with the conversation's own padding; no
  `Card`, border or fill around it. It starts at the top of the conversation on every layout
  (owner, 2026-11-04: centred in the free height looked odd on desktop); when it does not fit the
  column scrolls, the Composer stays docked and never covers the form's last row. Title **Start a
  session** (`title-md`); its parts are separated by spacing, not by separators; the action row
  (note at the start, **Start session** at the end) is the form's last row, not a page footer.
- **Ready empty state.** The DS `EmptyState` `pane` (centred in the free height) with the
  provider's logo at the empty state's large glyph size as its icon, title **{Provider} is ready**
  and description **Write a message below to start the conversation.** It names the provider only:
  model and work mode are visible in the Composer right below, so they are not repeated. It is the
  empty state of every Session without messages (new or reopened), not only right after Start, and
  disappears when the first message is sent. The provider's colour logo is used as it is (no muted
  tint), so the agent is recognisable.
- **Fields, geometry stable.** Model, Effort and Work mode are always rendered once a provider is
  chosen; before a model is chosen Effort and Work mode are disabled with their placeholders, so
  choosing a model never adds rows. A model without efforts shows Effort disabled at **Default**.
- **Composer before Start.** Wide: inactive, in the same position and height as in a started
  Session; the field is disabled with the placeholder **Choose the agent and start the session**;
  the model and mode pickers are not shown (they would duplicate the form's fields); Send is
  disabled. Narrow: **not shown** until Start (owner, 2026-11-04: on a phone it only takes space
  from the form); it appears docked at the bottom together with the ready empty state.
- **Header.** Title **New session**; actions: the side-panel toggle (Wide) or **Context** (Narrow).
  The Session's ⋯ actions (rename, archive, delete) appear only after Start.
- **Context.** The Specification row is live. **Executor** shows the chosen provider and, once
  chosen, the model (`Claude · not chosen yet` before). Sections that exist only after the first
  Turn (Work history, telemetry) are absent, exactly as in an idle started Session, so Start
  changes nothing in Context but the executor's state. Skeletons are used only while the
  Specification or the provider catalogue is loading.
- **Narrow (375 px).** The same order in one column: form at the top of the conversation, provider
  tiles stacked, fields full width, the action row wraps the note above the button; no Composer
  until Start; Context opens from the header. No horizontal scroll.

## 6. Agent fields (shared start presentation)

| Field         | Control                                                                                                                               | Notes                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Agent**     | provider `ChoiceTile`s (`ProviderChoice`), one radio group                                                                            | Unavailable providers are disabled with their reason. Fixed for the Session's life.       |
| **Model**     | DS `Field` + `OptionPicker` (Select up to 8 models, searchable Combobox above, a DS rule), full width, placeholder **Choose a model** | Required. The model title, with the model id as `meta` only when titles repeat.           |
| **Effort**    | DS `Field` + `SegmentedControl`: **Default** (the provider default) followed by the model's efforts                                   | Disabled until a model is chosen; **Default** selected.                                   |
| **Work mode** | DS `Field` + `OptionPicker`, the provider catalogue's own modes and titles                                                            | Disabled until a model is chosen. Pinned for the Session's life (no mode-change command). |

Copy: provider terms such as **Effort** are not translated in the Polish locale (owner,
2026-11-04), unless the providers themselves publish an official translation; generic words
(**Domyślny**) are translated. Model and mode titles are the catalogue's own.

The same `AgentFields` composition is used by the start form and by Create's agent section; the
Composer keeps `ModelEffortPicker` and `ComposerModePicker`. Component map:

| Piece                                     | Owner / decision                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `ProviderChoice`, `ChoiceTile`            | reused as-is                                                            |
| `AgentFields` (new)                       | product composition from DS `Field`, `OptionPicker`, `SegmentedControl` |
| `SessionNameSection` / `OwnValueSetting`  | reused; inside the form its heading is one level lower                  |
| Start form                                | product composition on the conversation background; no surface          |
| Ready empty state                         | DS `EmptyState` `pane`; icon = `SessionProviderIcon` at large size      |
| Inactive Composer (Wide)                  | DS `MessageComposer`, disabled; no new variant                          |
| `ModelEffortPicker`, `ComposerModePicker` | Composer only (no longer used by the start contexts)                    |

## 7. Session naming

Unchanged from revision 1. Default: the switch **Give it your own name** is off and its description
says _"The agent names the session from your first message."_; switching it on reveals the name
field (max 256, the `CreateSessionSchema.title` limit; a character count in the last 32) and the
description becomes _"The agent will not rename it."_; switching off keeps the typed text. After
Start the header shows **New session** (or the own name at once). After the first message in an
unnamed Session the header `status` shows a spinner and **Naming…** (polite live region), then the
generated name; a failed naming keeps the provisional title (Rename in the header ⋯ menu).

## 8. States

Composer column: Wide / Narrow.

| State                  | Conversation column                                                 | Composer               | Context executor          |
| ---------------------- | ------------------------------------------------------------------- | ---------------------- | ------------------------- |
| Loading catalogue      | form skeleton (tiles and fields in final geometry)                  | inactive / hidden      | skeleton                  |
| Ready, no model        | first available provider selected; **Choose a model.**              | inactive / hidden      | provider · not chosen yet |
| Model chosen           | Effort and Work mode enabled; Start enabled                         | inactive / hidden      | provider · model          |
| No provider available  | tiles disabled with reasons; **No executor is available right now** | inactive / hidden      | not chosen                |
| Starting               | form locked; **Starting…**                                          | inactive / hidden      | provider · model          |
| Failed                 | alert in the form; choices kept, unlocked                           | inactive / hidden      | provider · model          |
| Unknown outcome        | locked except **Check result**                                      | inactive / hidden      | provider · model          |
| Started (idle Session) | ready empty state                                                   | active, focused (both) | as in any Session         |

## 9. Create with an agent

Create keeps its own form and flow (title, archetype, workspace, agent). Its agent section uses the
same `AgentFields` as the start form (section 6). On success, when the user chose to create with an
agent, the user lands in the Session screen as soon as the Session id is known, in the Started
state of section 8 (ready empty state, focused Composer); when the Create operation shows its progress
page, that page hands over to the Session the same way instead of to the Specification.

## 10. Integration dependencies

| Capability                                         | Status                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Allocate a Session (provider, mode, model, effort) | existing: `POST /api/sessions` (`reference.api.sessions`); allocation does not launch the provider, so Start is quick |
| Provider catalogue and availability                | existing: `GET /api/session-providers`; the demo uses the creation catalogue                                          |
| Start without remounting the shell                 | UI routing only (history replace into the Session route)                                                              |
| Own name at creation                               | `CreateSession.title` exists; the demo allocation has no title — missing in the demo path                             |
| Agent-generated name and naming state              | missing (no auto-title, no naming status in the Session read model)                                                   |
| Create with an agent on a real project             | missing: the project Create form and operation do not choose an agent nor allocate a Session                          |

## 11. Storybook scenarios

`SpecFlow/Screens/Session Start (mock)`: Wide — open (no model), Claude with a model chosen,
Antigravity with a long model list (searchable), starting, started (ready empty state, focused
Composer), start failed, no provider available; Narrow 375 px — open, model chosen (no Composer),
started. Revision 1's `SpecFlow/Screens/New Session` stories remain until the start form replaces
the route.

## 12. Open questions

1. Should the Session header also show the provisional title as the first words of the first message
   (instead of **New session**) while naming is pending? (from revision 1)
2. Create with an agent on a real project needs a backend change (section 10): plan it in the same
   work, or as a separate item?
