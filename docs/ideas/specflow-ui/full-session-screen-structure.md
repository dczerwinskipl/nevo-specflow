---
id: ideas.specflow-ui.full-session-screen-structure
type: product
title: Full Session screen structure
status: draft
scope: specflow
areas:
  - ui
  - ai
  - runtime
tags:
  - session
  - conversation
  - commentary
  - work
  - context
  - primary-secondary
  - human-attention
  - responsive
read_when:
  - designing Full Session or floating Session
  - deciding what belongs in Session Primary versus contextual Secondary
  - presenting current activity, Work history, pending interactions, Tasks, or files
  - validating single-Task, batch, generic, resumable, and attention Session states
summary: >
  Screen-structure pass for Full Session and floating Session. Defines Conversation as Primary,
  Context as the default split Secondary, Work/File contextual inspection, current-activity and
  attention placement, batch scope, and narrow behavior without freezing final components.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.information-navigation-inventory
  - ideas.specflow-ui.spec-task-information-hierarchy
  - ideas.specflow-ui.spec-task-screen-structure
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - architecture.ai.canonical-session-turn-work
  - ideas.developer-workspace.code-inspection-and-editing
---

# Full Session screen structure

## 1. Purpose

This document applies the same screen-structure discipline used for Specification + Task to the
second major product surface: Full Session.

It does not freeze:

- exact chat components;
- exact inspector tabs/navigation;
- exact split ratios;
- exact URL shape;
- final artifact/Handover contracts;
- provider-specific rendering;
- visual styling.

It does freeze the intended information hierarchy strongly enough to validate the product flow.

The central model is:

```text
FULL SESSION

PRIMARY
Conversation / human-readable work stream

SECONDARY
Context by default on split layouts
or an explicitly selected inspector/detail
```

The Session is a work interface, not a provider transcript and not a raw tool log.

---

### 1.1 Accepted Workspace V2 direction — 2026-10-29

**Owner-approved Workspace/navigation (V2).** The following HTML files are interactive,
standalone UX references with synthetic data, not production components or API promises:

- [Desktop: Session Workspace V2](examples/session-workspace-v2/desktop.html)
- [Mobile: Session Workspace V2](examples/session-workspace-v2/mobile.html)

Approved: one Session Conversation Primary plus one Secondary; Context as a pinned home tab;
Context summaries open independently revisitable root tabs, while dependent details remain in each
tab's local Back stack; files can be independently open tabs; responsive desktop sizing and
panel-side swap; mobile drill-in via header/Back without bottom tabs. See §10 for exact behavior.

**Subsequently approved (2026-10-30):** Session Chat V10 interaction and information
hierarchy: [desktop](examples/session-chat-v10/desktop.html),
[mobile](examples/session-chat-v10/mobile.html), and the
[accepted V10 design direction](components/session-chat-v10-design.md). The chat is a normal
conversation; commentary structures the separate Work timeline; live activity is concise;
workflow events link to exact details; Composer options stay inside its frame.
**Not approved as implementation:** mock CSS, fixture data, provider capabilities, Context row
and evidence layouts, exact component visuals or final API shapes. In particular mobile
Composer's diamond/square icons and overflowing/wrapping controls must be replaced with
semantically meaningful Nevo UI Design System components/icons. Example content including large file collections, multiple
attempts, handovers and artifacts illustrates required scenarios, not settled screen design or
implemented Runtime contracts. Designs may anticipate missing backend capabilities, but those
must be identified for delivery rather than silently represented as available.

## 2. Canonical facts the UI can rely on

### 2.1 Current contract

The authoritative new SpecFlow architecture models:

```text
Session
└── Turn
    ├── Work: commentary
    ├── Work: reasoning
    ├── Work: interaction
    └── Work: tool
        └── ToolAction
```

Runtime/application code owns semantic projections such as:

- current activity;
- whether user attention is required;
- summarized phase/status;
- Session readiness.

UI must not rebuild those semantics from raw provider events or by scanning Work arrays.

### 2.2 Old-repo deterministic evidence

The legacy canonical Session UI/runtime also demonstrates useful migration concepts:

- application Session identity;
- Spec association;
- contextual/historical Task associations;
- active Turn;
- pending interaction;
- Turn status;
- currentActivity;
- historicalWork;
- finalAnswer;
- Session readiness;
- provider capabilities/mode;
- single-Task or Task-batch execution in newer deterministic flow.

These are evidence for product needs, not a target DTO for the new repository.

---

## 3. Full Session topology

### 3.1 Wide

Default entry:

```text
┌──────────────────────────────────────┬─────────────────────────────┐
│ Conversation / Session Primary       │ Context Secondary           │
│                                      │                             │
│ human-readable chronology            │ execution / related Tasks   │
│ current activity                     │ attention / actions         │
│ pending interaction                  │ artifacts / handovers       │
│ composer                             │ Session metadata as needed  │
└──────────────────────────────────────┴─────────────────────────────┘
```

Product direction: Context is open by default when entering Full Session on a split-capable layout
and no more specific Secondary target was requested.

The empty right side should not remain unused while useful Session context exists.

### 3.2 Compact

If AppWorkspace still supports split at the available width, use the same default:

```text
Conversation | Context
```

Navigation may already be a Drawer. Navigation collapse does not imply workspace stacking.

### 3.3 Narrow

Do not auto-push Context when entering the Session.

```text
Full Session
  Conversation
  [Context]

  compact Work burst >
  Task / Handover / artifact references >

tap Context or a detail target
  -> pushed local Secondary
  <- Back to Session
```

The Primary must expose enough current state to understand what is happening without opening detail.
Floating Session does not exist on Narrow.

### 3.4 Default does not mean permanent

Context is the default Secondary content on split-capable Full Session entry, not a panel the product
continually forces open.

If the user closes Secondary:

- keep it closed until an explicit user action reopens Context or another detail;
- do not reopen it on new messages/current activity;
- do not auto-switch it because Work or a human interaction arrived.

Task/Handover/Work/future File details are local inspector state created by user actions, not stable
deep-link URL state.

## 4. Session Primary — human-readable work stream

### 4.1 Job of the surface

Primary should answer:

- what did I ask;
- what is the agent saying;
- what is happening now;
- does the agent need something from me;
- what was the meaningful path to the current/final result;
- can I continue the conversation.

