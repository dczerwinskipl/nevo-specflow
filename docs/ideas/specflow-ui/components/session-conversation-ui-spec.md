---
id: ideas.specflow-ui.components.session-conversation
type: product
title: Session conversation UI spec
status: draft
scope: specflow
areas:
  - ui
  - ai
  - runtime
tags:
  - session
  - chat
  - commentary
  - work-summary
  - interaction
  - composer
read_when:
  - implementing Full Session or Floating Session conversation
  - creating Storybook/Figma fixtures for Session states
  - deciding how Commentary and tool work mix in chat
summary: >
  Detailed product presentation contract for Session conversation: user/assistant messages,
  Commentary, compact Work bursts, current activity, interactions, terminal outcomes,
  grouping rules, payload-backed state mocks, loading/realtime behavior, and component ownership.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.screens.full-session
  - ideas.specflow-ui.screens.floating-session
  - ideas.specflow-ui.data-loading-refresh-and-eventing
  - product.specflow.ui.ai-session-ux
  - architecture.ai.canonical-session-turn-work
---

# Session conversation UI spec

## 1. Responsibility

Session conversation is the human-readable working stream.

It answers:

- What did I ask?
- What has the agent told me?
- What meaningful progress happened?
- What is happening right now?
- Does the agent need something from me?
- Can I send another message?

It is **not** the complete Work timeline.

Raw provider protocol, raw tool input/output, every ToolAction, and older full history live below the
Work inspector/detail layers.

## 2. Component ownership

This is a **SpecFlow product composition**, not a generic design-system Chat component.

Recommended product composition:

```text
SessionConversation
├── UserMessage
├── AgentMessage / FinalAnswer
├── CommentaryEntry
├── WorkActivityDisclosure
│   ├── WorkActivitySummaryLine
│   └── WorkActivityExpanded
├── SessionCurrentActivity
├── SessionInteraction
├── TurnOutcomeNotice
├── NewActivityIndicator
└── MessageComposer
```

Use Nevo UI primitives for Typography, MarkdownDocument, Button/IconButton, semantic status/Spinner
where useful, MessageComposer, and Alert only for exceptional error/attention states.

`MessageComposer` is the shared authoring extension point across normal Session conversation,
Specification create-and-start, and workflow-owned Session starts. Do not fork separate prompt
editors for those entry flows. Future authored-Markdown or richer authoring capability should land in
the shared composer path so all Session entry points gain it consistently.

Do **not** use generic Timeline as the conversation root. Conversation is a message/work stream, not
an audit timeline.

The compact/expanded Work activity embedded in conversation is not a generic Timeline. It uses
prose Commentary plus compact grouped tool rows. Generic Timeline is reserved for exact L3 Work
history where chronology itself is the dominant structure.

## 3. Canonical input

The conversation consumes canonical Session/Turn/Work projections.

Relevant payload fields:

```text
Session
  id
  status
  readiness
  capabilities
  activeTurn?
  pendingInteraction?
  lastEventSeq

Turn
  turnId
  status
  userMessage?
  historicalWork[]
  currentActivity?
  finalAnswer?
  terminalOutcome?
  createdAt
  updatedAt
  completedAt?

Work
  commentary
  reasoning
  tool
  interaction
```

Conversation presentation MUST NOT reclassify raw provider events.

## 4. Visual hierarchy

From strongest normal content to weakest supporting content:

```text
User request
Agent final answer / meaningful agent response
Pending human interaction                     when actionable
Meaningful Commentary
Current activity                              live/status line
Compact Work summary
Terminal diagnostic                           only when relevant
Technical metadata                            normally not in conversation
```

Current activity may be visually persistent near the composer, but it must not duplicate the same
streaming text with equal weight inside the conversation.

## 5. Message formatting

### 5.1 User message

User message is one independently meaningful authored object, so a restrained message bubble/surface
is allowed.

Rules:

- visually distinct from agent output;
- no oversized Card;
- max readable text width;
- Markdown support only if product intentionally allows authored Markdown;
- timestamp hidden/de-emphasized by default;
- no provider/session metadata inside the bubble.

Example:

