---
id: ideas.specflow-ui.screens.full-session
type: product
title: Full Session UI spec
status: draft
scope: specflow
areas: [ui, product, ai, runtime]
tags: [session, conversation, work, context, interaction, execution]
read_when:
  - implementing or reviewing Full Session
  - defining Session Primary/Secondary, current activity, Work, or interactions
summary: >
  Vertical UI specification for Full Session: Conversation Primary, default Context Secondary,
  Work/detail inspection, runtime states, canonical Session API migration, components and tokens.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.full-session-screen-structure
  - product.specflow.ui.ai-session-ux
  - architecture.ai.canonical-session-turn-work
---

# Full Session UI spec

## 1. Purpose and ownership

Full Session is the primary work surface for one AI Session.

It owns:

- human-readable conversation chronology;
- current activity;
- pending human interaction;
- composer/Turn start;
- Session-owned cancellation;
- Context and Work inspection;
- contextual File/Task/Handover/artifact detail.

It is not a provider transcript and not a raw tool console.

## 2. User use cases

- Continue a Session conversation.
- Understand what the agent is doing now.
- Respond to permission/question/confirmation.
- Inspect current execution scope and related Tasks.
- Inspect Work history and one ToolAction in depth.
- Open a file/reference without leaving the Session.
- Understand completed/failed/cancelled/interrupted Turn outcome.
- Continue/resume legal work or inspect recovery.
- Navigate from Session context to Task detail and back.

## 3. Entry and navigation

Entry:
- explicit Open full session from Floating Session;
- stable Session deep link.

Wide/Compact split entry:

~~~text
Conversation | Context
~~~

Context is default-open only on entry when no more specific Secondary target was requested.

Narrow entry:
- Conversation only;
- Context/Work/detail opened explicitly as pushed Secondary.

Closing default Context remains respected until user explicitly reopens it.

## 4. Data source / read-model ownership

Canonical Session/Turn/Work state comes from Runtime/application.

UI consumes, not derives:

- Session readiness;
- current activity;
- pending interaction;
- Turn status/outcome;
- Work chronology;
- provider capabilities;
- current execution scope;
- distinction between current and merely related Tasks.

Transport connection/reconnect state is UI/adapter state and must not overwrite canonical Session
semantics.

## 5. API availability / migration status

Legacy Session API is the strongest migration candidate among current UI surfaces.

