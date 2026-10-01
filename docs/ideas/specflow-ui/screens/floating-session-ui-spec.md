---
id: ideas.specflow-ui.screens.floating-session
type: product
title: Floating Session UI spec
status: draft
scope: specflow
areas: [ui, product, ai]
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
- Open full session promotion.

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
- Session link from Task;
- Session link from Specification;
- potentially a current-execution Session shortcut.

The underlying product context remains visible.

If opened from TASK-03 while current execution is TASK-02/03/04:

~~~text
Entry context: TASK-03
Current execution: 3 Tasks
~~~

Do not relabel execution as TASK-03.

Open full session explicitly promotes the Session to its full workspace.

Returning from Full Session should restore the originating Spec/Task context when navigation state can
represent it.

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

| Need | New SpecFlow | Legacy Nevo | Direction |
| --- | --- | --- | --- |
| Session snapshot/chat | **missing** | **legacy-available** via \`GET /api/agent-sessions/:sessionId/chat\` | Reuse Full Session migration contract. |
| Live current activity/events | **missing** | **legacy-available** via Session SSE events | Reuse one Session event stream. |
| Start Turn | **missing** | **legacy-available** via \`POST /api/agent-sessions/:sessionId/turns\` | Reuse Full Session command. |
| Respond to interaction | **missing** | **legacy-available** via interaction respond route | Reuse Full Session command. |
| Cancel Turn | **missing** | **legacy-available** and capability-driven | Expose only if compact surface has room and product decides it is useful. |
| Entry context (where floating was opened) | UI navigation state | not a backend Session fact | Keep product-local; do not persist as Session execution identity. |


### Legacy field evidence

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

1. Session identity/agent role.
2. current activity or requires-attention state.
3. recent conversation.
4. pending interaction when present.
5. composer.
6. Open full session.

Avoid technical metadata unless it explains availability/state.

## 7. Pseudo-layout

~~~text
Specification / Task remains visible behind

                                   ┌─────────────────────────────────────┐
                                   │ Reviewer · Review batch #23   [↗][×]│
                                   │ TASK-03 context                    │
                                   │                                     │
                                   │ Agent                               │
                                   │ Reviewing the latest changes…      │
                                   │                                     │
                                   │ Ran tests · inspected 4 files      │
                                   │                                     │
                                   │ Current                             │
                                   │ Reviewer · 3 Tasks                 │
                                   │ Reviewing TASK-02/03/04            │
                                   │                                     │
                                   │ ┌─────────────────────────────────┐ │
                                   │ │ Message…                    Send│ │
                                   │ └─────────────────────────────────┘ │
                                   │                                     │
                                   │ Open full session →                 │
                                   └─────────────────────────────────────┘
~~~

The window itself is already a contained host; do not place conversation content into nested Cards.

## 8. Screen anatomy

- floating window header;
- compact orientation/entry-context hint;
- recent conversation;
- current activity;
- pending interaction;
- composer/response controls;
- Open full session.

## 9. Responsive contract

### Wide
Use existing floating-window foundation.

### Compact / Narrow
Current Nevo UI floating-window implementation is wide-only.

Product behavior remains unresolved and must be decided explicitly before implementation:

- extend generic floating support to compact widths;
- use another context-preserving overlay/surface;
- or promote directly to Full Session while preserving deterministic return context.

Do not silently reuse a desktop floating window on unsupported narrow geometry.

## 10. Interaction flows

### Open from Task
Task -> Floating Session; Task remains visible/selected.

### Send
Composer -> Session Turn command -> current activity/live updates.

### Interaction
Pending interaction -> response -> canonical Session state updates.

### Promote
Open full session -> Full Session workspace -> return restores original Task/Spec context where
representable.

### Close
Close/minimize -> underlying product context remains unchanged.

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

## 13. Component / composition map

| Need | Composition |
| --- | --- |
| Host | FloatingWindow / FloatingWindowHost on supported wide layout |
| Header/actions | floating host actions + product title |
| Conversation | compact SpecFlow Session composition |
| Markdown | MarkdownDocument |
| Current activity | product composition |
| Composer | MessageComposer |
| Interaction | product composition from form/action primitives |
| Promote | Button/Link action to Full Session |

## 14. Visual/token contract

- host uses existing floating surface/material;
- no nested Card around transcript;
- conversation text follows Full Session semantic typography;
- current activity is restrained;
- requires-attention interaction gets stronger semantic treatment;
- entry-context metadata uses muted text;
- Open full session is clear but secondary to active required response.

## 15. Local containment rules

- FloatingWindow already supplies containment;
- no Card per message/tool/commentary;
- no inner "Session Card";
- pending interaction may use a distinct contained region when response controls need one boundary;
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
- wide floating bounds;
- future compact/narrow behavior once decided.

## 18. Acceptance criteria

- user can converse without abandoning parent context;
- entry context is not confused with execution scope;
- compact surface shows current attention/activity without Work inspector;
- promotion to Full Session is explicit;
- no duplicate backend Session model/API or duplicate live subscription;
- opening the floating presentation does not hydrate old Session history;
- floating host does not become nested Card soup.

## 19. Open questions

- non-wide presentation;
- exact recent-history budget;
- whether Cancel belongs in compact floating UI;
- multiple simultaneous floating Sessions behavior in product, despite generic host support.