```text
                                      ┌─────────────────────────────────────┐
                                      │ Review the implementation and run  │
                                      │ the relevant tests.                │
                                      └─────────────────────────────────────┘
```

### 5.2 Agent final answer

Final answer is borderless-first Markdown content.

Do not wrap every assistant answer in a Card.

```text
Review completed.

I found one issue in the recovery path...
```

### 5.3 Commentary

Commentary is progress narration supplied by the provider/runtime.

Rules:

- text-first;
- visually lighter than final answer;
- no permanent Card;
- preserve meaningful distinct Commentary;
- never fabricate Commentary when absent;
- exact/noisy repetition may be collapsed in compact presentation;
- full canonical Commentary remains available in Work details.

Example:

```text
Checking the admission path and the persisted finish-operation state…
```

Commentary is not a status badge.

### 5.4 Historical Work summary

Tools do not appear as chat bubbles.

Adjacent happy-path work is summarized as one compact semantic line/burst.

```text
  Read 4 files · searched repository · ran tests          >
```

The trailing affordance opens Work at the corresponding history location.

### 5.5 Compact Work activity disclosure

The normal Session stream should not permanently display a large Work log.

Collapsed form is one line:

```text
Working · 1 read · 2 searches · 4 commands                    [Expand]
```

or, when current activity is more useful:

```text
Running tests · specflow-runtime                              [Expand]
```

Expanded form stays bounded to roughly **5–7 compact lines/rows** and uses Nevo UI `ScrollArea`
with edge indicators:

```text
Checking the admission path…
  1 read · 2 searches · 4 commands

Verifying the recovery path…
  2 reads · tests passed

⟳ Executing command · pnpm check
```

The expanded block follows chat direction: oldest at the top, newest/current at the bottom.

It is a quick inspection surface, not full Work history. An **Open Work** action promotes to the L2
Work inspector.

Commentary inside this block is rendered as prose, not as an icon-heavy timeline row.

### 5.6 Current activity

Current activity is canonical Runtime state.

Examples:

```text
○ Waiting for model response…
◌ Thinking…
⟳ Running tests · tools/dashboard
⟳ 3 tools running
! Agent needs your input
```

Do not infer current activity from the last historical Work item.

### 5.7 Pending interaction

A pending interaction is one of the few places where stronger containment is justified because it is
an independent required user action. Keep it visible/actionable in Conversation Primary on every
breakpoint; arrival of the interaction must not automatically replace the user's current Secondary.

```text
┌────────────────────────────────────────────────────────────┐
│ Permission required                                        │
│                                                            │
│ Run command                                                │
│ pnpm test                                                  │
│                                                            │
│ [Deny]                                      [Allow]         │
└────────────────────────────────────────────────────────────┘
```

Resolved/expired interactions lose their controls and become quiet history.

### 5.8 Terminal outcome

Completed Turn:

- no celebratory success Card;
- final answer/history is enough.

Failed/interrupted Turn:

- one concise human-readable outcome after the relevant work;
- raw stack/provider output is deeper detail.

```text
! Turn failed
  Build command exited with code 1.                         [Inspect work]
```

Earlier historical failures are quieter than the latest actionable failure.

## 6. Conversation grouping model

```text
Conversation / L1
  human conversation + collapsed/expanded compact Work activity + current activity

Work / L2
  chronology-preserving grouped Work chapters/log

Work item / L3
  one canonical Work item

ToolAction / raw detail / L4
  deepest technical inspection
```

Conversation grouping is deliberately more semantic and compact than Work/L2.

## 7. Work-burst grouping in conversation

A Work burst is a sequence of adjacent historical happy-path tools between semantic boundaries.

### Boundaries that end a burst

- meaningful Commentary;
- Reasoning item, even if Reasoning is not shown in Primary;
- Interaction;
- failed/cancelled/interrupted tool;
- active/queued tool;
- user-message/Turn boundary;
- final answer/terminal outcome.

Do not group across a boundary merely because the hidden UI would look cleaner.

### What may be summarized together

Canonical sequence:

```text
commentary A
read file 1
read file 2
search code
commentary B
command
test
commentary C
final answer
```

Compact conversation:

