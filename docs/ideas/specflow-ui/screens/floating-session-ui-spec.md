---
id: ideas.specflow-ui.screens.floating-session
type: product
title: Floating Session UI spec
status: draft
scope: specflow
areas: [ui, ai]
tags: [session, floating, conversation, contextual]
read_when:
  - implementing or reviewing Floating Session
  - deciding how quick Session interaction preserves Spec/Task context
summary: >
  Vertical UI specification for Floating Session: contextual conversation, current activity,
  pending interaction, promotion to Full Session, API reuse, responsive constraints, components and tokens.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.full-session-screen-structure
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
---

# Floating Session UI spec

## 1. Purpose and ownership

Floating Session provides quick Session access without abandoning the user's current Specification
or Task context.

It owns only the compact interaction surface:

- recent conversation;
- meaningful Commentary;
- current activity;
- pending interaction;
- composer/response controls;
- header-level promotion to Full Session;
- integration with the bottom floating-session dock/minimized-session tabs.

It intentionally does not host the full Context inspector, Work history, file browser, or large
artifact/review surfaces.

## 2. User use cases

- Ask/follow up with the agent while reviewing a Task.
- See whether the agent is currently working/waiting/needs input.
- Respond to a pending permission/question/confirmation.
- Open Full Session when deeper history/context is needed.
- Close/minimize the conversation and continue reviewing the underlying Task/Spec.
- Preserve the entry context even when the Session's current execution is a larger Task batch.

## 3. Entry and navigation

Entry points:
- conversation target from a Session reference on Task;
- conversation target from a Session reference on Specification;
- potentially a current-execution conversation shortcut.

The same originating Session reference may expose a direct Open full session action. Floating Session
is therefore a quick presentation, not a required navigation step before Full Session.

The underlying product context remains visible.

If opened from TASK-03 while current execution is TASK-02/03/04:

~~~text
Entry context: TASK-03
Current execution: 3 Tasks
~~~

Do not relabel execution as TASK-03.

Open full session in the floating header navigates to Full Session. The same full-screen intent may
also be available directly on the originating Session reference.

Router Back from Full Session returns to the previous routed surface. A previously open Task
Secondary is local Workspace state and is not guaranteed to be reconstructed by the route.

## 4. Data source / read-model ownership

Floating Session should reuse the same canonical Session read model and live stream as Full Session.

Do **not** create a second backend Session model merely because the presentation is smaller.

Frontend selects a compact subset of the canonical projection:

- Session title/role;
- recent relevant conversation;
- current activity;
- pending interaction;
- readiness/capabilities;
- enough context to explain where it was opened.

## 5. API availability / migration status