It should not require opening Work merely to discover whether the Session is busy, waiting, or
requires attention.

### 4.2 Structural order

```text
Session header
  Session identity/title
  parent Specification orientation
  agent role/profile when useful
  contextual actions

Conversation stream
  user message
  Commentary / meaningful progress
  compact Work summary
  assistant final answer
  ...

Live / current region
  current activity
  pending interaction when any

Composer
  availability determined by authoritative readiness/capabilities
```

The exact placement of the live/current region may be sticky near the composer or integrated into
chronology later. The requirement is that current activity remains visible/discoverable in Primary.

When the canonical current-activity projection summarizes the same underlying streaming Commentary
or tool work already visible in chronology, do not render two equally prominent copies of the same
fact. Primary needs one clear live answer plus discoverable chronology, not duplicated "working"
chrome.

### 4.3 Conversation chronology

The normal stream preserves human-readable chronology across:

- user requests;
- Commentary when supplied;
- compact semantic Work summaries;
- first-class pending/resolved interactions;
- final answers.

Raw tool calls and outputs do not become ordinary chat bubbles.

Reasoning is not automatically promoted into the normal conversation stream merely because it exists
as canonical Work. Its presentation follows product/capability policy and deeper inspection rules.

### 4.4 Commentary

Commentary is useful because it explains what the agent is doing and often why.

Rules:

- preserve meaningful Commentary in chronology;
- do not fabricate Commentary for providers/Turns that do not supply it;
- do not replace current activity with stale Commentary;
- repeated/noisy progress can be compressed at summary levels while canonical history remains intact.

### 4.5 Compact Work summaries

Tool activity should normally appear as semantic summaries, for example:

```text
Read 4 files · searched repository
Ran tests
Edited 3 files
```

The summary should be clickable when deeper Work inspection exists.

Exceptional Work deserves more prominence than repetitive happy-path history:

- failed tool/action;
- interrupted/cancelled work;
- user interaction;
- unknown/unavailable state.

---

## 5. Current activity

### 5.1 Primary responsibility

Current activity belongs in Session Primary even though full Work history lives in Secondary.

Examples:

```text
Reviewer · Reviewing TASK-03
Running tests…
Waiting for model…
Waiting for tool result…
Cancelling…
```

Use canonical Runtime currentActivity/readiness, never visual inference from the last Work item.

Waiting for model/tool without required user input is calm live state, not attention. When the
authoritative Session capability/runtime contract allows Turn cancellation, Primary may expose a
Cancel action near current activity. After cancellation is requested, Cancelling is a live
transition state and should prevent conflicting actions until Runtime resolves it. Do not render a
fake Cancel control for providers/sessions that do not support it.

### 5.2 Execution scope wording

Historical/contextual Session association is not current execution.

Valid current execution presentations include:

```text
Generic/spec-level work

Implementer · TASK-03

Reviewer · 3 Tasks
  TASK-02, TASK-03, TASK-04
```

For Task batch execution:

- show the batch as a batch;
- do not choose a fake primary Task;
- the Primary summary may use a compact count;
- full scope remains directly inspectable in Context.

### 5.3 Terminal Turn

When a Turn settles:

- remove the live "working" presentation;
- preserve the final answer and meaningful historical path;
- do not infer that the Task/workflow is completed.

If authoritative workflow state says more legal work remains, expose continue/resume separately.

If ambiguous durable state requires recovery, expose recovery separately.

---

## 6. Pending interaction / requires attention

### 6.1 Interaction is Primary content

Permission, question, or confirmation is first-class Work and requires the human.

A pending interaction must be visible in Session Primary without requiring Context or Work.

```text
Agent needs your input

Question / permission / confirmation
details needed to decide

[response controls]
```

The interaction response is the deliberate mutation.

Canonical interaction state controls whether response controls remain actionable. If the provider
operation disappears, the interaction expires, or restart recovery marks it interrupted, the UI must
not leave stale permission/question/confirmation controls enabled. Historical interaction evidence
may remain visible, but it is no longer an active request.

### 6.2 Composer and interaction controls

Do not assume a generic composer is the correct response mechanism for every pending interaction.

The authoritative interaction/readiness/capability contract decides whether:

- dedicated controls answer the interaction;
- normal composer remains available;
- Session is read-only/unavailable;
- another operation is required.

Avoid UI-local rules such as "requiresAttention always disables composer" unless the application
contract explicitly says so.

### 6.3 Attention outside the current Turn

Context may also contain workflow-level attention related to the Session's Spec/Tasks.

Do not conflate:

```text
Session interaction requires response
```

with:

```text
TASK-03 requires owner review
```

Both may be visible, but they have different owners and actions.

---

## 7. Context Secondary — default inspector

### 7.1 Job of Context

Context answers:

- what product work is this Session related to;
- what is it executing now;
- what requires human action around that work;
- which Tasks/artifacts/handovers matter;
- what should I open next for more specific context.

It should not become a metadata dump.

### 7.2 Proposed structural order

```text
Executor                      (always first: provider, selected model and effort)
  scope note                  (only when the Session's links are unknown, §7.6)

Specification                 (Specification- and Task-scoped Sessions)
  Specification row
  Documents row               (real: opens that Specification's Documents)

Current execution
  agent role/profile
  generic / single Task / Task batch
  effective execution configuration only when useful

Attention / next actions
  Session interaction summary
  Spec/Task human-required action
  continue/resume/recovery when relevant

Related Tasks
  contextual/historical Tasks

Work                          (real: Work history of the current or last Turn)

Planned areas                 (preview rows, §7.4: Files / Changes, Handovers, Artifacts,
                               Instructions, Environment)

Session details
  token usage, cost, context window and provider limits, always last
  (provider-limits refresh, §7.7)
```

The order is fixed: a section changing state (loading, ready, note) replaces the content of its own
slot and never moves its neighbours. Whether a section is present, loading, a note or a failure
follows §7.6. The former "empty sections disappear" is refined there: nothing is shown for a
subject the Session has no association with, but a known association whose data is missing is said
out loud.

When a Session interaction already requires response in Primary, Context may summarize that fact for
orientation but should not duplicate the full response controls. The authoritative interaction stays
actionable from Primary.