```text
Checking the current implementation…

  Read 2 files · searched code                              >

The admission guard is in the workflow service. Verifying behavior…

  Ran command · tests passed                               >

The implementation is consistent with the current contract.

Final answer...
```

The two tool bursts remain separate because Commentary B is a semantic boundary.

### Maximum compactness

A Work burst SHOULD show at most about three semantic clauses.

```text
Read 8 files · searched code · ran tests · +4 more          >
```

Do not generate a long sentence containing every tool invocation.

### Exceptional tools

Never hide a failed/cancelled/interrupted tool inside a successful aggregate.

```text
  Read 4 files · searched code                              >
! Command failed · pnpm test                                >
  Edited 2 files                                            >
```

If the Turn later recovers, the failed item remains part of history but does not need a page-level
error once no longer actionable.

## 8. Commentary grouping

Distinct Commentary always remains distinct.

Exact repeated normalized Commentary within one Turn may be compacted when it is clearly provider
loop noise.

Canonical:

```text
"Waiting for the test result…"
tool
"Waiting for the test result…"
tool
"Waiting for the test result…"
```

Conversation may render once:

```text
Waiting for the test result…
```

Work/L2 may show the prose once with a quiet repeat count:

```text
Waiting for the test result… ×3
```

Work/L3 preserves all three canonical items.

Never dedupe merely similar text with different meaning.

## 9. Reasoning presentation

Canonical Reasoning and Commentary are **different Work kinds**.

- Commentary = user-facing progress narration supplied by the agent/provider.
- Reasoning = separate reasoning/thinking Work and is not automatically safe/useful conversation
  prose.

Default:

- active reasoning -> compact current activity such as `Thinking…`;
- historical reasoning -> Work inspector/deeper inspection;
- provider-supplied user-safe reasoning summary MAY be inspectable in Work;
- raw/provider-defined reasoning does not become an ordinary assistant message or Commentary.

Reasoning boundaries still prevent Work-burst grouping across them.

## 10. Active item versus historical work

The canonical item projected as current activity should not simultaneously appear as an equally
prominent historical row.

Payload:

```json
{
  "historicalWork": [{ "id": "read-1", "type": "tool", "kind": "read", "status": "completed" }],
  "currentActivity": {
    "kind": "tool",
    "subjectId": "test-2",
    "title": "Run tests",
    "startedAt": "2026-10-01T10:00:00Z"
  }
}
```

Compact UI:

```text
  Read file                                                >

⟳ Run tests
```

Do not additionally render Run tests in the historical Work burst until it settles into history.

## 11. Payload-backed state fixtures

### S01 — waiting for model

Fixture: session-conversation/waiting-for-model

```json
{
  "turnId": "turn-01",
  "status": {
    "status": "waiting",
    "reason": "provider_response",
    "since": "2026-10-01T10:00:00Z",
    "source": "turn.started"
  },
  "historicalWork": [],
  "currentActivity": {
    "kind": "waiting_for_model",
    "title": "Waiting for model response",
    "startedAt": "2026-10-01T10:00:00Z"
  },
  "finalAnswer": null
}
```

```text
You
Review TASK-03 and run the tests.

○ Waiting for model response…

[ Message…                                      ]
```

Tone: calm, not attention/warning.

### S02 — streaming Commentary

Fixture: session-conversation/streaming-commentary

```json
{
  "status": {
    "status": "active",
    "detail": "commentary",
    "subjectId": "commentary-1",
    "since": "2026-10-01T10:01:00Z",
    "source": "commentary.started"
  },
  "work": [
    {
      "id": "commentary-1",
      "seq": 1,
      "type": "commentary",
      "text": "Checking the workflow admission path and recovery state…",
      "status": "streaming",
      "createdAt": "2026-10-01T10:01:00Z",
      "updatedAt": "2026-10-01T10:01:01Z"
    }
  ],
  "historicalWork": [],
  "currentActivity": {
    "kind": "commentary",
    "subjectId": "commentary-1",
    "title": "Generating response",
    "text": "Checking the workflow admission path and recovery state…",
    "startedAt": "2026-10-01T10:01:00Z"
  }
}
```

