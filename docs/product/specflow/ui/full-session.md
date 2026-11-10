---
id: product.specflow.ui.full-session
type: product
title: Full Session
status: current
scope: specflow
areas: [ui, ai]
tags:
  [session, conversation, composer, work, work-block, timeline, tool-action, context, new-session]
read_when:
  - changing the Full Session screen, its conversation, Work block, Composer or Context
  - changing Work history (L2) or ToolAction detail (L4) presentation
  - changing how a new Session is started, named or handed over to the Session screen
  - changing Session actions, archived or view-only Sessions, or an unknown Turn outcome
summary: >
  The implemented Full Session contract: chat rules, one Work block per Turn, Commentary-grouped
  Work history on the DS Timeline, ToolAction header and code blocks, Runtime-owned work modes in
  the Composer, refused vs unknown-outcome commands, starting a Session inside the Session shell,
  per-object Secondary tabs, Context section order and availability notes, Session actions,
  archived/view-only/deleted Sessions and the unknown-Turn-outcome notice.
related:
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
  - product.specflow.ui.shell-geometry
  - design-system.implementation.react.workspace-dynamic-split
  - design-system.implementation.react.secondary-navigation
  - reference.api.sessions
  - reference.api.session-telemetry
  - architecture.ai.canonical-session-turn-work
---

# Full Session

Full Session is the routed Session screen at `/sessions/:sessionId`: the conversation as Primary
and one Secondary holding Context and the user's opened inspections. The general Session principles
(canonical semantics, Work information levels, Commentary vs reasoning, status ownership) are in
[AI session UX](ai-session-ux.md); this document owns the concrete screen rules. Split sizing, the
tab rail and local Back are shared mechanics owned by the design system:
[Workspace dynamic split](../../../design-system/implementation/react/workspace-dynamic-split.md)
and [Secondary navigation](../../../design-system/implementation/react/secondary-navigation.md).
Open directions (workflow-event annotations, Quote, attachments, per-tool formatting, file
inspection) remain in the [ideas backlog](../../../ideas/specflow-ui/README.md) and are not part of
this contract.

## Conversation

The conversation is a chat, not a debugging console.

- User messages are restrained right-aligned bubbles. Agent answers are normal Markdown in a
  centred, max-width reading column, not full-width cards.
- No entry carries a visible speaker prefix ("You", "Claude", "Nevo"); the entry kind is announced
  to assistive technology only.
- **Copy** belongs to its authored message: revealed on hover/focus with a fine pointer, always
  visible on touch. Copy writes only the **complete** message: while the rest of a long message is
  still loading or failed to load, Copy reports **Could not copy**; it never copies the loaded part
  as if it were the whole.
- Raw tool operations, tool titles, artifacts and system logs never become chat rows. A long
  assistant report stays one Markdown answer.
- Commentary in the chat is plain muted prose, rendered the same way as in Work history.

## Work block

Each Turn with tool Work has exactly **one Work block** in the conversation. The Runtime emits one
`work-summary` entry per opened tool Work; the UI folds all of a Turn's entries into the block. A
settled Turn's block sits where its last tool Work was (Commentary before it stays before it); the
active Turn's block sits at the end of the Turn, before a streaming answer.

```text
[icon]  4 reads · 50 writes · 3 commands · 2 searches and more              >
        Failed: 1 test run                       (danger, own line)
        ⟳ Running: Bash: pnpm test -- admission  (live line, active Turn only)
```