Likewise, Context should not become a universal place to execute unrelated Spec/Task owner
decisions. A Task-specific review/approval signal routes to that Task detail inside Secondary; a
Spec-level decision routes to the Specification decision context. Session-owned controls such as a
pending interaction or supported Turn cancellation remain Session controls.

### 7.3 Current execution vs related Tasks

Keep these visually and semantically separate.

```text
Current execution
  TASK-03, TASK-04, TASK-05

Related Tasks
  TASK-01
  TASK-02
```

A Task can be historically/contextually related without being active in the current Turn.

### 7.4 Context to tabs; Task to local stack

The Context home is a **pinned Secondary tab**. Context itself does not duplicate the tab row with
a second horizontal set of section buttons or repeat the full section lists in a competing menu.
Its concise, clickable content summaries open/reselect **root tabs** such as Tasks, Files/Changes,
History, Handovers, Artifacts, Instructions or Environment when useful.

**Real subjects versus Planned areas.** Three subjects have a real screen and sit in their own
sections: **Documents** (a row under the Specification, a route to that Specification's Documents
with the Session as the way back), **Work history** (section "Work", opens the Work tab of the
current or last Turn, one tab per Turn) and **Tasks** (Current execution and Related Tasks). The
remaining five (Files / Changes, Handovers, Artifacts, Instructions, Environment) have no screen
yet: they are one flat section **"Planned areas"**, a preview of what Context will cover. Their rows
still open a placeholder tab ("This area is a preview — its content will come later.") so the
navigation mechanics are real. No sub-groups, and no "coming soon" labels on the real subjects.

### 7.4.1 Per-object tabs (owner decision 2026-11-03)

A root tab's identity is **the object it shows**. Each Task opened from Context is its own root tab
(label = the Task key, `TASK-03`); a Task that is already open is **activated**, never duplicated
and never retargeted to another Task. The "Related Tasks (N)" summary with more than one Task opens
the **Tasks list tab** ("Zadania"); selecting a Task there opens that Task's own tab beside the
list, so a Task never lives both as a tab and as a page inside the list.

An attempt, review event, rejection and feedback opened from a Task push deeper on **that Task
tab's local stack**:

```text
Context [pinned] | Tasks [tab: task list]
                 | TASK-03 [tab: task -> review attempt 1 -> feedback]
                 | TASK-04 [tab: task]
                 | Files [tab: file list]
                 | backend.md [independent file tab]
```

Switching tabs preserves their local stack and each tab's scroll position; the screens of inactive
tabs are not kept mounted, so selection, filters and drafts are **product state** (the Documents
pattern), and leaving a tab with unsaved work asks that tab's leave guard first. Back returns to the
direct parent inside the active tab. Do not spawn an independent tab for a task-bound event and lose
provenance. History events opened in History also retain explicit Task/attempt context and a local
return path.

### 7.5 Handover / artifact selection

When a handover, report, or evidence object is an independently addressable or shared resource
(e.g. one review report covering several Tasks), a separate document/artifact tab is appropriate,
with the original object identity and links back to every relevant Task. Details bound to a
specific Task execution or attempt belong in its local stack. This distinction is a Workspace
navigation decision; the exact canonical Handover and artifact contracts still need integration.

Do not create a third simultaneous workspace pane.

### 7.6 Context data availability

Every fact-backed section carries a `ContextFact`: `loading`, `ready`, `unreadable` or `missing`.
The Session also has a **scope**: `unknown` (not provided or unreadable), `standalone`,
`specification` or `task`. The scope decides which sections exist and which references are
required:

| Section           | Exists for scope    | Required (missing = error)  |
| ----------------- | ------------------- | --------------------------- |
| Executor          | always              | always                      |
| Specification     | specification, task | specification, task         |
| Current execution | specification, task | task (the executed Task(s)) |
| Attention         | specification, task | never                       |
| Related Tasks     | specification, task | never                       |
| Work              | always              | never                       |