```text
Checking the workflow admission path and recovery state…▍

Generating response…
```

Do not repeat the full Commentary text again in the live-status line. The status line reduces to a
generic live cue while the streaming text itself is visible.

### S03 — active tool

Fixture: session-conversation/active-tool

```json
{
  "historicalWork": [
    {
      "id": "read-1",
      "seq": 1,
      "type": "tool",
      "toolName": "view_file",
      "kind": "read",
      "title": "Read file",
      "subject": "service.mjs",
      "status": "completed",
      "actions": [],
      "createdAt": "2026-10-01T10:01:00Z",
      "updatedAt": "2026-10-01T10:01:01Z"
    }
  ],
  "currentActivity": {
    "kind": "tool",
    "subjectId": "test-2",
    "toolKind": "test",
    "toolName": "run_tests",
    "title": "Run tests",
    "subject": "specflow-runtime",
    "status": "active",
    "activeCount": 1,
    "startedAt": "2026-10-01T10:02:00Z"
  }
}
```

```text
  Read file · service.mjs                                  >

⟳ Run tests · specflow-runtime
```

### S04 — mixed Commentary and tools

Fixture: session-conversation/mixed-work

```json
{
  "historicalWork": [
    {
      "id": "c1",
      "seq": 1,
      "type": "commentary",
      "text": "Checking the current implementation…",
      "status": "completed",
      "createdAt": "2026-10-01T10:00:00Z",
      "updatedAt": "2026-10-01T10:00:02Z"
    },
    {
      "id": "r1",
      "seq": 2,
      "type": "tool",
      "toolName": "view_file",
      "kind": "read",
      "title": "Read file",
      "subject": "admission.mjs",
      "status": "completed",
      "actions": [],
      "createdAt": "2026-10-01T10:00:03Z",
      "updatedAt": "2026-10-01T10:00:04Z"
    },
    {
      "id": "r2",
      "seq": 3,
      "type": "tool",
      "toolName": "view_file",
      "kind": "read",
      "title": "Read file",
      "subject": "finish-operation.mjs",
      "status": "completed",
      "actions": [],
      "createdAt": "2026-10-01T10:00:05Z",
      "updatedAt": "2026-10-01T10:00:06Z"
    },
    {
      "id": "s1",
      "seq": 4,
      "type": "tool",
      "toolName": "grep_search",
      "kind": "search",
      "title": "Search code",
      "subject": "WORKSPACE_WRITER_BLOCKED_BY_RECOVERY",
      "status": "completed",
      "actions": [],
      "createdAt": "2026-10-01T10:00:07Z",
      "updatedAt": "2026-10-01T10:00:08Z"
    },
    {
      "id": "c2",
      "seq": 5,
      "type": "commentary",
      "text": "The guard is in the admission path. Verifying the recovery transition…",
      "status": "completed",
      "createdAt": "2026-10-01T10:00:09Z",
      "updatedAt": "2026-10-01T10:00:10Z"
    },
    {
      "id": "cmd1",
      "seq": 6,
      "type": "tool",
      "toolName": "run_command",
      "kind": "command",
      "title": "Run command",
      "subject": "pnpm test",
      "status": "completed",
      "actions": [],
      "exitCode": 0,
      "createdAt": "2026-10-01T10:00:11Z",
      "updatedAt": "2026-10-01T10:00:20Z"
    },
    {
      "id": "t1",
      "seq": 7,
      "type": "tool",
      "toolName": "run_tests",
      "kind": "test",
      "title": "Run tests",
      "subject": "workflow tests",
      "status": "completed",
      "actions": [],
      "exitCode": 0,
      "createdAt": "2026-10-01T10:00:21Z",
      "updatedAt": "2026-10-01T10:00:29Z"
    }
  ],
  "currentActivity": null,
  "finalAnswer": {
    "id": "answer-1",
    "text": "The recovery path is consistent with the current workflow contract.",
    "status": "completed",
    "createdAt": "2026-10-01T10:00:30Z",
    "updatedAt": "2026-10-01T10:00:31Z",
    "completedAt": "2026-10-01T10:00:31Z"
  }
}
```