| Need | New SpecFlow | Old repo evidence | Direction |
| --- | --- | --- | --- |
| Session snapshot/chat | **missing** | **old-repo-available** via \`GET /api/agent-sessions/:sessionId/chat\` | Reuse Full Session migration contract. |
| Live current activity/events | **missing** | **old-repo-available** via Session SSE events | Reuse one Session event stream. |
| Start Turn | **missing** | **old-repo-available** via \`POST /api/agent-sessions/:sessionId/turns\` | Reuse Full Session command. |
| Respond to interaction | **missing** | **old-repo-available** via interaction respond route | Reuse Full Session command. |
| Cancel Turn | **missing** | **old-repo-available** and capability-driven | Expose only if compact surface has room and product decides it is useful. |
| Entry context (where floating was opened) | UI navigation state | not a backend Session fact | Keep product-local; do not persist as Session execution identity. |


### Old-repo field evidence

Floating Session does not need a separate field contract.

It reuses the Full Session canonical fields:

~~~text
Session identity/title/status/readiness/capabilities
activeTurn
pendingInteraction
recent Turns
currentActivity
finalAnswer
workSummary
lastEventSeq
authoritative current execution scope
~~~

Its only presentation-local data is \`openedFrom\` navigation context. That field must stay outside
canonical Runtime execution identity.

### Proposed API direction

No Floating-Session-specific backend API is needed.

Use the Full Session contracts:

~~~text
GET  /api/sessions/:sessionId
GET  /api/sessions/:sessionId/events?after=:sequence
POST /api/sessions/:sessionId/turns
POST /api/sessions/:sessionId/interactions/:interactionId/respond
~~~

The UI selects only recent/render-relevant content from the shared Session snapshot/cache.

Full Session history is bounded/paginated. Floating Session consumes the current Turn + recent
conversation window already present in that cache and MUST NOT trigger older-history hydration merely
because the floating window opened.

The entry context is product navigation state:

~~~text
{
  sessionId,
  openedFrom: {
    kind: "spec" | "task",
    specId,
    taskId?
  }
}
~~~

It must never be interpreted by Runtime as current deterministic execution intent.

## 6. Information hierarchy

1. Session identity/agent role in the header.
2. current activity or requires-attention state.
3. recent conversation.
4. pending interaction when present.
5. composer as the **last element inside the active floating window**.

Open Full Session is a header action, not content below the composer.

Avoid technical metadata unless it explains availability/state.

## 7. Pseudo-layout

Wide desktop concept:

~~~text
underlying Specification / Task remains visible

                                      ┌───────────────────────────────┐
                                      │ Review batch #23       [↗][×]│
                                      │ Reviewer · TASK-03 context   │
                                      ├───────────────────────────────┤
                                      │                               │
                                      │ recent conversation           │
                                      │ Commentary / compact Work     │
                                      │ current activity              │
                                      │                               │
                                      │                               │
                                      ├───────────────────────────────┤
                                      │ Message…                 Send │ [Session 2] [Session 3] [More…]
                                      └───────────────────────────────┘
──────────────────────────────────────────────────────────────────────── bottom
~~~

The important contract is:

- the active floating Session is bottom-aligned;
- its composer is pinned to the bottom of that window;
- **nothing belonging to the active Session is rendered under the composer**;
- Open full session/expand belongs in the floating header;
- other minimized Sessions live in the bottom dock as compact tabs/chips **on the same bottom
  baseline as the active window composer row**, outside the active Session content;
- when there are too many minimized Sessions, the dock collapses overflow behind \`More…\`;
- selecting a minimized Session activates/restores that Session window;
- a truly closed Session is removed from the dock. Reopenable entries are therefore **minimized**, not
  semantically closed.

The active window itself is already a contained host; do not place transcript sections into nested
Cards.

## 8. Screen anatomy

- floating window header with Full Session/expand + minimize/close actions;
- compact orientation/entry-context hint;
- recent conversation;
- current activity;
- pending interaction;
- composer/response controls pinned as the last row;
- external bottom dock with minimized Session tabs + More overflow.

## 9. Responsive contract

### Wide
Floating Session exists only on Wide and uses the floating-window foundation.

### Compact / Narrow
Floating Session is not offered.

Opening an existing Session conversation navigates directly to Full Session. Do not invent a modal,
bottom sheet, or smaller floating equivalent merely to preserve feature symmetry.
## 10. Interaction flows

### Open from Task/Specification
Wide conversation target -> Floating Session; underlying context remains visible.

### Send
Composer -> Session Turn command -> current activity/live updates.

### Interaction
Pending interaction is visible/respondable in the compact conversation when capabilities permit.

### Promote
Header Open full session -> routed Full Session. Router Back later returns to the previous routed
surface; restoring a Task Secondary is not a routing guarantee.

### Minimize / Restore / Close
These remain Wide-only floating-window interactions. Close removes only the presentation, not the
Session resource.
## 11. States

- idle/ready;
- active work;
- waiting without attention;
- pending interaction;
- cancelling if exposed;
- completed Turn;
- unavailable/read-only;
- disconnected/reconnecting transport;
- entry Task differs from current batch execution.


## 12. Data loading, events, and Refresh

Floating Session inherits the same Session snapshot/query/event stream as Full Session.

There is no independent Floating-Session cache, polling loop, or Refresh endpoint.

### Event updates

- use the shared ordered Session reducer;
- use the same event coalescing rules as Full Session;
- do not create duplicate subscriptions when Full Session/Floating Session observe the same Session
  in one application lifetime if a shared subscription/cache layer can serve both;
- pending interaction and terminal/readiness changes remain immediate semantic updates.

### Refresh

Floating Session has **no independent Refresh** action.

If the Session becomes unavailable/desynchronized, expose the same scoped Retry/Reconnect semantics
as the shared Session data layer.

Opening/closing/minimizing the floating window does not refetch the Session merely because
presentation changed.

Floating Session reuses the same conversation semantics defined in
[Session conversation UI spec](../components/session-conversation-ui-spec.md). It does not invent a
second compact-chat renderer.

## 13. Component / composition map

| Need | Composition |
| --- | --- |
| Host | FloatingWindow / FloatingWindowHost on supported wide layout |
| Header/actions | floating host actions + product title + Full Session/expand |
| Bottom dock | product composition over floating host/session window state |
| Conversation | compact SpecFlow Session composition |
| Markdown | MarkdownDocument |
| Current activity | product composition |
| Composer | MessageComposer |
| Interaction | product composition from form/action primitives |
| Promote | IconButton/Button action in header to Full Session |

## 14. Visual/token contract

- host uses existing floating surface/material;
- no nested Card around transcript;
- conversation text follows Full Session semantic typography;
- current activity is restrained;
- requires-attention interaction gets stronger semantic treatment;
- entry-context metadata uses muted text;
- Full Session/expand is a compact header action, never a footer below the composer;
- minimized Session tabs are lower-weight dock controls, not content cards.

## 15. Local containment rules

- FloatingWindow already supplies containment;
- no Card per message/tool/commentary;
- no inner "Session Card";
- pending interaction may use a distinct contained region when response controls need one boundary;
- minimized Session tabs are compact dock controls, not Cards;
- avoid multiple boxed panels inside the floating window.

## 16. Accessibility/focus

- opening floating surface establishes predictable focus without losing return target;
- closing restores focus to originating Session link where practical;
- composer and interaction controls keyboard-operable;
- current activity updates do not steal focus;
- Open full session has explicit accessible intent.

## 17. Storybook scenarios

- opened from Task;
- current execution same Task;
- opened from Task but execution is batch;
- pending question;
- active tool/current activity;
- completed/idle;
- unavailable;
- long recent response;
- composer pinned to window bottom;
- one active + two minimized Sessions;
- minimized overflow -> More;
- restore minimized Session;
- close vs minimize;
- wide floating bounds;
- verify the Floating Session affordance is absent on Compact/Narrow and Session access uses Full Session.

## 18. Acceptance criteria

- Floating Session is Wide-only;
- Compact/Narrow existing-Session access goes directly to Full Session;
- user can converse on Wide without abandoning parent context;
- entry context is not confused with execution scope;
- compact surface shows current attention/activity without full inspection UI;
- composer is the last element of the active window;
- Full Session promotion is explicit in the header;
- minimized Sessions use a separate bottom dock with More overflow;
- Close and Minimize remain distinct;
- no duplicate backend Session model/API or live subscription;
- floating host does not become nested Card soup.
## 19. Open questions

- exact recent-history budget;
- whether Cancel belongs in compact floating UI;
- exact maximum visible minimized Session tabs before More overflow;
- whether only one floating Session may be expanded at a time.