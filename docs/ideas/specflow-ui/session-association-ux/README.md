---
id: ideas.specflow-ui.session-association-ux
type: product
title: Session association UX — decision record (U1-U6)
status: draft
scope: specflow
areas: [ui, ai]
tags: [sessions, associations, session-list, navigation, context, workspace, archive, delete]
read_when:
  - asking why standalone Sessions left the UI, or why delete goes where it goes
  - asking why the Specification Sessions list pages explicitly with Current/Archive collections
  - asking why a Session row looks the way it does, or why Session status never takes Engine attempt facts
  - picking up an open follow-up of the Session association UX
summary: >
  Decision record (a proposal, not a current rule) of the Session association UX (owner decisions 2026-11-08,
  delivered in PR #126): standalone Sessions out of the UI, the post-delete destination, the
  Specification Sessions list and its row, Context from the association and Session-owned status.
  Keeps the decisions, the rejected alternatives that still hold and the open follow-ups; the
  behaviour is owned by the current product and reference documents it links.
related:
  - product.specflow.ui.specification-sessions
  - product.specflow.ui.full-session
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.specification-overview
  - reference.api.sessions
  - reference.api.specification-workspace
  - ideas.specflow-runtime.session-association
  - ideas.specflow-ui.session-actions-ux
---

# Session association UX — decision record

**A proposal, not a current rule.** This is a decision record of delivered work (PR #126). It explains why; it
does not define behaviour. On any difference the current documents win:

| Decision                                                            | Owning document                                                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1, U2: no standalone UI entry, `/sessions/new` redirect, navigator | [Interaction model](../../../product/specflow/ui/interaction-model.md#starting-a-session-and-the-navigator), [Full Session](../../../product/specflow/ui/full-session.md#starting-a-session) |
| U3: delete destination, not-found view                              | [Full Session, Session actions](../../../product/specflow/ui/full-session.md#session-actions)                                                                                                |
| U4: Sessions list rows, collections, paging, states                 | [Specification Sessions list](../../../product/specflow/ui/specification-sessions.md)                                                                                                        |
| Continue session, preparation block                                 | [Specification Overview](../../../product/specflow/ui/specification-overview.md#sections-and-order)                                                                                          |
| U5: Context Specification and Related Tasks                         | [Full Session, Context](../../../product/specflow/ui/full-session.md#context)                                                                                                                |
| U6: `actions.startSession` reasons, start-route refusal states      | [Specification Workspace API](../../../reference/api/specification-workspace.md#project-sessions-section), [Full Session](../../../product/specflow/ui/full-session.md#starting-a-session)   |
| Session status ownership                                            | [AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-status-ownership-accepted-2026-11-08)                                                                                  |

## Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Standalone Sessions are removed from the UI for now; every new Session starts from a Specification. The API (`POST`/`GET /api/sessions`) stays |
| U2  | Existing standalone Sessions stay reachable by direct link only (accepted limit)                                                               |
| U3  | The delete destination follows the association; everything that is not an available Specification goes to `/`                                  |
| U4  | The Specification Sessions list reads the paged Session list read, with Current/Archive collections                                            |
| U5  | Associated Tasks fill **Related Tasks**; an associated Session never has scope `task`                                                          |
| U6  | `actions.startSession` reason precedence and the start-route refusal states                                                                    |

The Sessions list row amendment (provider mark, model, effective status, inline facts) was accepted
the same day, together with the two Runtime extensions it needed (display titles and effective
readiness on list and workspace rows).

Dropped proposals: a global navigator entry and a `/sessions` list of Sessions without a
Specification; a project-level Session capability projection (every remaining entry is gated by the
Specification's `actions.startSession`).

## Rationale and rejected alternatives

- **Standalone Sessions out of the UI (U1):** every remaining Session surface is owned by a
  Specification; a global Sessions entry or a `/sessions` list of unassociated Sessions would add a
  navigation item and a second home for the same Session. The API keeps standalone create and list,
  so the decision is reversible without a migration.
- **Delete destination (U3):** the association read already on the screen names the only honest
  list to return to; with no available Specification, `/` is the only list that certainly exists.
  This supersedes the earlier `/sessions/new` destination, chosen while the Session's Specification
  was unknown. Archive stays on the Session: it is reversible and the archived bar offers
  **Restore**.
- **Sessions list on the list read (U4):** rejected rendering the workspace section's rows and
  switching to the list read beyond `hasMore` (two sources for one list, no archive); a "show
  archived" switch mixing both (breaks the Current/Archive model of the Specifications list);
  infinite scroll (end of list unreachable for keyboard users). Explicit paging up to 4 requests per
  press bounds the work when per-row authorization leaves pages short or empty.
- **Session row:** rejected collection-owned fact columns (models are not compared down the list,
  rows without Tasks keep an empty track, and it needs collection-level geometry in
  `OperationalRow`); a mark aligned to the title's first line (the owner chose centring on the whole
  row); a UI-side join with `GET /api/session-providers` for titles (viewers get 403 and would see
  raw ids); dropping `authenticationRequired` from rows instead of effective readiness (rows would
  stay quiet while the Session screen shows the sign-in problem); separate wording for
  `waitingForUser` and `cancelling` (it would split the vocabulary the navigator preview and
  Continue session share; `cancelling` is transient). A sign-in is muted because it repeats on every
  Session of that provider; attention tone would flood the list.
- **Context from the association (U5):** an association is context, never current execution, so
  associated Tasks are Related Tasks and scope `task` is never produced from it. No skeleton while
  the association loads, because a standalone Session would show a skeleton that then vanishes. A
  dedicated count note for removed Tasks, because "Couldn't load related Tasks" misstates a removed
  Task.
- **Session-owned status:** rejected promoting a Session to attention when an Engine item names it as
  executor: the registry stores neither execution nor attention, the need would show twice, and
  executor identity can be stale.

## Open follow-ups

- A Session of a removed Specification (`missing`) is in no list; it stays reachable by URL and from
  Engine audit links (accepted limit).
- The navigator count is interim; the "same Session in navigator, Requires attention and Continue
  session" redundancy is a separate information-model scope.
- No Task-context start and no `taskId`-filtered list until a UX contract places one; the Task
  screen's Sessions section keeps showing Engine attempt executions.