- **Counts line — done so far.** Tool actions by operation kind, at most four kinds then "and
  more", workspace changes first (edits, writes, commands, test runs, reads, searches, directory
  listings, web, other). The breakdown and the failed line come from the Runtime's Work digest
  ([Sessions API, Work digest](../../../reference/api/sessions.md#work-digest)); the UI never
  classifies tools from titles or output. A Turn whose entries carry no digest shows the honest
  count of loaded tool Work ("12 tool actions", "at least N…" while older history may continue it).
- **Live line** (spinner) only while the Turn is the authoritative active Turn, from Runtime
  `currentActivity` (a tool's own label, Thinking…, responding, Commentary, waiting, cancelling),
  else from `activeTurn.state` when `currentActivity` is cleared between Work items. It is never
  inferred from the last entry. `attention`/`waitingForUser` produce no live line (the pending
  interaction owns that), and `unknown` produces no live line and no spinner (the
  [unknown-outcome notice](#unknown-turn-outcome) owns it). While the block shows the live line, the
  header subtitle keeps only the coarse Session state and has no spinner of its own.
- **The block owns the Turn's terminal state.** A failed, stopped or interrupted Turn shows its
  outcome inside the block and no separate outcome row is rendered; a completed Turn adds nothing.
  A Turn without tool Work keeps its own outcome row with its entry into Work.
- **One target.** The whole block opens that Turn's Work history (chevron and hover surface, no
  visible "Work history" label). Borderless at rest; the leading icon sits in a small tile: alert
  with a tone once the settled Turn failed or did not complete, a spinner while live, otherwise a
  neutral tool icon. Colour is used only for exceptions.

## Work history (L2)

Work history is a Secondary root tab, **one tab per Turn** ("Work history · turn N"). A Work block
and Context's Work row for the same Turn open the same tab; another Turn opens or activates its own.
Live updates never open, switch or reset Work history.

- **Chronology** runs oldest to newest, newest at the bottom; older pages load at the top.
- **Commentary structures the operations.** Each Commentary starts a chapter; the operations that
  follow are its chronological rows until the next Commentary. Operations render on the DS
  `Timeline`, **one Timeline per run between narration**: the rail resets at every Commentary or
  Thinking boundary and never spans across one.
- **Narration is off the rail.** Commentary and Thinking are never `Timeline.Item`s and never sit
  behind a disclosure. They use one plain prose block; the only difference is the voice (Thinking is
  italic, Commentary upright) plus the kind's name for assistive technology. Long narration gets a
  **Show more / Show less** button. No divider lines between chapters; spacing above and below
  narration is equal.
- **Start of Turn.** Operations before any Commentary are labelled **Start of Turn** only once the
  Turn's oldest page is loaded; before that they are unlabelled, since their Commentary may be on an
  older page.
- **Tool bursts.** A long run of adjacent happy-path completed tools collapses into one Timeline
  item, collapsed by default (leading disclosure chevron; member rows keep trailing navigation
  chevrons). Failed, cancelled, interrupted, unknown, active and queued tools always keep their own
  rows. Whether a burst is open is state of the Turn's view: it survives the burst growing, a
  drill-in and back, and a tab switch.
- **Counts** above the list appear only when the Runtime's Work aggregate is present; they are
  never computed from a loaded page.
- **Type filters and search** keep the parent Commentary context. With no match among loaded
  entries while older history remains, the empty state says so for the loaded entries only.
- **Reading position.** The entry the reader is reading keeps its place on screen across an older
  page landing above, a tail refresh, a filter, a disclosure, a resize and late-arriving content.
- **Bounded auto-loading.** Older pages load automatically near the top only while productive: a
  page that grows the content by less than 32 px is unproductive, and after 3 consecutive
  unproductive pages loading stops behind an explicit **Load older history** (or **Search older
  history** while filtering) button. The same rule and control serve the ToolAction list.

Selecting a row with ToolActions pushes its Actions onto the Work tab's local stack; the tab keeps
its root name at every depth.

## ToolAction detail (L4)

Today's ToolAction carries title, state, input, output, error and timestamps, but no tool kind or
subject. The UI therefore does not guess them: no parsing of titles or output into a tool type or
target.

```text
Read file admission.mjs               full title
(✓) 200 ms                            status line
PARAMETERS                    Copy    numbered, pretty-printed JSON
TOOL RESPONSE                 Copy    verbatim output, no gutter
```

- **Status.** Completed: a discreet success check, the word announced to assistive technology only,
  no badge. Failed, cancelled or interrupted: the matching icon plus the visible state word (never
  colour alone), and the readable error as an alert below the header. Unsettled states show their
  real state (In progress, spinner), never a duration or a success mark. Inside a Timeline of several
  actions the marker carries the state and the status line has no icon.
- **Time.** The duration is the visible time. The wall-clock range is its tooltip and becomes
  visible in the line only from 60 s.
- **Line numbers** only for text the product formatted itself (pretty-printed JSON parameters).
  Any other body is verbatim without a gutter, so a tool's own numbering is never numbered again.
  No language detection beyond "is this valid JSON".
- **Overflow.** Lines never wrap; each block is height-capped and scrolls in both directions, so
  long content never widens Secondary. Copy copies the original text.

## Composer

- **Provider is fixed** for the Session; the Composer offers no provider switch.
- The toolbar holds the attachment entry, one **work-mode** picker, one **Model · effort** picker
  and Send/Stop, inside the Composer frame; no extra settings row below it.
- **The Runtime owns work modes.** The picker lists exactly the provider catalogue's modes, in
  catalogue order, under the catalogue's titles. Mode ids are opaque; the UI has no Ask/Plan/Agent
  wording or per-mode copy, and no separate approval selector (a provider's native permission
  variants are its work modes). The default is the catalogue's `defaultModeId`, else the first
  usable mode.
- **Unusable modes are omitted**, not shown disabled (not ready, not authorized, outside the
  provider's offered safety modes, or not runnable by the selected model). The one exception: the
  Session's **current** mode stays listed, disabled with the catalogue's reason, when it became
  unusable, so the picker never claims a mode the next Turn would not inherit. The trigger is text on
  every layout.
- Model and effort are one picker; effort appears only when the provider allows the override. A
  provider without models or without the model override renders no picker.
- **Refused vs unknown outcome.** A definitely refused command (a 4xx that is not
  `SESSION_RECOVERY_REQUIRED`) is released: draft and overrides stay for the user to adjust and
  resend. A command whose outcome is unknown stays retained for an exact replay with the same
  request id.
- **Saved request can't be read.** A retained command (or Session start) that is present but
  unreadable is never dropped silently: the Composer and the start form show **Saved request can't
  be read** with **Discard saved request** and a warning that it may already have been applied.
  Storage that is only temporarily unavailable keeps blocking.
- Attachments chosen in the Composer stay in the Composer; nothing transports them yet, so Send
  never clears or silently drops them.

## Starting a Session

Every UI start is from a Specification: **New session** opens `/specs/:specId/sessions/new`.
`/sessions/new` has no UI entry and redirects with `replace` to `/`.

- **Start inside the Session shell.** The full Session screen renders at once: header **New
  session**, Context with the Specification pinned, the start form, and the Composer. Regions that
  need a started Session are inactive until Start.
- **Start form in the conversation column** on the conversation background, at the messages'
  content width, starting at the top; no `Card`, border or fill. Title **Start a session**; the
  action row (note, **Start session**) is the form's last row.
- **Fields.** Provider tiles (first available preselected; an unavailable provider is disabled with
  its reason, and a provider with no executable work mode is unavailable), then labelled **Model**
  (required, no preselection), **Effort** (Default plus the model's efforts) and **Work mode** (the
  catalogue's usable modes: a segmented control for up to 4, a picker beyond), then **Session
  name**. Effort and Work mode are rendered disabled until a model is chosen, so choosing one never
  adds rows. Changing the provider resets everything below it. The same labelled fields serve
  Create with an agent, which exists only in demo mode
  ([Create Specification, Demo mode](../specification-creation.md#demo-mode)); the Composer keeps
  its compact pickers.
- **Composer before Start.** Split layout: inactive in its final place, placeholder **Choose the
  agent and start the session**, no pickers, Send disabled. Single-surface (narrow) layout: not shown
  until Start.
- **Blocked.** Start is disabled and the note names the first reason in reading order:
  configuration to refresh → **No executor is available right now** → choose an available executor
  → **Choose a model** → choose a supported mode → **Enter a name or let the agent name it**.
- **Start.** Start locks the form and reads **Starting…**. On success the URL is **replaced** with
  `/sessions/:sessionId` (Back does not return to the empty start state) with no visible change of
  the shell: the start values stand in until the first snapshot loads, the form becomes the ready
  empty state, the Composer activates with the chosen model and mode, and focus moves to the message
  field.
- **Failure and unknown outcome.** A failure is an alert in the form above its action row; the
  choices stay and the form unlocks. An unknown outcome is checked with **Check result**, never
  blindly repeated.
- **Leaving before Start** needs no confirmation: nothing was saved.
- **Gating.** Entry points follow the workspace `actions.startSession`: shown when available or with
  reason `no_provider`; omitted with `forbidden` or `sessions_disabled` and for a removed
  Specification. Opened directly with `forbidden` or `sessions_disabled`, the form is replaced by
  the matching note with **Back to specification**.

**Ready empty state.** Every Session without messages (new or reopened) shows the DS `EmptyState`
`pane` with the provider's colour logo, **{Provider} is ready** and **Write a message below to start
the conversation.** It names the provider only; model and mode are visible in the Composer.

**Naming.** The **Give it your own name** switch is off by default; on, it reveals the name field
(at most 256 characters, a counter in the last 32). Switching off keeps the typed text. A Session
without an own name keeps the title **New session** until the person renames it.

Agent naming is not implemented: the Runtime reports no naming signal, so the header **Naming…**
status is never shown, and the switch's hint ("The agent names the session from your first
message.") describes the planned behaviour
([open idea](../../../ideas/specflow-ui/full-session-screen-structure.md#6-still-deferred)).

## Secondary tabs

On split-capable layouts **Context** is the pinned home tab and the editor-tab rail is visible from
the start. The user opens other root tabs from Context or Session references; live events never open,
switch or push anything.

- **A root tab's identity is the object it shows.** Each Task opened from Context (a **Related
  Tasks** row) is its own tab (label: the Task key); an open Task is activated, never duplicated and
  never retargeted to another Task. Each Turn's Work history is its own tab (see
  [Work history](#work-history-l2)); each Planned-areas row opens its own placeholder tab.
- **Task tab today is a limited stand-in.** The association read carries only a Task's id, key and
  title, so the Task tab shows the key, the title and a note that the Task's evidence and actions are
  on its own Task page. It is not the Task detail of the Specification: it shows no attempts, review
  events, rejections or feedback and offers no actions, and nothing pushes onto its stack.
- **Dependent detail stays on its root's stack.** ToolActions push onto their Turn's Work tab. Back
  returns to the direct parent inside the active tab.
- Switching tabs preserves each tab's stack and scroll; inactive tab screens are not kept mounted, so
  selections, filters and drafts are product state, and leaving a tab with unsaved work runs that
  tab's leave guard.
- **Narrow** shows one surface at a time and has **no bottom tab strip**. Conversation opens first;
  Context opens from the header and returns with Back; a Task, Work history or Planned-areas row
  opened from it is pushed onto the same flow. Back follows the actual path: an object opened again
  is pushed again. The Composer draft and conversation scroll survive.
- Closing Secondary is the user's choice; new activity never reopens it. Secondary state is local,
  not URL state, and there is no third pane.

A full Task detail with attempt, review and feedback drill-down in the Task tab, and a Tasks list
tab, are open items in the
[Full Session screen structure](../../../ideas/specflow-ui/full-session-screen-structure.md#2-task-tabs-in-the-session).

Sizing (narrow Context-only Secondary, 50/50 on a second root tab, manual splitter, side swap) and
the tab rail are the design-system contract linked above.

## Context

Sections render in a fixed order; a section changing state replaces its own slot and never moves its
neighbours:

1. **Executor** — provider, model and effort (always first); a panel note follows when the Session's
   links cannot be read.
2. **Specification** — the Specification row and a **Documents** row (Documents shows the Session
   as its way back).
3. **Current execution** — only from an authoritative execution scope.
4. **Attention / next actions** — only from an authoritative projection.
5. **Related Tasks** — the associated Tasks, one row each (title and key), each opening its Task tab.
6. **Work** — Work history of the current or last Turn.
7. **Planned areas** — preview rows (Files / Changes, Handovers, Artifacts, Instructions,
   Environment) that open a placeholder tab.
8. **Session details** — token usage, cost, context window and provider limits, always last.

**Execution scope wording.** An association is context, never execution: rows say **associated**
and no surface writes "working on" or shows a Task as current execution from the association. When
an authoritative scope exists, it is shown as generic, a single Task (`Implementer · TASK-03`) or a
batch (`Reviewer · 3 Tasks`); a batch is never represented by one chosen Task. No Runtime projection
supplies an execution scope or attention today, so Current execution and Attention are not shown.

**Availability.** The Session's scope comes only from the association read
([Sessions API](../../../reference/api/sessions.md#association-read)), seeded from the create
response for a Session started from a Specification. While that read is in flight, or for a
standalone Session, the Specification and Related Tasks sections are not shown; a failed read is one
attention note under Executor. Executor and Work show skeleton rows at their final height while the
first snapshot loads. Once the association is read, an absent Specification or an empty Task list is
omitted. A Specification that cannot be found is a danger note naming its key; one the user may not
view is an info note without a Documents row; one that cannot be read is an attention note. Related
Tasks show only beside an available Specification: Tasks that cannot be read are one attention note,
and Tasks that no longer exist show the found Tasks plus a count note. Notes are DS `InlineNote`s in the section's own
slot, passive (no live region), with no retry. Context always keeps the facts it knows; there is no
whole-panel "not available" state. Copy keys live in `sessions.context.availability.*`.

**Session details.** The [telemetry](../../../reference/api/session-telemetry.md) snapshot; a reading
that is absent, unavailable or masked is not shown as zero or "unknown". Only provider limits can be
refreshed: one ghost **Refresh** in the "Provider limits" heading (accessible name **Refresh provider
limits**), offered only when the limits are refreshable and the user may manage the Session
(omitted otherwise, never disabled; kept on an archived Session). While pending the button reads
**Refreshing…**, is `aria-disabled` and is the only indicator; new values replace in place without a
toast. A rate limit disables it until the time passes; an unsupported capability removes it for the
mount; an unconfirmed request is the only `role="alert"` and the next press reuses the request id.
Limits unavailable with `NOT_AUTHORIZED` render no limits section at all.

## Unknown Turn outcome

While the active Turn's state is `unknown`, one attention alert above the Composer (below a pending
interaction) is the single owner of the fact. The Work block shows no live line, the header
subtitle reads **Turn outcome unknown**, the Composer stays gated by `capabilities.start`, Stop is not
offered and Context does not repeat it. With Manage the alert offers **Check outcome** (reconcile);
without it, a line says who can check. Pending reads **Checking…**. "No evidence yet" keeps the alert
with a status line; an unconfirmed check reuses the request id. When the stream moves the Turn out of
`unknown` the alert unmounts, and a polite toast confirms only when this view's reconcile resolved
it. The check never resends or replays the prompt.

## Session actions

- **Menu.** Rename, Archive/Restore and Delete live in the header `⋯` menu (`direct: 'never'`),
  Delete last with the danger tone. Rename and Archive/Restore need `capabilities.manage`, Delete
  needs `capabilities.delete`; an unavailable action is omitted, never disabled, and no items means no
  menu. Rename stays allowed on an archived Session.
- **Unsettled Turn.** While a Turn has not ended, Archive and Delete open with the confirm
  `aria-disabled` and one note naming what to do (stop or wait, answer, or establish the outcome);
  a racing 409 `TURN_CONFLICT` shows the same note.
- **Dialogs** never close before the Runtime answers: the confirm shows its pending label, the dialog
  locks, and only success closes it. An unconfirmed request keeps the dialog locked with the confirm
  as retry; definite refusals unlock Cancel with their own copy. No optimistic rename.
- **Archived.** The Composer's slot shows a quiet bar of the same width: "This session is archived. No
  messages can be sent in it." plus **Restore** with Manage (no confirmation). Conversation, Work,
  Context and telemetry stay readable. Archived elsewhere (409 `SESSION_ARCHIVED`) drops the retained
  command, keeps the draft and says so until the archived bar arrives.
- **View-only.** Without `capabilities.manage` (and not archived, with no retained start), the
  Composer's slot shows "You can only view this session."; an empty conversation reads "This session
  has no messages." with no call to action.
- **Header subtitle precedence** (first match wins): connection lost/reconnecting → Archived → Turn
  outcome unknown → current activity / readiness.
- **Delete** is an `AlertDialog` naming what is and is not deleted; no type-to-confirm. Success
  navigates with `replace` to the Specification's Sessions list when the association is an available
  Specification, otherwise to `/`, with a polite toast.
- **Deleted elsewhere or unknown id** replaces the screen, inside the application shell, with "This
  session was deleted or does not exist" and **Go to specifications**.