```text
Checking the current implementation…

  Read 2 files · searched code                              >

The guard is in the admission path. Verifying the recovery transition…

  Ran command · tests passed                                >

The recovery path is consistent with the current workflow contract.
```

This fixture is mandatory because it validates the exact mixed-data grouping rule.

### S05 — collapsed and expanded Work activity

Fixture: session-conversation/work-activity-disclosure

Payload excerpt:

```json
{
  "historicalWork": [
    {
      "id": "c1",
      "seq": 1,
      "type": "commentary",
      "text": "Checking the admission path…",
      "status": "completed"
    },
    {
      "id": "r1",
      "seq": 2,
      "type": "tool",
      "kind": "read",
      "title": "Read file",
      "status": "completed",
      "actions": []
    },
    {
      "id": "s1",
      "seq": 3,
      "type": "tool",
      "kind": "search",
      "title": "Search code",
      "status": "completed",
      "actions": []
    },
    {
      "id": "s2",
      "seq": 4,
      "type": "tool",
      "kind": "search",
      "title": "Search code",
      "status": "completed",
      "actions": []
    },
    {
      "id": "cmd1",
      "seq": 5,
      "type": "tool",
      "kind": "command",
      "title": "Run command",
      "status": "completed",
      "actions": []
    }
  ],
  "currentActivity": {
    "kind": "tool",
    "subjectId": "cmd2",
    "title": "Run command",
    "subject": "pnpm check",
    "status": "active",
    "startedAt": "2026-10-01T10:10:00Z"
  }
}
```

Collapsed:

```text
Working · 1 read · 2 searches · 1 command                    [Expand]
```

Expanded:

```text
Checking the admission path…
  1 read · 2 searches · 1 command

⟳ Run command · pnpm check
```

Expanded content is bounded by ScrollArea; it does not grow without limit.

### S06 — multiple active tools

Fixture: session-conversation/work-activity-disclosure
session-conversation/multiple-active-tools

```json
{
  "currentActivity": {
    "kind": "tool",
    "subjectId": "tool-3",
    "toolKind": "command",
    "title": "3 tools running",
    "activeCount": 3,
    "startedAt": "2026-10-01T10:10:00Z"
  }
}
```

```text
⟳ 3 tools running                                      [Work]
```

Do not list three spinners in the conversation.

### S07 — pending permission

Fixture: session-conversation/permission

```json
{
  "pendingInteraction": {
    "id": "interaction-1",
    "kind": "permission",
    "resumePolicy": "live-operation",
    "toolName": "run_command",
    "input": {
      "command": "pnpm test"
    },
    "details": "The agent wants to run the project test suite."
  },
  "readiness": {
    "status": "requiresAttention",
    "reason": "Permission response required"
  }
}
```

```text
┌────────────────────────────────────────────────────────────┐
│ Permission required                                        │
│ Run command · pnpm test                                    │
│ The agent wants to run the project test suite.             │
│                                                            │
│ [Deny]                                      [Allow]         │
└────────────────────────────────────────────────────────────┘
```

Composer follows authoritative readiness. Do not let a normal Send path bypass a required response.

### S08 — pending question

Fixture: session-conversation/question

```json
{
  "pendingInteraction": {
    "id": "interaction-2",
    "kind": "question",
    "resumePolicy": "live-operation",
    "questions": [
      {
        "id": "q1",
        "header": "Migration strategy",
        "question": "Which compatibility strategy should be used?",
        "multiSelect": false,
        "options": [
          { "label": "Keep compatibility", "description": "Preserve legacy adapter behavior." },
          { "label": "Breaking cutover", "description": "Use only the new canonical contract." }
        ]
      }
    ]
  }
}
```

```text
┌────────────────────────────────────────────────────────────┐
│ Migration strategy                                         │
│ Which compatibility strategy should be used?               │
│                                                            │
│ ○ Keep compatibility                                       │
│   Preserve legacy adapter behavior.                        │
│ ○ Breaking cutover                                         │
│   Use only the new canonical contract.                     │
│                                                            │
│                                             [Submit]        │
└────────────────────────────────────────────────────────────┘
```