| Need | New SpecFlow | Legacy Nevo | Direction |
| --- | --- | --- | --- |
| Session snapshot/chat/Turns | **missing** | **legacy-available** via \`GET /api/agent-sessions/:sessionId/chat\` and \`GET /api/agent-sessions/:sessionId\` | Preserve canonical Session/Turn/Work wire semantics where still valid. |
| Live updates/replay cursor | **missing** | **legacy-available** via \`GET /api/agent-sessions/:sessionId/events\` SSE | Preserve replayable ordered event model. |
| Start next Turn | **missing** | **legacy-available** via \`POST /api/agent-sessions/:sessionId/turns\` | Preserve idempotent command semantics. |
| Cancel/recover Turn | **missing** | **legacy-available** via Turn cancel/recover routes | Preserve capability-driven cancellation/recovery, redesign exact new command path if needed. |
| Respond to interaction | **missing** | **legacy-available** via \`POST /api/agent-sessions/:sessionId/interactions/:interactionId/respond\` | Strong migration candidate. |
| Provider capabilities | **missing** | **legacy-available** via \`GET /api/agent-providers\` and Session capabilities | Preserve semantic capabilities; new Runtime owns provider boundary. |
| Current single/batch execution scope | **missing** | partial legacy session/task fields; historical association is insufficient | Add explicit current execution projection. |
| Context evidence/Handover/artifacts | **missing** | partial scattered evidence | Add product context references without bloating provider Work model. |


### Legacy field evidence

Legacy already defines a rich canonical Session/Turn/Work wire model.

Useful Session fields include:

~~~text
AgentSession / AgentSessionSnapshot
  provider
  providerSessionId?
  sessionId
  specId
  taskId?
  taskIds[]
  purpose?
  mode?
  title?
  status
  readiness?
  capabilities
  createdAt
  lastActivityAt?
  completedAt?
  activeTurn?
  pendingInteraction?
  turns?
  lastEventSeq
  updatedAt
~~~

Legacy chat payload also includes:

~~~text
session { provider, providerSessionId?, sessionId, status, readiness, mode, capabilities,
          specId, taskId?, taskIds[], title?, createdAt, lastActivityAt?, lastEventSeq? }
turns[]
workSummary
readiness
~~~

Canonical Turn already exposes:

~~~text
turnId / sessionId / provider / providerSessionId
mode
status
work[]
historicalWork[]
activityCount
currentActivity
finalAnswer
userMessage
terminalOutcome
usage
createdAt / updatedAt / completedAt
~~~

This means Full Session should **migrate rather than redesign** most canonical Turn/Work fields.

Genuinely new/changed product requirements are:

- authoritative current execution scope distinct from \`taskId/taskIds\` association;
- bounded history cursor;
- stronger snapshot revision/reconciliation;
- product Context evidence/Handover references.

### Proposed Session read API

Prefer canonical application Session identity only.

Illustrative:

~~~text
GET /api/sessions/:sessionId
~~~

Response:

~~~text
{
  revision,
  session: {
    id,
    title?,
    status,
    agentRole?,
    provider?,
    mode?,
    model?,
    capabilities,
    readiness,
    createdAt,
    updatedAt,
    lastActivityAt?,
    lastEventSeq
  },
  activeTurn?: {
    turnId,
    status,
    startedAt
  },
  pendingInteraction?,
  turns: [
    {
      id,
      status,
      userMessage?,
      historicalWork[],
      currentActivity?,
      finalAnswer?,
      terminalOutcome?,
      usage?,
      createdAt,
      updatedAt,
      completedAt?
    }
  ],
  workSummary,
  history: {
    hasOlder,
    beforeCursor?
  },
  context: {
    specification: { id, title },
    currentExecution?: {
      kind: "generic" | "task" | "task-batch",
      taskIds[],
      agentRole?,
      workflowRef?
    },
    relatedTasks[],
    attention[],
    evidence[]
  }
}
~~~

The first implementation may preserve much of legacy \`AgentSessionChatPayload\`, but must add an
authoritative current-execution projection rather than treating \`taskId/taskIds\` historical binding
as execution proof.

Initial history MUST be bounded. The first implementation should return the active/current Turn and a
reasonable recent-history window, with an older-history cursor. Do not defer pagination until after
large Sessions already cause oversized first loads.

### Proposed live API

~~~text
GET /api/sessions/:sessionId/events?after=:sequence
~~~

Events should carry canonical application changes such as:

- Turn updated;
- readiness changed;
- interaction changed;
- Session metadata changed;
- context projection invalidated/changed.

Ordering/replay semantics belong to Runtime/transport adapter, not UI heuristics.

### Proposed commands

~~~text
POST /api/sessions/:sessionId/turns
POST /api/sessions/:sessionId/turns/:turnId/cancel
POST /api/sessions/:sessionId/interactions/:interactionId/respond
~~~

Start-Turn body may include:

~~~text
{
  message,
  executionIntent?,    // generic/spec-level/single Task/batch Task; exact contract TBD
  model?,
  mode?,
  effort?,
  idempotencyKey
}
~~~

Important behavior:

- explicit per-Turn execution intent defines deterministic Task execution;
- historical Session associations do not silently become execution intent;
- capabilities decide whether Cancel/interaction controls exist;
- command-time validation is authoritative;
- SSE/live update reconciles UI after mutation.

## 6. Information hierarchy

Primary:
1. user/assistant conversation;
2. meaningful Commentary;
3. current activity;
4. pending interaction;
5. compact semantic Work summaries;
6. composer;
7. when the user has scrolled away from the bottom, a clear "new activity / jump to latest" affordance
   rather than forced auto-scroll.

Secondary:
1. Context by default;
2. Work as technical/history root;
3. contextual detail such as Task/File/Handover/Work item.

## 7. Pseudo-layout

~~~text
┌──────────────┬────────────────────────────────────────────┬───────────────────────────┐
│ Navigation   │ Session: Review batch #23                  │ Context                   │
│              │ Reviewer · 3 Tasks                         │                           │
│ Specs        │                                            │ Current execution         │
│ Settings     │ You                                        │ Reviewer · 3 Tasks        │
│              │ Review completed implementation.           │ TASK-02                   │
│              │                                            │ TASK-03                   │
│              │ Agent                                      │ TASK-04                   │
│              │ I’ll inspect the changes and tests.        │                           │
│              │                                            │ Attention                 │
│              │ Read 4 files · searched repository    >    │ TASK-03 owner decision >  │
│              │ Ran tests                             >    │                           │
│              │                                            │ Related Tasks             │
│              │ Current activity                           │ TASK-01 historical         │
│              │ Reviewing change summary…                  │                           │
│              │                                            │ Evidence                  │
│              │ ┌──────────────────────────────────────┐   │ Review report        >    │
│              │ │ Message…                         Send│   │ Handover             >    │
│              │ └──────────────────────────────────────┘   │                           │
└──────────────┴────────────────────────────────────────────┴───────────────────────────┘
~~~

Context is a normal inspector surface, not a stack of cards.

## 8. Screen anatomy

### Primary
- Session header/orientation;
- conversation stream;
- current/live region;
- pending interaction;
- composer.

### Secondary roots
- Context;
- Work.

### Detail targets
- Task;
- File;
- Handover/artifact;
- Work item/ToolAction.

One Secondary only; detail replaces its root and Back returns within local inspector navigation.

## 9. Responsive contract

Wide:
- persistent nav + Conversation | Context.

Compact:
- Drawer nav + Conversation | Context if workspace >= split threshold.

Narrow:
- Conversation only;
- explicit Context/Work actions;
- pushed inspector/detail;
- current activity and pending interaction cannot exist only in Secondary.

## 10. Interaction flows

### Context drill-down
Context -> Task -> Back -> Context.

### Work drill-down
Work -> Work item -> ToolAction -> Back -> Work.

### File
Conversation/Context/Work reference -> File detail -> Back to previous inspector context.

### Pending interaction
Interaction appears in Primary -> deliberate response -> control becomes non-actionable after
resolution/expiration -> Runtime update reconciles.

### Send message
Composer -> start Turn command -> busy/live state -> ordered updates -> final/terminal outcome.

### Cancel
Only when capability permits -> Cancel -> cancelling state -> terminal projection.

## 11. Runtime states

- generic/spec-level execution;
- single Task execution;
- Task batch execution;
- active Commentary/tool work;
- waiting for model/tool without attention;
- requires human interaction;
- cancelling;
- completed Turn;
- failed/cancelled/interrupted Turn;
- continue/resume;
- recovery required;
- unavailable/unknown;
- transport reconnecting.

These states must remain semantically distinct.


## 12. Data loading, events, batching, and reconnect

This screen inherits
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md).

### Snapshot + event sequence

Required load flow:

~~~text
GET current Session snapshot
  -> receive revision + lastEventSeq
  -> subscribe from lastEventSeq
  -> reduce newer events in order
~~~

Never load a current snapshot and then reconnect from event 0.

### Realtime event bursts

Session/provider streams can generate many small updates.

Do not apply one React-query/store write per raw event.

Use:

~~~text
ordered raw events
  -> event buffer
  -> canonical reducer
  -> coalesced projection commit
~~~

Ordinary Commentary/tool-progress events may commit in a small 16–50 ms window.

Pending-interaction, terminal, unavailable/recovery, cancellation, or execution-scope changes flush
immediately after earlier queued events are reduced.

This is render/update coalescing, **not event dropping**.

### History loading

Initial snapshot contains:

- current/active Turn;
- enough recent Turns for conversational continuity;
- current readiness/interaction/activity;
- older-history cursor.

Older Turns load on explicit scroll/action. Large Work details/raw outputs remain below Work inspector
drill-down and load lazily where possible.

Floating Session shares this cache and must not trigger complete history hydration.

### Refresh / reconnect

Do **not** show a generic Refresh button while the live connection is healthy.

When transport/session synchronization fails, show a scoped Reconnect/Retry action.

Reconnect:

1. cancels/abandons stale transport work;
2. fetches one authoritative Session snapshot;
3. replaces/reconciles canonical Session cache;
4. resumes event stream from the returned cursor.

It must not blindly clear and refetch all historical Work pages.

### Scroll stability

If the user is at/near the bottom, new conversational content may follow automatically.

If the user scrolled upward:

- do not yank scroll to latest;
- accumulate a compact new-activity indicator;
- Jump to latest returns to the current stream.

Current required interaction may still surface a persistent attention indicator without forcibly
changing scroll position.

The detailed conversation and Work rendering contracts are defined separately in:

- [Session conversation UI spec](../components/session-conversation-ui-spec.md);
- [Session Work inspector UI spec](../components/session-work-inspector-ui-spec.md).

## 13. Component / composition map

| Need | Composition |
| --- | --- |
| Workspace | AppWorkspace |
| Header | WorkspaceHeader |
| Conversation | SpecFlow product composition |
| Markdown final/commentary | MarkdownDocument |
| Composer | MessageComposer |
| Current activity | product composition + StatusIndicator/Spinner as needed |
| Interaction | product composition using RadioGroup/Checkbox/Button/etc. |
| Context/Work roots | Tabs/SegmentedControl/header composition after visual review |
| Work chronology | product composition, Timeline where useful |
| Disclosure | Collapsible |
| Detail navigation | AppWorkspace Secondary stack |
| File | product file capability |
| Floating promotion/return | product router/workspace state |

Do not create one generic design-system Chat component around Session domain semantics yet.

## 14. Visual/token contract

- Primary/Secondary use existing workspace material;
- conversation text hierarchy uses semantic Typography/Markdown styles;
- Commentary is supporting narrative, not a warning surface;
- current activity uses restrained running state;
- waiting is calm;
- interaction requiring user response receives stronger semantic attention;
- tool summaries remain neutral unless failure/exception changes meaning;
- raw technical detail uses muted/code treatments;
- separators subtle; no arbitrary provider colors.

## 15. Local containment rules

- no Card per message;
- no Card per Commentary;
- no Card per tool summary;
- no Card per Context section;
- interaction may earn a contained attention surface because it is one independent required action;
- composer is an interaction control surface and may have its own boundary;
- Work detail/raw output may use code/surface containment when needed for technical readability;
- avoid nested rounded boxes inside inspector surfaces.

## 16. Accessibility/focus

- stream updates do not steal focus;
- pending interaction is announced appropriately without repeated noisy announcements;
- sending/Cancel controls expose busy/disabled semantics;
- inspector Back/Close restores meaningful focus;
- current activity not color-only;
- live regions are used sparingly;
- composer text survives contextual navigation where expected.

## 17. Storybook scenarios

- generic/spec-level live Turn;
- single Task execution;
- Task batch;
- Commentary absent;
- active tool;
- waiting without attention;
- permission/question/confirmation;
- completed;
- failed/interrupted;
- continue/resume;
- recovery;
- unavailable;
- Context -> Task;
- Work -> ToolAction;
- File detail placeholder;
- default Context closed/restored;
- narrow inspector push.

## 18. Acceptance criteria

- user sees what is happening now without opening Work;
- initial history is bounded and older history is loadable without losing the current Turn;
- event bursts do not produce one UI/cache commit per raw event;
- scrolling old history is not interrupted by forced auto-scroll;
- interaction requiring user is actionable in Primary;
- current execution is distinct from related Tasks;
- batch is batch-shaped;
- current activity does not duplicate chronology with equal weight;
- Context close is respected;
- raw tool spam stays below normal conversation level;
- one Secondary only;
- no message/tool Card soup.

## 19. Open questions

- exact current execution-intent API in new deterministic Runtime;
- history pagination;
- artifact/Handover context model;
- reasoning presentation policy;
- non-wide Floating Session behavior.
