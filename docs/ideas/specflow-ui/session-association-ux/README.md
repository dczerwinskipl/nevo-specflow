---
id: ideas.specflow-ui.session-association-ux
type: product
title: Session association UX — Session lists, post-delete destination, Context and workspace status (D10)
status: current
scope: specflow
areas: [ui, ai]
tags: [sessions, associations, session-list, navigation, context, workspace, archive, delete]
read_when:
  - asking why standalone Sessions left the UI, or why delete goes where it goes
  - asking why the Specification Sessions list pages explicitly with current/archive collections
  - asking why Session status never takes Engine attempt facts
summary: >
  Decision record (owner decisions 2026-11-08, delivered in PR #126) for the D10 UX items of the
  stage 3 Session association design: standalone Sessions removed from the UI, the Specification
  Sessions list on the paged Session list read, post-delete destination from the association,
  Context Specification/Related Tasks from the association read, New Session gating and
  Session-owned status. Keeps decisions, rationale and rejected alternatives; the behaviour lives in
  the owning screen and structure documents.
related:
  - ideas.specflow-runtime.session-association
  - product.specflow.ui.full-session
  - ideas.specflow-ui.session-actions-ux
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.screens.specification-workspace
  - ideas.specflow-ui.screens.specification-sessions-list
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
  - product.specflow.ui.data-loading-and-integration
  - reference.api.sessions
---

# Session association UX (stage 3, D10)

**Status:** accepted by the owner on 2026-11-08 (section 1) and delivered with T10 of PR #126. The
behaviour lives in its owning contracts ([section 2](#2-owning-documents)); this file keeps the
decisions and rationale, like the [Session actions decision record](../session-actions-ux/README.md).

**Inputs:** [stage 3 design](../../specflow-runtime/session-association/README.md) §1, §7.4–7.5 and
§11; [Full Session](../../../product/specflow/ui/full-session.md) Context, Session actions and Work block (one owner per fact);
the navigation and route model (since promoted to the [interaction model](../../../product/specflow/ui/interaction-model.md#reachability));
[Full Session, Starting a Session](../../../product/specflow/ui/full-session.md#starting-a-session);
[AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-association-vs-current-execution);
the App Shell geometry decision record `product.specflow.ui.shell-geometry` (PR #124; open findings
"Session loses the Specification context", "same Session three times", "Sessions list shows developer
text / New conversation").

**Ground rules applied:** an association is context, never current execution (N2, I4), so copy says
"powiązana" and never "pracuje nad"; unavailable actions are omitted, not disabled
([decision record](../session-actions-ux/README.md#ground-rules-applied)); each fact has one owner; no
client cache of a "last opened Specification".

## 1. Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1  | **Standalone Sessions are removed from the UI for now.** Every new Session starts from a Specification. The API (`POST /api/sessions`, `GET /api/sessions`) stays. No standalone list, no navigator row; [interaction model](../../../product/specflow/ui/interaction-model.md#starting-a-session-and-the-navigator) states it |
| U2  | Existing standalone Sessions stay reachable by direct link only (accepted limit)                                                                                                                                                                                                                                               |
| U3  | Delete destination follows the association; everything that is not an available Specification goes to `/`. A Session of a removed Specification is in no list (accepted limit)                                                                                                                                                 |
| U4  | The Specification Sessions list reads the paged Session list read, with current/archive collections                                                                                                                                                                                                                            |
| U5  | Associated Tasks fill **Powiązane zadania**; an associated Session never has scope `task` (edits stage 3 §11 and T10)                                                                                                                                                                                                          |
| U6  | `actions.startSession` reason precedence and start-route refusal states                                                                                                                                                                                                                                                        |

Dropped proposals: a global navigator entry and a `/sessions` list of Sessions without a
Specification (and its Focused-mode assignment); the project-level Session capability projection
(nothing in the accepted scope needs it: every remaining entry is gated by the Specification's
`actions.startSession`).

## 2. Owning documents

| Decision                                                                                 | Owning document                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1, U2: no standalone UI entry, `/sessions/new` redirect, navigator from the association | [Interaction model](../../../product/specflow/ui/interaction-model.md#starting-a-session-and-the-navigator), [Full Session](../../../product/specflow/ui/full-session.md#starting-a-session) |
| U3, not-found action, archive dialog copy                                                | [Full Session](../../../product/specflow/ui/full-session.md#session-actions)                                                                                                                 |
| U4: rows, collections, paging, states                                                    | [Specification Sessions list UI spec](../screens/specification-sessions-list-ui-spec.md)                                                                                                     |
| Workspace section, Continue session, navigator count                                     | [Specification Overview](../../../product/specflow/ui/specification-overview.md#sections-and-order)                                                                                          |
| U5 and its two Context deviations                                                        | [Full Session](../../../product/specflow/ui/full-session.md#context)                                                                                                                         |
| U6: reason precedence, start-route refusal states                                        | [Specification Workspace API](../../../reference/api/specification-workspace.md#project-sessions-section), [Full Session](../../../product/specflow/ui/full-session.md#starting-a-session)   |
| Session status ownership                                                                 | [AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-status-ownership-accepted-2026-11-08)                                                                                  |

## 3. Rationale and rejected alternatives

- **Standalone Sessions out of the UI (U1):** every remaining Session surface is owned by a
  Specification; a global Sessions entry or a `/sessions` list of unassociated Sessions would add a
  navigation item and a second home for the same Session. The API keeps standalone create and list,
  so the decision is reversible without a migration.
- **Delete destination (U3):** the association read already on the screen names the only honest
  list to return to; with no available Specification, `/` is the only list that certainly exists.
  The earlier `/sessions/new` destination ("only honest destination while scope is unknown") no
  longer applies. Archive stays on the Session: it is reversible and the archived bar offers
  **Przywróć**.
- **Sessions list on the list read (U4):** rejected rendering the workspace section's rows and
  switching to the list read beyond `hasMore` (two sources for one list, no archive); a "show
  archived" switch mixing both (breaks the current/archive model of the Specifications list);
  infinite scroll (end of list unreachable for keyboard users). Explicit paging up to 4 requests per
  press bounds the work when per-row authorization leaves pages short or empty.
- **Context from the association (U5):** an association is context, never current execution (N2,
  I4), so associated Tasks are Related Tasks and scope `task` is never produced from it. No skeleton
  while the association loads, because a standalone Session would show a skeleton that then
  vanishes. A dedicated `relatedTasksMissing` note, because "Couldn't load related Tasks" misstates
  a removed Task.
- **Session-owned status (section 6 of the original contract):** rejected promoting a Session to
  attention when an Engine item names it as executor: the registry stores neither execution nor
  attention, the need would show twice, and executor identity can be stale.

## 4. Open follow-ups

- A Session of a removed Specification (`missing`) is in no list; it stays reachable by URL and from
  Engine audit links (accepted limit).
- Navigator count is interim; the "same Session in navigator, Requires attention and Continue
  session" redundancy is a separate information-model scope.
- No Task-context start and no `taskId`-filtered list until a UX contract places one (D9); the Task
  screen's Sessions section keeps showing Engine attempt executions.
