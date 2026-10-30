---
id: ideas.specflow-ui.components.session-chat-v10-design
type: product
title: Session Chat V10 — accepted UX direction and Workspace split behavior
status: draft
scope: specflow
areas: [ui, ai, runtime]
tags: [session, conversation, composer, commentary, work, timeline, secondary, responsive]
read_when:
  - designing or implementing Full Session Conversation, Composer and Work
  - composing from the Nevo UI Design System
  - specifying split sizing or source-aware Back navigation
summary: >
  Owner-accepted V10 UX behavior (not implementation) layered on accepted Workspace V2.
  Mockup iconography and provider fixtures are not production contracts.
related:
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.components.session-composer-design
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.design-system-component-composition-gaps
  - reference.api.sessions
  - architecture.ai.canonical-session-turn-work
---

# Session Chat V10 — approved interaction direction

## 1. Approval and implementation boundary

Owner accepted the V10 conversation, Composer and Work-inspection direction on 2026-10-30,
on top of the previously accepted Session Workspace V2. References:

- [Desktop interactive mock](../examples/session-chat-v10/desktop.html)
- [Mobile interactive mock](../examples/session-chat-v10/mobile.html)
- [Prototype and outstanding exception](../examples/session-chat-v10/README.md)
- [Workspace navigation contract](../full-session-screen-structure.md#10-secondary-navigation-model--owner-approved-workspace-v2)

**Approved: interaction and information hierarchy, not pixel-perfect HTML.** All fixtures,
provider options, 144 Work items, toolbar glyphs, CSS/JS, Context counts and fake operations
are illustrative. In particular the owner **did not approve** mobile Composer icons: the
diamond/square symbols for mode/approval are not meaningful and controls wrap/overlap on a
narrow display. Replace them using recognizable Design System iconography and components.
Verify on 390px and the smallest supported narrow screen, including keyboard and focus.
Do not copy ad-hoc CSS/SVG/Markdown parsers from HTML examples into production.

## 2. Conversation is chat, not a debugging console

- User messages are restrained right-aligned bubbles. Agent answers are normal Markdown in
  a centered, max-width reading column, not full-width cards aligned to the left edge.
- Do not prefix each entry with repeated 'Ty', 'Claude', or 'Nevo'. Nevo is the brand,
  SpecFlow is the product; workflow metadata has no brand-as-speaker prefix.
- Copy and Quote belong to their specific authored message. Desktop hover/focus and
  mobile visible hit targets must follow accessibility and DS conventions.
- Keep raw tool operations, verbose commentary history, artifacts and system logs out of
  ordinary chat. A long assistant report remains one Markdown answer.
- Annotate a Turn only when reliable **product-owned** workflow events exist, such as
  a Task attempt starting, step finishing or review completion. Link to the exact event;
  do not infer Task lifecycle from an agent saying 'done'. Multi-Task reviews remain batches.
  Avoid duplicate icons and multiple competing status bars.

## 3. Live Turn versus historical Work

During execution, show one truthful, quiet current activity from Runtime. If the provider
exposes Commentary, it can supply the current update. If a permitted user-visible reasoning
summary is exposed, distinguish that as Thinking/Analysis; never expose internal/private
chain-of-thought. No content means neutral 'Working' or 'Waiting', not guessed intent.

Optionally show a compact clickable Work summary by type (e.g. reads/writes/commands/other).
Counts should come from bounded server projections, **not** client scanning hundreds of Work
records. An active structured interaction or approval appears in the conversation as an
actual user decision, not silently handled by the general Composer.

When the Turn ends, remove transient working indicators. Keep the final answer and
message actions, along with a way to open full Work history and any verified workflow
annotation. Do not confuse a settled Turn with completed workflow.

## 4. Large Work history: commentary structures operations

A Work timeline is not a flat list of identical tool, commentary and reasoning rows.

- **Commentary** is a readable Markdown heading/description for a phase of work.
  Subsequent operations are subordinate, chronological rows until the next Commentary.
  A neutral 'Start of Turn' group covers operations preceding any commentary.
- **Thinking** is a separately labeled, optionally collapsible reasoning _summary_
  in the relevant chronological section, never a command or fake commentary.
  Only explicitly renderable provider summaries may be shown.
- Read/Write/Edit/Search/Bash/other tool actions are compact descendants of their phase.
  Selecting a row opens that exact Work detail; ToolAction remains its child.
- Type filters and text search preserve parent Commentary context. Groups can collapse
  and long results page progressively. Do not fetch, parse and mount all 144+ entries
  before initial rendering. The 144-item example is synthetic scalability test data.
- Use the existing DS **Timeline, Collapsible, MarkdownDocument, ScrollArea, Typography,
  Menu, IconButton, Tooltip** and semantic status treatment; do not introduce a second
  independent timeline implementation without reviewing the shared component.
- Never deduce Task/attempt association from a filename or a command. Keep canonical
  identity and chronological ordering from the Runtime/Engine projections.

## 5. Direct inspection must preserve return origin

Clicking a workflow event (e.g. TASK-03 new attempt or a completed review) opens
**the specific event/attempt**, not the generic Tasks list. From there, the user may
explicitly open the related Task. Clicking a Work summary opens the current Turn's Work
root, with exact Work details on its local stack.

Use **source-aware local navigation**:

- From Conversation on mobile: tap event -> event detail -> Back -> Conversation.
- If event detail opened related Task: Task -> Back -> event -> Back -> Conversation.
- From a Tasks root tab: Task -> attempt/event -> Back returns along that tab's local stack.
- Work summary from Conversation: Work root -> Work detail -> Back -> Work root ->
  Back/Close -> Conversation.
- Desktop: existing Secondary root tabs retain independent local stacks, focus and scroll.
  Explicit inspection activates its destination; live updates never steal Secondary.
- Preserve Session draft and conversation scroll across mobile detail inspection.
  Do not create a third pane or a new URL for every Work/event.

## 6. Composer and unresolved mobile iconography

Composer stays within the conversation and contains attachment previews above message text,
only when attachments exist. Its toolbar is inside the same frame: plus/attachment, intent,
approval if relevant, model, effort if supported, Send/Stop. It is wider but capped on
desktop; mobile can use icons when distinguishable. Do not use an extra settings row
below Composer.

Provider (Claude Code/Codex/Cursor/Antigravity) is fixed per Session. The **next Turn**
may change model, effort, certified work intent (Ask/Plan/Agent) or operation approval
policy. Intent is not approval; provider Auto does not imply unrestricted permission;
an approval preset never authorizes a deterministic Engine gate or human review.
Provider catalogue and execution safety requirements remain authoritative.
Unsupported/uncertified combinations must not appear as usable.

The mobile V10 icons are **explicitly unapproved**. Resolve their meaning using DS
MessageComposer, IconButton, Menu, Tooltip and approved icon set, with accessible names,
selected-state feedback, adequate target size and consistent grouping. Suggested semantic
categories, not mandatory glyph assignments: attach, work mode, approvals/permissions,
model, effort, send/stop. Diamond and blank square placeholders are unacceptable.
The real visual design must account for 390px, smaller supported widths, increased text
size and the soft keyboard. No icons spilling below toolbar or overlapping Composer edge.

Attachments/camera and per-provider mode semantics in HTML remain mocked. See
[Composer capability gaps](session-composer-design.md) for missing upload and adapter contracts.

## 7. Dynamic Workspace split: shared Design System capability gap

The behavior below is accepted in Workspace V2 but is **not yet fully present in the
shared Design System AppWorkspace**. Do not implement a one-off Session-specific layout
engine. Extend the shared AppWorkspace/Secondary composition where needed.

### 7.1 State and available width

Inputs: actual width available to AppWorkspace after shell/navigation (not viewport
width); Secondary open/closed; count of independently open root tabs (pinned Context
counts as one); current left/right placement; auto/manual sizing mode; and last user-set
width or ratio. **Active tab content and dependent detail depth do not affect sizing.**

### 7.2 Auto/manual transition rules

| Trigger                                                    | Expected layout                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Enter split-capable Full Session, only pinned Context open | Narrow Secondary, about 330px where feasible                                                |
| User opens second independent root tab                     | Automatically switch to 50/50 once                                                          |
| User switches between already-open tabs                    | No resizing; preserve active tab stacks                                                     |
| User opens dependent Task / event / ToolAction detail      | No resizing                                                                                 |
| User closes other roots, only Context remains              | Auto mode returns to narrow Secondary                                                       |
| User drags separator                                       | Enter manual mode; explicit ratio now wins                                                  |
| In manual mode, open/switch/close any root tabs            | Preserve manual ratio, no automatic 50/50                                                   |
| User swaps Secondary side                                  | Preserve ratio, tabs, stacks, scroll and focus                                              |
| User explicitly closes Secondary                           | Conversation only; do not reopen on new activity                                            |
| User explicitly reopens Secondary                          | Restore appropriate existing auto/manual sizing state                                       |
| Split can no longer fit minimum pane sizes                 | Move to the existing Narrow single-surface model; do not discard the preferred manual ratio |
| Width becomes split-capable again                          | Restore the appropriate auto/manual ratio, clamped to valid constraints                     |

330px and 50/50 describe default behavior, **not absolute CSS constraints**. Minimum
widths must allow real Conversation and Composer usage, not be picked just to reproduce
the screenshot. If available width requires a temporary clamp, do not rewrite the user's
manual preference. When space returns, restore it (subject to valid minima). A swap
changes side, never width ownership or navigation.

The resizer must be a shared, accessible control: keyboard/pointer/touch support
appropriate to DS, visible focus, meaningful ARIA separator semantics, no accidental
vertical-scroll hijacking on mobile. Final breakpoint values, cross-reload persistence
and exact implementation API remain to be designed; **within an active Workspace**
manual width and independent tab stacks must persist.

On Narrow, only one surface is shown at a time; enter Conversation first and use header
navigation + Back for Context/direct details. No bottom tab strip. Closing Secondary is
an explicit user choice, never overridden by a new Turn, commentary or workflow event.

### 7.3 Resizing is separate from navigation

Neither resizing nor side swap may change the Session provider, current Turn, workflow
operation, URL, Composer draft, open Secondary tab identity or local detail stacks.
A root tab is independent; a dependent detail uses its root's local stack.
A directly opened chat event must retain Conversation as its return origin on mobile.

## 8. Verification checklist for implementation

1. Wide/390px/minimum supported width: chat is readable, no raw Work clutter, no
   repetitive 'Ty/Claude/Nevo' speaker labels, Copy/Quote belong to messages.
2. Mobile icon-only Composer controls have distinct meanings and labels with zero overlap
   or accidental second-row overflow; focus, keyboard and touch work.
3. Clicking a Task/workflow annotation opens exact event, not Tasks list; one Back from
   direct event returns to chat, deeper Task drill-in adds one deliberate step.
4. Turn with 100+ Work: paginated load, Commentary sections, nested tool actions,
   optional Thinking summaries, search/filter preserving context, exact Work detail.
5. Active Turn has one current activity and optional count summary, settled Turn has
   normal answer and actions; workflow state never inferred from answer text.
6. Auto split: Context-only narrow -> new independent tab 50/50 -> tab switch unchanged;
   manual resize takes precedence -> side swap unchanged -> narrow/expand preserves
   state. Secondary does not reopen itself on new events.
7. Components, icons, spacing, typography, focus, menus and responsive boundaries
   are sourced from Design System, not copied from the prototype.
8. Runtime/Engine/provider capabilities are verified separately before enabling
   synthetic prototype features as real UI.