Resolution of one section: no fact, or an empty ready list, is **omitted**; `loading` shows the
section label with skeleton rows at the height of the rows they stand for (one row; a Task-scoped
execution shows `min(taskCount, 3)`), so a Specification or Task title is one truncated line (full
title as the row's accessible name and hover title) and never wraps the row taller on arrival; `unreadable` is a **warning** note; `missing` is a warning for
an optional reference and an **error** note for a required one. An absent association ("not
created") is never a note. The whole-panel "Context is not available" screen is gone: Context always
keeps the facts it does know.

Notes are the DS `InlineNote` in the section's slot, under its label: `info`, `attention` for a
warning and `danger` for an error. They are passive: no live region (Context is an inspector the
reader opens, not an alert), the text carries the meaning, the icon is decorative. No retry in v1.

- Scope unreadable (the association read failed): one panel-level attention note under the
  Executor, no label: "Couldn't load this session's links." A standalone Session has no note. The
  former "not provided" note is retired: every Runtime mode serves the association read (§7.6.1).
- Specification unreadable: "Couldn't load this session's Specification." Missing and required:
  "Can't find Specification {key} that this session belongs to."
- Execution Task missing and required: "Can't find {key}, the Task this session is executing." For a
  batch: "{count} of {total} Tasks for this session can't be found." (the Tasks that were found still
  render beside the note). Execution unreadable: "Couldn't load the Tasks being executed."
- Attention unreadable: "Couldn't check whether anything needs your attention." Related Tasks
  unreadable or missing: "Couldn't load related Tasks."
- Executor unreadable: "Couldn't load executor details." Missing (not in the provider catalogue):
  "This session's executor is no longer available."
- Work history unreadable or missing: "Couldn't load the work history." (Polish: "Nie udało się
  wczytać historii pracy."), a warning note in the Work section's slot under its label; the section
  is not hidden.

The Documents row appears only while the Specification is ready: a loading Specification's skeleton
covers both rows, an unreadable or missing one shows only its note. Work history is `loading` before
the first snapshot and absent when the Session has no Turn yet.

#### 7.6.1 Specification and Related Tasks from the association read (accepted 2026-11-08)

Every Runtime mode serves `GET /api/sessions/:sessionId/association`
([Sessions API](../../reference/api/sessions.md#association-read)); it is the only source of the
Session's scope, so the scope survives reloads and deep links without a client cache. A Session
started from a Specification is seeded from the composed create response, so first paint and reload
agree. `scopeNotProvided` is no longer shown.

An associated Session has scope `specification` with or without Tasks, never `task`: its associated
Tasks fill **Powiązane zadania** (Related Tasks). **Aktualne wykonanie** (Current execution) is
omitted, because an association is context, not execution, and no Engine execution fact is read.
**Uwaga / dalsze działania** (Attention) is omitted too: its Session-owned fact (a pending
interaction) is owned by Primary. Copy says **powiązana**, never "pracuje nad".

| Association read                    | Specification section                                                                                                                               | Powiązane zadania                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loading                             | nothing                                                                                                                                             | nothing                                                                                                                                                                       |
| `standalone`                        | omitted; no note                                                                                                                                    | omitted                                                                                                                                                                       |
| `available`, current                | Specification row (key, title) plus Documents row                                                                                                   | one row per `available` Task (key or id, title); none omits the section                                                                                                       |
| `available`, `collection: archived` | same; row supporting text `sessions.context.specification.archived` **W archiwum**; links carry `collection=archive`                                | as above                                                                                                                                                                      |
| `forbidden`                         | info note `specificationForbidden` **Nie masz uprawnień do wyświetlenia specyfikacji powiązanej z tą sesją.**; no Documents row                     | omitted                                                                                                                                                                       |
| `missing`                           | danger note `specificationMissingNamed` **Nie znaleziono specyfikacji {{key}}, z którą powiązana jest ta sesja.** (`specificationMissing` likewise) | omitted (one cause, one note)                                                                                                                                                 |
| `unavailable`                       | attention note `specificationUnreadable` **Nie udało się wczytać specyfikacji tej sesji.**                                                          | omitted                                                                                                                                                                       |
| some Tasks `missing`                | per the Specification's state                                                                                                                       | found Tasks plus attention note `relatedTasksMissing` **Nie znaleziono {{count}} z {{total}} powiązanych zadań.** / _{{count}} of {{total}} associated tasks can't be found._ |
| Tasks `unavailable`                 | per the Specification's state                                                                                                                       | attention note `relatedTasksUnreadable` **Nie udało się wczytać powiązanych zadań.**                                                                                          |
| read failed (HTTP)                  | panel note `scopeUnreadable` **Nie udało się wczytać powiązań tej sesji.**                                                                          | omitted                                                                                                                                                                       |

Two deliberate deviations from the rules above: while the association loads, no Specification
skeleton shows (a standalone Session would show a skeleton that then vanishes); and the
`relatedTasksMissing` note replaces the generic "Couldn't load related Tasks" for missing Tasks.
Keys live in `sessions.context.availability.*`. Rationale:
[Session association UX](session-association-ux/README.md).

### 7.7 Session details: provider-limits refresh (owner accepted 2026-11-08)

Session details render the [telemetry API](../../reference/api/session-telemetry.md) snapshot; a
reading that is absent, unavailable or masked is not shown as zero or "unknown". Only account
`limits` are admitted by the Runtime refresh scheduler, so they carry the only refresh control:
usage, cost and context arrive with Turns. There is no global or section-wide Refresh.

- **Placement:** one `Button variant="ghost" size="sm" leadingIcon="refresh"` trailing in the
  heading row of "Limity dostawcy". Visible label `Odśwież`, accessible name
  `Odśwież limity dostawcy`.
- **Offered only when** `limits.refreshable` and `session.capabilities.manage`; otherwise omitted,
  never disabled. `limits` unavailable with `NOT_AUTHORIZED` renders no limits section at all (no
  heading, zero, "unknown" or control). Whenever the control is offered the section keeps its
  heading even without rows (unavailable for another reason, or zero windows), because the user can
  act on it; `isTelemetryVisible` counts it. An archived Session keeps the refresh (read-only).
- **Pending** (POST in flight, or `refresh.state` `queued`/`running` for `limits`): the button reads
  `Odświeżanie…`, is `aria-disabled` with a guarded handler and keeps focus; it is the only
  indicator. Completion arrives as a newer SSE `telemetry` revision: values replace in place, no
  toast.

| Outcome                                                               | Control                                              | Note (one status and one alert region per limits section)                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| idle, no rows                                                         | enabled                                              | info: `Limity nie zostały jeszcze odczytane.`                                                     |
| `REFRESH_FAILED`, previous values kept                                | enabled                                              | attention: `Nie udało się odświeżyć limitów. Pokazano ostatni odczyt.`                            |
| `REFRESH_FAILED`, nothing to show                                     | enabled                                              | attention: `Nie udało się odczytać limitów.`                                                      |
| 429 `retryAfterMs`, or a newer snapshot's `refresh.retryAfterSeconds` | `aria-disabled`, guarded, until the time passes      | info: `Limity odświeżono przed chwilą. Odświeżenie będzie znów możliwe za moment.` (no countdown) |
| 403 or 422 `CAPABILITY_UNSUPPORTED`                                   | removed for this mount; focus to the section heading | info until the next snapshot: `Odświeżanie limitów jest niedostępne.`                             |
| other definite rejection (400, 409)                                   | enabled; next press is a new request                 | info: `Odrzucono odświeżenie limitów.`                                                            |
| network/503 (receipt not confirmed)                                   | enabled; next press reuses the same `requestId`      | danger, `role="alert"`: `Nie potwierdzono odświeżenia. Spróbuj ponownie.`                         |

Info and attention notes use `role="status"`; only the unconfirmed request uses `role="alert"`.
Losing access to the Session's telemetry (403/404 read) drops the snapshot and every refresh note.
`migration` is an operational diagnostic and is not shown: its consequences already render as
absent or partial readings.

---

## 8. Work inspection in Secondary

### 8.1 Job of Work inspection

Work inspection answers:

> What did the agent/runtime actually do?

It is a technical/history detail opened deliberately by the user, not a permanent sibling mode that
the product must keep visible beside Context.

### 8.2 Information levels

Use the existing product levels:

```text
L1 Summary / Now       Primary
L2 Expanded Work       opened inspection detail
L3 Work details        selected Work detail
L4 Action details      selected ToolAction/detail
```

### 8.3 Entry

Compact Work bursts remain in Conversation chronology. Explicit inspection opens/reselects the
Work root tab **of that Turn** inside the **same** Secondary: one tab per Turn, labelled
"Work history · turn N". A Work block in the conversation and Context's "Work history" row for the
same Turn land on the same tab; another Turn opens or activates its own. ToolAction details push
onto the tab's local stack. Current activity/live updates must never steal focus or change the
active tab.

### 8.4 Drill-down

Within Secondary:

```text
Work detail
  -> Tool group
  -> ToolAction / output
  <- Back
```

One Secondary is reused; no third pane is created.

### 8.5 Live updates

Current activity remains visible in Primary. Incoming Work may update counts/statuses, but it must
not auto-open Work inspection or reset/replace the detail the user is currently viewing.

## 9. File detail in Secondary

An independently inspected file can open as its own Secondary tab, so several files may remain open
alongside Context and other work areas. A file tab may show read-only Markdown/code, a revision-aware
preview or a diff when that capability exists. Open in IDE is an optional future escalation.

The proposed UI can demonstrate these cases with synthetic data, but the current managed Session
API does **not** provide a complete semantic file-reference, historic revision or diff contract.
Until a reliable backend is implemented, no production surface should pretend a file was read,
changed or is previewable. A mention, a read, an edit and an open user tab are different facts.

No file capability may introduce a third simultaneous pane.

## 10. Secondary navigation model — owner-approved Workspace V2

### 10.1 Root tabs versus local stacks

On split-capable Full Session entry, **Context is a pinned home tab** in Secondary. The user opens
or reactivates another root tab by selecting a Context summary or explicit Session reference.
Examples of independent roots: Tasks, Files/Changes, History, Handovers, Artifacts, Instructions,
Environment, Work inspection, independently opened files and shared reports.

A root tab is for an independently revisitable working surface; a local stack is for dependent
details. Task -> attempt -> rejected review -> feedback stays inside that Task's tab (each Task is
its own root tab, §7.4.1). Work -> ToolAction stays inside the Work tab of its Turn (one per Turn,
§8.3). A local detail must reveal its Task/attempt provenance.
Switching tabs preserves each tab's stack and scroll; Back pops inside the active tab before returning to
its root. Closing a tab does not close or reset the whole Session. Context remains pinned.

On desktop Context is a tab from the start: the editor-tab rail (36px, at every depth) shows
already while Context is the only tab, so opening Work history or Tasks adds a tab without moving
the header or the content. The tab keeps its root's name at any depth (the Work tab stays "Historia
pracy" while a ToolAction is open). Local depth is a detail header row at the top of the tab, under
the rail, and never changes the rail:

- **Default — detail header row** for a one-level drill (Work history -> ToolAction, Tasks -> Task):
  a `←` named `Wróć do: Historia pracy` (built from the parent level's title, returning to the
  direct parent) followed by the opened object's own header (a ToolAction's title and status), which
  therefore appears once, in that non-scrolling row, not again in the content below.
- **Opt-in — breadcrumbs** only for a stack whose every level is worth jumping back to
  (Tasks › TASK-03 › Attempt 2 › Review), declared per stack (`localNavigation: 'breadcrumbs'`),
  never derived from depth alone. `←` pops one level, ancestors jump straight back, the current
  object is plain text; at narrow widths middle segments fold into `…` while root, the way back to
  the direct parent and the current level stay. No Session stack opts in today.

Tabs are editor tabs as wide as their names (64-240px), without icons, the active one on the panel
surface under a 2px primary top accent; tabs that do not fit go to the `More (N)` menu, which lists
only them. Mobile keeps its header Back and title with no row
under it. Back remounts the parent (its scroll returns to the top unless the product keeps it).
Contract:
[Secondary navigation](../../design-system/implementation/react/secondary-navigation.md#root-tabs-and-local-navigation-split-layout).

Do not add a second horizontal section-selector bar alongside these tabs, or a second navigation
tree inside Context duplicating all sections. Long lists (e.g. many Tasks or 100+ files) belong in
their own tabs with search/filter/progressive loading, not eagerly expanded Context content.

### 10.2 Desktop geometry

- **Only Context open:** default narrow Secondary, conceptually around 330px where room permits.
- **Second root tab opened:** default **50/50 Conversation/Secondary**, retained while switching
  among existing tabs. Do not resize based on active content or tab type.
- **Manual splitter:** user can adjust widths. Manual choice has priority and must not be reset
  by tab activation. Minimum viable widths and persistence scope are implementation details.
- **Swap sides:** user can place Secondary on the other side of Primary without changing ownership,
  tabs or stacks.
- **Full-width inspection:** may be offered for very wide diff/code surfaces, but must not create
  a separate navigation authority or silently reflow on ordinary tab switching.
- When closing tabs returns to only pinned Context, default narrow sizing may be restored unless
  the user's manual setting intentionally remains in force.

Preset controls in the prototype are **exploration affordances** and are not necessarily final UI.
The [V10 design contract](components/session-chat-v10-design.md#7-dynamic-workspace-split-shared-design-system-capability-gap)
now spells out auto/manual transitions, available-width constraints, restoring manual sizes,
side swap and narrow return behavior; the shared Design System lacks that complete contract.
The Design System's current AppWorkspace has preset split modes but does not yet provide all V2
behaviors (manual splitter, tab-root state ownership and side swapping). Implementers must assess
a coherent extension rather than inventing local, conflicting workspace engines.

### 10.3 Mobile

Mobile/Narrow uses one visible surface at a time; no bottom tab bar. Conversation opens first.
Context and root destinations open on explicit action, and details drill down via the header and
Back. **Back follows the actual path**: opening an object pushes it on top of the stack even when
it was visited before (Context -> Task A -> Back -> Context -> Task A pushes again), so Back always
returns to where the user came from; there are no per-object tabs on Narrow. A header-level
opened-item switcher may support multiple open files. The event title and
its parent Task/attempt remain clear. Navigation must preserve Conversation composer draft and
scroll when returning.

### 10.4 Closing, Back and URL

One Session Primary and one Secondary. Secondary tab/stack state is local UI state, not a new
routable URL and not a third pane. Session route remains independently addressable. Normal live
events never switch tabs or push/pop stacks. On mobile, system/browser Back should pop local
details first where technically integrated and return to Conversation before leaving the Session.

## 11. Floating Session

### 11.1 Purpose

Floating Session is the quick interaction surface used for Session conversation from
Task/Specification where the floating presentation is supported, without abandoning that work
context.

It is not a mandatory waypoint to Full Session: the originating Session reference may expose a direct
Open full session action.

It is not a compressed copy of every Full Session inspector.

### 11.2 Proposed structure

```text
Floating Session header
  Session title / agent role
  concise relation to entry context
  [Open full session]

Recent conversation
  recent user/assistant content
  meaningful Commentary
  compact current activity

Pending interaction
  when one requires response

Composer / response controls
  according to readiness/capabilities
```

### 11.3 What stays out

Do not make floating Session host:

- full Work history;
- raw tool details;
- full Context inspector;
- full Task detail;
- file browser;
- large artifact/review inspection.

Those are reasons to promote to Full Session or use the underlying Task/Spec surface.

### 11.4 Entry context vs execution scope

If floating Session is opened from TASK-03 while current execution is a batch TASK-02/03/04:

```text
Entry context
  TASK-03

Current execution
  3 Tasks
```

Do not relabel the whole execution as TASK-03 merely because that is where the user clicked.

Full Session should expose the complete scope.

---

## 12. State A — generic/spec-level Session

A Session can be associated with a Spec and historical Tasks while the current Turn has no Task
execution identity.

### Primary

```text
User
  Investigate why workflow admission is failing

Commentary
  Checking the workflow admission path…

Current activity
  Searching repository…
```

Do not show "working on TASK-03" from historical association.

### Context

```text
Current execution
  Generic / Spec-level

Specification
  Spec A

Related Tasks
  TASK-02
  TASK-03

Recent artifacts / activity
  ...
```

---

## 13. State B — single-Task execution

### Primary

```text
Implementer · TASK-03
Editing workflow admission…

conversation / Commentary / compact Work
```

### Context

```text
Current execution
  Implementer
  TASK-03 — deterministic admission

Task state / attention
  current workflow meaning
  next human/agent action when relevant

Related evidence
  changes
  Handover
  verification
```

Selecting TASK-03 opens Task detail in Secondary without leaving Session Primary.

---

## 14. State C — Task-batch execution

### Primary

```text
Reviewer · 3 Tasks
Reviewing implementation…

conversation / Commentary / compact Work
```

Do not show a representative Task as the execution identity.

### Context

```text
Current execution
  Reviewer
  TASK-02
  TASK-03
  TASK-04

Per-Task outcome/state
  TASK-02 ...
  TASK-03 ...
  TASK-04 ...

Shared evidence
  review report
  common Session artifacts
```

One shared review artifact may support several Tasks while per-Task verdicts remain separate.

Selecting one Task narrows Secondary detail to that Task but does not rewrite Session execution scope.

---

## 15. State D — Session requires human interaction

### Primary

```text
Agent needs your input

Allow command execution?
command / reason / details

[Allow] [Deny]
```

The interaction is visible without opening Context.

### Context

Context can still show why this Turn exists:

```text
Current execution
  Implementer · TASK-03

Related workflow
  implementation step

Task attention
  no separate owner decision
```

Session interaction attention and Task workflow attention remain distinct.

---

## 16. State E — Turn settled, more work remains

### Primary

```text
Last Turn settled

Final answer / last Commentary

More work can continue
[Continue]
```

Show Continue only when authoritative readiness allows it.

This can occur before attempt activation during remediation, during an active attempt, or for a
safely replayable unfinished operation.

### Context

```text
Workflow / execution
  more legal work remains

Reason
  ...

Next action
  Continue / remediation
```

Do not call this "Task done."

---

## 17. State F — recovery required

### Primary

```text
Execution stopped

Recovery required
short human-readable reason

[Inspect recovery]
```

### Context

```text
Affected operation
  ...

Why automatic continuation is unsafe
  ...

Authoritative recovery action
  ...
```

Recovery-required is not the same as Session requires-attention interaction and not the same as
ordinary resumable state.

Technical operation records remain deeper inspection.

### 17.1 Turn whose outcome is unknown (owner accepted 2026-11-08)

User question: "Did my last request finish, and can I continue?" While
`snapshot.activeTurn?.state === 'unknown'`, one **attention `Alert`** in the Composer overlay stack
(the slot of `savedRequestUnreadable`/`commandFailed`: above the Composer, below a pending
interaction) is the single owner of the fact:

- the Turn's Work block shows no live line and no spinner (Chat V10 §3.1);
- the header subtitle reads `Wynik tury nieznany` (precedence in §22.1);
- the Composer stays visible and gated by `capabilities.start`; Stop is not offered (cancel is
  refused for `unknown`); Context does not repeat the action, so Narrow needs no Context visit.

Title `Nie wiadomo, jak zakończyła się ostatnia tura`; body `SpecFlow nie otrzymał potwierdzenia
wyniku od dostawcy. Polecenie mogło zostać wykonane — nie zostanie wysłane ponownie.`

| State                                                                     | Presentation                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manage                                                                    | `Button size="sm"` `Sprawdź wynik` (`SessionRecoveryNotice` pattern) calling reconcile.                                                                                         |
| no Manage                                                                 | No button; line `Wynik może sprawdzić osoba zarządzająca tą sesją.`                                                                                                             |
| pending, and after a 200 until the stream moves the Turn out of `unknown` | Button `aria-disabled`, guarded, `Sprawdzanie…`.                                                                                                                                |
| 409 `SESSION_RECOVERY_REQUIRED`                                           | Alert stays; status line `Dostawca nie ma jeszcze dowodu wyniku. Tura pozostaje nierozstrzygnięta — spróbuj ponownie później.`; next press is a new request.                    |
| network failure (unconfirmed)                                             | Alert line `Nie potwierdzono sprawdzenia. Spróbuj ponownie.`; next press reuses the `requestId`.                                                                                |
| other definite refusal (403, 422, …)                                      | Its own refusal copy; next press is a new request.                                                                                                                              |
| resolved (SSE turn change)                                                | Alert unmounts; the outcome renders through the Work block/outcome row. One polite toast `Ustalono wynik tury.` only when this view's reconcile returned `reconciled === true`. |

Never combined with resend, never replays the prompt, never patches state from the 200 body.

---

## 18. State G — waiting without human action

Waiting is live state, but not human attention.

### Primary

```text
Waiting for model…
```

or:

```text
Waiting for tool result…
```

Keep the state visible and calm. Do not show warning/attention treatment unless authoritative
readiness says the human is required.

### Context

Context can continue showing execution scope and related product work, but it should not invent a
next human action merely because the Turn is waiting.

---

## 19. State H — terminal failure, cancellation, or interruption

A terminal Turn may end without a normal completed final answer.

### Primary

```text
Turn failed / cancelled / interrupted

human-readable outcome or cause
last meaningful Commentary / work summary

[Retry / Continue] only when authoritative application state permits
```

A failed ToolAction inside an otherwise active Turn is not promoted to this Session-level terminal
state. The Turn/runtime projection remains authoritative.

Technical stack traces, raw tool outputs, provider details, and operation records stay in Work/deep
inspection unless they are the only useful human-readable explanation.

### Context

Context should show the surrounding workflow consequence separately:

```text
Turn outcome
  interrupted

Task/workflow
  still active / resumable / recovery required / no action
```

Do not infer Task completion or recovery policy from the terminal Turn outcome alone.

---

## 20. State I — unavailable / unknown Session state

When authoritative Session state cannot be established or the provider/runtime is unavailable,
preserve history but make the inability to act explicit.

### Primary

```text
Session unavailable

human-readable reason when known
historical conversation remains visible

composer/action availability follows authoritative readiness
```

Unknown/unavailable is not the same as a failed historical Turn.

The Context Secondary keeps every fact it still knows in this state: an unreadable or unavailable
association is a note in that section's slot (§7.6), never a screen that replaces the whole
Context.

Transport reconnecting may be shown as connection feedback, but transport state must not overwrite
canonical Session/Turn semantics. Once authoritative state is restored, the canonical projection
wins.

---

## 21. Narrow / mobile validation

### 21.1 Primary entry

Full Session opens directly to Conversation. Floating Session does not exist on Narrow.

```text
☰  Session title

Spec A
Reviewer · 3 Tasks

Current activity
Reviewing changes…

[Context]

conversation...
compact Work bursts are clickable

composer / interaction controls
```

### 21.2 Context pushed detail

```text
←  Context

Executor
  Claude · Opus · high

Specification
  Spec A
  Documents

Current execution
  Reviewer
  3 Tasks

Needs attention
  TASK-03 owner decision

Related Tasks
  ...

Work
  Work history · Current Turn

Planned areas
  ...
```

The same sections and rules as wide (§7.2, §7.6); loading and note states occupy the same slots.
From the Documents row, the Documents tree (also with no document open) shows the Session as its
way back.

### 21.3 Work/detail pushed inspection

Clicking a compact Work burst, Task, Handover, artifact, or future File reference pushes that detail
using the same local Secondary stack.

Back walks the local detail stack and eventually returns to Conversation.

No information necessary to know what is happening now or that the Session needs a response may
exist only in pushed detail.

## 22. Header and parent context

Full Session has no permanent top-level sidebar entry, so the surface should preserve lightweight
parent orientation.

Candidate header information:

- Session title;
- agent role/archetype when useful;
- parent Specification identity;
- concise current execution scope;
- contextual surface actions.

Do not overload the header with provider/model/internal ids.

### Return from Full Session

Full Session is a normal routed product surface. Back returns through router history to the previous
routed surface.

If that surface is a Specification, the product does not promise to reconstruct a Task or other
Secondary selection from the URL. Secondary is local Workspace state.

A direct Session route still exposes parent orientation (for example owning Specification when
available), but does not invent a previous Secondary state.

### 22.1 Session actions, archived and view-only Session (owner accepted 2026-11-08)

Rename, Archive/Unarchive and Delete live in the header `⋯` menu (`WorkspaceHeaderAction`,
`direct: 'never'`), Delete last with `tone: 'danger'`. Commands and errors are the
[Sessions API](../../reference/api/sessions.md) contract.

- **Gating:** Rename and Archive/Unarchive only with `capabilities.manage`, Delete only with
  `capabilities.delete`; an absent capability omits the item, no items means no menu. Archive and
  Unarchive (`Przywróć`, icon `undo`) are exclusive by `session.archivedAt`. Rename stays allowed
  on an archived Session (metadata, not conversation).
- **Unsettled Turn:** while `snapshot.activeTurn` exists (any nonterminal state, including
  `unknown`), Archive and Delete open with the confirm `aria-disabled` and one attention note in
  the dialog description: `Trwa tura. Zatrzymaj ją lub poczekaj na jej zakończenie.`
  (`active`/`waiting`/`cancelling`), `Tura czeka na Twoją odpowiedź. Odpowiedz lub zatrzymaj
turę.` (`waitingForUser`), `Najpierw ustal wynik ostatniej tury.` (`unknown`, §17.1). A 409
  `TURN_CONFLICT` that wins a race shows the matching note. Cancel/Escape stay available.
- **Pending and errors (every dialog):** confirm reads `Zapisywanie…`/`Archiwizowanie…`/`Usuwanie…`,
  `aria-disabled` with a guarded handler; the dialog is locked (Cancel, Escape and the rename input,
  which stays focusable as read-only) and closes only on success. Unconfirmed request (network/503):
  `Alert tone="attention" role="alert"` `Nie potwierdzono operacji. Spróbuj ponownie.`, the dialog
  stays locked and confirm becomes the retry (Rename/Archive reuse the `requestId`; Delete repeats
  the body-less `DELETE`). Definite refusals unlock Cancel: 403 `Nie masz już uprawnień do tej
operacji.`, `TURN_CONFLICT` as above, `SESSION_DELETE_BLOCKED` (unsettled Engine evidence,
  not visible beforehand) `Sesja ma nierozliczone operacje w repozytorium. Spróbuj ponownie
później.` with confirm still enabled. Rename has no optimistic title; validation is nonblank,
  at most 256 characters. Focus after success returns to the `⋯` trigger, except Delete.
- **Archive dialog:** `Zarchiwizować tę sesję?` — `Sesja zostanie przeniesiona do archiwum sesji.
Nie będzie można w niej wysyłać wiadomości; historia, praca i zużycie pozostaną dostępne. Możesz
ją w każdej chwili przywrócić.` (`managedSession.sessionActions.archiveDescription`; the
  Specification Sessions list has an **Archiwum** collection). After archive the user stays on the
  Session.
- **Archived Session:** the Composer is replaced in its overlay slot by a quiet bar of the same
  width, `InlineNote` info `Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.` plus,
  with Manage, `Button variant="secondary" size="sm"` `Przywróć` (no confirmation: reversible).
  Pending `Przywracanie…`; failure is one line in the bar (unconfirmed only for a lost answer,
  forbidden and other refusals with their own copy). On success the Composer returns with its draft
  and focus moves to the editor. Conversation, Work, Context and telemetry stay readable.
- **View-only Session (owner accepted 2026-11-08):** when the caller lacks
  `capabilities.manage`, the Session is not archived and no pending start is retained (the demo
  Runtime's read-only Sessions, a viewer), no Turn, answer or Stop can ever be theirs. The Composer
  is replaced in its overlay slot by the archived bar's quiet shape without an action: `InlineNote`
  info `Możesz tylko przeglądać tę sesję.` / _You can only view this session._
  (`managedSession.viewOnly.note`, `role="status"`). An empty conversation then reads
  `Brak wiadomości w tej sesji.` (`managedSession.viewOnly.empty`) with no "write a message" call
  to action. The trigger is the missing Manage, not `!capabilities.start`: Start is also false
  while a Turn runs (the Composer carries Stop) or the provider is unavailable. A retained pending
  start keeps the Composer, whose Retry owns that request. Archived takes precedence; conversation,
  Work, Context and telemetry stay readable. Both bars carry the Composer's border
  (`border-border-default`) so they read as one surface on the split layout.
- **Archived elsewhere:** 409 `SESSION_ARCHIVED` on send, interaction respond or a retained pending
  start is a definite refusal: the retained command and its `requestId` are dropped, no
  `commandFailed` retry copy, the draft is kept, and the overlay slot says `Sesja została
zarchiwizowana.` until the SSE `session` change brings the archived bar.
- **Header subtitle precedence** (one fact, first match wins): connection not up (`Utracono
połączenie`, `Ponowne łączenie…`) → `Zarchiwizowana` → `Wynik tury nieznany` → current activity /
  readiness. Archived is a lasting state like readiness, so it is the subtitle, not the transient
  header `status` slot.
- **Delete:** `AlertDialog`, destructive `Usuń`, title `Usunąć tę sesję?`, the Session title on its
  own line and `Tej operacji nie można cofnąć. Historia rozmowy, praca i zużycie tej sesji zostaną
trwale usunięte ze SpecFlow. Odwołania do tej sesji w specyfikacjach i zadaniach przestaną
działać. Pliki w repozytorium i lokalna historia dostawcy nie są usuwane.` No type-to-confirm.
  Success is 204, or 404 `SESSION_NOT_FOUND` for a `DELETE` this view sent, or the stream's 404
  while this view's delete is in flight, unconfirmed or done; it completes once: navigate with
  `replace` (Back does not reopen it), polite toast `Sesja została usunięta.`, focus on the
  destination's page heading. The destination follows the association read already on the screen:
  an `available` Specification goes to `/specs/:specId/sessions` (with `collection=archive` when the
  Specification is archived); `standalone`, `forbidden`, `missing`, `unavailable` or not yet read
  goes to `/` (Specifications list). Accepted limit: a Session of a removed Specification is in no
  list; it stays reachable by URL and from Engine audit links.
- **Deleted elsewhere or unknown id:** a closed stream and then 404 `SESSION_NOT_FOUND` replace the
  Session screen with the Session not-found view: title `Ta sesja została usunięta lub nie
istnieje`, description `Historia tej sesji nie jest już dostępna.`, one secondary
  `managedSession.notFound.action` `Przejdź do specyfikacji` / _Go to specifications_ → `/`. It is the not-found composition (header, description, one button) rendered
  inside the application shell in the Session screen's `AppWorkspace`, not a standalone shell,
  which would add a second `main` landmark. A Composer draft there is lost.

## 23. What this pass deliberately does not decide

Still deferred:

- exact Conversation rendering primitives;
- exact local inspector stack API;
- exact resize implementation, width limits, and persisted manual-size policy (the V2 narrow/50:50 behavior is accepted);
- exact Session URL;
- exact canonical Handover/artifact references in the new Runtime;
- exact composer behavior for every provider capability combination;
- exact reasoning presentation policy;
- exact future file-preview / IDE integration implementation;
- provider-error/limit transfer to another agent;
- richer cost/usage/limit presentation beyond Session details and the provider-limits refresh
  (§7.7), such as history, budgets or charts.

## 24. Screen-structure acceptance checks

Before global component/composition gap analysis, verify:

1. Full Session Primary answers what was asked, what the agent is saying, what is happening now, and
   whether the Session needs the human.
2. Context opens by default on split-capable entry and can be closed/reopened explicitly.
3. Secondary changes only because of explicit user inspection/navigation; live Work does not steal
   the inspector.
4. Narrow entry stays on Conversation and has no Floating Session substitute.
5. Current execution scope is distinct from historical/contextual Task association.
6. Batch execution remains visibly batch-shaped.
7. Pending interaction is visible/respondable from Primary; a complex interaction may explicitly
   open detail but does not auto-navigate the user.
8. Current activity is visible from Primary.
9. Commentary is preserved as prose when supplied and never fabricated.
10. Compact Work summaries preserve chronology; clicking them can open deeper Work inspection.
11. Raw tool details stay below the normal conversation level.
12. Context separates current execution Tasks from merely related Tasks.
13. Context is pinned as a root Secondary tab; independent work areas/files may open tabs and dependent events use tab-local stacks; no third pane.
14. File preview and Open in IDE remain absent until their capability exists.
15. Floating Session is Wide-only and never required before Full Session.
16. Settled Turn, Task/workflow completion, resumable continuation, and recovery-required remain
    distinct concepts.
17. Waiting without human input remains calm live state and is not styled as attention.
18. Unknown/unavailable Session state preserves history while action availability follows
    authoritative readiness.
19. Unsupported Session capabilities do not produce fake controls.
20. Narrow uses header/Back rather than bottom tabs; browser/system Back can pop local pushed detail before leaving the routed surface,
    without encoding Secondary in the URL.
21. An unknown Turn outcome has one owner in Primary (§17.1); Session actions omit what the user
    cannot do and never close a dialog before the Runtime answers (§22.1).

The resulting design-system/component mapping is captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).