### S09 — pending confirmation

Fixture: session-conversation/confirmation

```json
{
  "pendingInteraction": {
    "id": "interaction-3",
    "kind": "confirmation",
    "resumePolicy": "restart",
    "title": "Discard local changes?",
    "message": "This will discard the uncommitted workspace changes.",
    "details": "3 modified files"
  }
}
```

```text
┌────────────────────────────────────────────────────────────┐
│ Discard local changes?                                     │
│ This will discard the uncommitted workspace changes.       │
│ 3 modified files                                           │
│                                                            │
│ [Cancel]                                   [Discard]        │
└────────────────────────────────────────────────────────────┘
```

Destructive confirmation uses semantic danger action treatment.

### S10 — failed tool, Turn still active

Fixture: session-conversation/tool-failed-turn-active

```json
{
  "status": {
    "status": "active",
    "detail": "processing",
    "since": "2026-10-01T10:20:00Z",
    "source": "turn.processing"
  },
  "historicalWork": [
    {
      "id": "cmd-fail",
      "seq": 4,
      "type": "tool",
      "toolName": "run_command",
      "kind": "command",
      "title": "Run command",
      "subject": "pnpm test",
      "status": "failed",
      "actions": [],
      "exitCode": 1,
      "createdAt": "2026-10-01T10:19:00Z",
      "updatedAt": "2026-10-01T10:19:10Z"
    }
  ],
  "currentActivity": {
    "kind": "commentary",
    "subjectId": "c-recover",
    "title": "Generating response",
    "text": "The test failed. Inspecting the failure before retrying…",
    "startedAt": "2026-10-01T10:20:00Z"
  }
}
```

```text
! Command failed · pnpm test                                >

The test failed. Inspecting the failure before retrying…▍
```

A failed Tool is not a failed Turn.

### S11 — terminal failed Turn

Fixture: session-conversation/turn-failed

```json
{
  "status": {
    "status": "terminal",
    "outcome": "failed",
    "initiator": "agent",
    "error": {
      "code": "COMMAND_EXIT_NONZERO",
      "message": "Build command failed with exit code 1"
    },
    "since": "2026-10-01T10:30:00Z",
    "source": "turn.failed"
  },
  "currentActivity": null,
  "finalAnswer": null,
  "terminalOutcome": {
    "outcome": "failed",
    "initiator": "agent",
    "error": {
      "code": "COMMAND_EXIT_NONZERO",
      "message": "Build command failed with exit code 1"
    },
    "completedAt": "2026-10-01T10:30:00Z"
  }
}
```

```text
! Turn failed
  Build command failed with exit code 1.                    [Inspect work]
```

Do not infer Task failure/completion/recovery policy from this alone.

### S12 — cancelled / interrupted

Fixture: session-conversation/interrupted

```json
{
  "status": {
    "status": "terminal",
    "outcome": "interrupted",
    "initiator": "runtime",
    "cause": "provider_process_lost",
    "since": "2026-10-01T10:40:00Z",
    "source": "turn.interrupted"
  },
  "terminalOutcome": {
    "outcome": "interrupted",
    "initiator": "runtime",
    "cause": "provider_process_lost",
    "completedAt": "2026-10-01T10:40:00Z"
  }
}
```

```text
Turn interrupted
Provider process ended before the Turn completed.             [Inspect]
```

### S13 — completed Turn

Fixture: session-conversation/completed

```json
{
  "status": {
    "status": "terminal",
    "outcome": "completed",
    "initiator": "agent",
    "since": "2026-10-01T10:50:00Z",
    "source": "turn.completed"
  },
  "currentActivity": null,
  "finalAnswer": {
    "id": "answer-12",
    "text": "Review completed. The implementation matches the current specification.",
    "status": "completed",
    "createdAt": "2026-10-01T10:49:00Z",
    "updatedAt": "2026-10-01T10:50:00Z",
    "completedAt": "2026-10-01T10:50:00Z"
  }
}
```

```text
Review completed. The implementation matches the current specification.
```

No redundant Completed success Card.

### S14 — reconnecting

Fixture: session-conversation/reconnecting

Canonical Session payload remains last-known data; transport state is separate:

```json
{
  "transport": {
    "status": "reconnecting",
    "lastAppliedSeq": 418
  }
}
```

```text
Review completed...

────────────────────────────────────────────────────────────
Reconnecting…                                                [Retry]
```

Do not rewrite canonical Turn as unknown solely because transport reconnects.

### S15 — scrolled away from latest

Fixture: session-conversation/new-activity-while-scrolled

```json
{
  "scroll": {
    "followingLatest": false,
    "unseenMeaningfulItems": 4
  }
}
```

```text
[older conversation currently visible]

                         [4 new updates · Jump to latest ↓]
```

No forced jump.

## 12. Compact versus Full Session

Floating Session uses the same presentation semantics but less history.

### Floating Session

Show:

- recent user/assistant content;
- meaningful recent Commentary;
- one-line collapsed Work activity by default;
- bounded expanded Work activity on demand;
- current activity;
- pending interaction;
- composer;
- Open full session.

Hide:

- older Work history;
- Work L2 root;
- raw technical detail;
- large Context sections.

### Full Session

Show the same conversation semantics with bounded recent history, older-history loading, default
Context on split-capable entry, and user-driven detail navigation. Expanded Work is opened from
conversation activity when the user asks to inspect it; it is not a required permanent sibling root.

Do not create separate visual semantics for the same Turn just because it is floating.

## 13. Data update contract

Inherits
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md).

Session-specific requirements:

- process events in canonical sequence;
- coalesce ordinary streaming updates into one cache/render commit per small window;
- flush interactions/terminal/readiness/cancellation/execution-scope changes immediately;
- never debounce by dropping Work events;
- no duplicate Full/Floating Session subscriptions for the same Session when a shared cache layer can
  serve both;
- current activity updates and streaming Commentary should not fight over two independent stores.

## 14. Visual/token contract

Use shared semantic roles.

Recommended hierarchy:

- user message text: primary content;
- assistant final answer: primary content;
- Commentary: secondary content;
- Work summary: muted/secondary compact text;
- current activity: secondary + running indicator;
- waiting: muted;
- attention interaction: semantic attention;
- failed terminal outcome: semantic error;
- interrupted/cancelled: neutral/warning depending meaning;
- code/command/path: monospace/code role.

Avoid provider-specific colors.

## 15. Containment rules

- user bubble may use one restrained message surface;
- assistant answer is borderless by default;
- Commentary is borderless;
- Work summary is borderless;
- current activity is borderless;
- pending interaction may use one contained action surface;
- terminal error may use one contained alert only when current/actionable;
- no Card around each Turn;
- no Card inside interaction surface for each option/action;
- composer has its own control boundary and does not need an outer Card.

## 16. Storybook/Figma acceptance matrix

Required fixtures:

```text
session-conversation/waiting-for-model
session-conversation/streaming-commentary
session-conversation/active-tool
session-conversation/mixed-work
session-conversation/multiple-active-tools
session-conversation/permission
session-conversation/question
session-conversation/confirmation
session-conversation/tool-failed-turn-active
session-conversation/turn-failed
session-conversation/interrupted
session-conversation/completed
session-conversation/reconnecting
session-conversation/new-activity-while-scrolled
```

Each story should display or document the exact input payload so Figma/review can compare state to
rendering without guessing.

## 17. Acceptance criteria

1. Conversation remains readable when Commentary and tools alternate many times.
2. Tool spam is compressed without hiding exceptional failures.
3. Distinct Commentary is preserved and visually reads as prose, not as a technical event row.
4. Normal Work activity can collapse to one line and expand into a bounded 5–7-line ScrollArea.
5. Active tool is not duplicated as historical work.
6. Failed Tool is not presented as failed Turn.
7. Pending interaction is unmistakably actionable.
8. Waiting state remains calm.
9. Completed Turn does not produce redundant success chrome.
10. Scroll does not jump when the user is reading older history.
11. Full and Floating Session use the same semantic rendering rules.
12. Every Storybook/Figma state has a canonical payload fixture.
13. Conversation/inline Work does not become an icon-heavy Timeline or a stack of Cards.
