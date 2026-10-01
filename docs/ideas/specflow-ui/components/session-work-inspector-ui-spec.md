---
id: ideas.specflow-ui.components.session-work-inspector
type: product
title: Session Work inspector UI spec
status: draft
scope: specflow
areas:
  - ui
  - ai
  - runtime
tags:
  - session
  - work
  - timeline
  - tools
  - tool-action
  - inspection
read_when:
  - implementing Work L2/L3/L4
  - formatting canonical ToolInvocation and ToolAction payloads
  - creating Storybook/Figma fixtures for tool execution
summary: >
  Detailed presentation contract for Session Work inspection: grouped chronology, ungrouped Work,
  ToolAction drill-down, every canonical tool kind, statuses, payload-backed fixtures, grouping,
  large payload behavior, and component ownership.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.components.session-conversation
  - ideas.specflow-ui.screens.full-session
  - ideas.specflow-ui.data-loading-refresh-and-eventing
  - architecture.ai.canonical-session-turn-work
---

# Session Work inspector UI spec

## 1. Responsibility

Work inspection answers:

> What did the agent/runtime actually do?

It is intentionally more technical than the conversation.

The levels are:

~~~text
L1 Conversation
  compact semantic Work bursts

L2 Work inspector
  chronology-preserving grouped rows

L3 Work item
  one canonical Work item in detail

L4 ToolAction / raw payload
  deepest action/input/output inspection
~~~

Do not collapse these into one giant timeline with every detail always visible.

## 2. Component ownership

### Product-owned

~~~text
SessionWorkInspector
├── WorkActivityDisclosure          compact collapsed/expanded block
├── WorkLogProjection               L2 grouped chapters
│   ├── CommentaryBlock
│   ├── ToolBurstRow
│   ├── ExceptionalToolRow
│   ├── ReasoningSummaryRow
│   └── InteractionHistoryRow
├── WorkHistory                     L3 exact chronology
├── WorkItemDetail
└── ToolInvocationDetail
    └── ToolActionList
~~~

### Nevo UI primitives

Use Typography, MarkdownDocument, Collapsible, Button/IconButton, StatusIndicator,
code/preformatted surface, ScrollArea, and semantic tokens.

### Strong rule

**Conversation is not Timeline. L2 Work log is also not a generic Timeline by default.**

L2 must preserve Commentary as readable prose and visually group the tool burst that follows it.
A permanent rail + icon on every row makes Commentary look like another technical event and adds too
much chrome.

Generic Timeline is appropriate at L3, where the user explicitly asks for the exact chronological
inspection list.

Tool/domain semantics stay in SpecFlow code.

## 3. Canonical tool payload

Current canonical legacy evidence:

~~~text
ToolInvocationWorkItem
  id
  seq
  type: tool
  toolName
  kind
  title
  status
  actions[]
  subject?
  description?
  input?
  output?
  exitCode?
  durationMs?
  startedAt?
  completedAt?
  closureReason?
  progress?
  confidence?
  createdAt
  updatedAt
~~~

Canonical tool kinds:

~~~text
read
edit
write
list
search
command
test
web
other
~~~

Canonical ToolAction:

~~~text
id
seq
kind: read | write | edit | search | list | execute | fetch | other
title
description?
target?
status?: active | completed | failed
startedAt?
completedAt?
~~~

The UI must not infer tool kind from toolName strings.

## 4. API / field availability

New SpecFlow Runtime product API: **missing**.

Legacy Session payload: **legacy-available**, including ToolInvocation/ToolAction fields above.

Important field gaps for a production inspector:

- large input/output are currently inline arbitrary values;
- no canonical payload truncation flag/reference exists yet;
- no generic normalized result-count/test-count/search-match fields exist;
- file/diff references are not uniformly canonicalized.

### Proposed additive extension for large payloads

Do not block the first migration on this, but the new Runtime API SHOULD support externalizing large
technical payloads without changing tool semantics.

Illustrative additive shape:

~~~text
tool.detail {
  input: {
    inline?,
    preview?,
    ref?,
    truncated?
  },
  output: {
    inline?,
    preview?,
    ref?,
    truncated?
  }
}
~~~

Existing small `input`/`output` may remain inline for compatibility.

The UI must never parse arbitrary output text to invent semantic facts such as test counts or search
match counts. Those need normalized fields from the adapter/application if the product wants to show
them as facts.

## 5. Compact Work activity and L2 Work log

### 5.1 Chronology direction

All Work presentations follow the same reading direction as chat:

~~~text
oldest
  ↓
newest / current
~~~

The newest/current activity is at the bottom.

Loading older history prepends content at the top while preserving scroll position.

Never reverse Work chronology merely because "latest first" is convenient for data arrays.

### 5.2 Collapsed Work activity

The normal Session view needs a one-line compact state.

Example:

~~~text
Working · 1 read · 2 searches · 4 commands                     [Expand]
~~~

When there is a single useful current action:

~~~text
Running tests · specflow-runtime                               [Expand]
~~~

When exceptional work exists:

~~~text
Working · 6 actions · 1 failed                                 [Expand]
~~~

Rules:

- one line whenever practical;
- describe the current/recent semantic work, not raw provider state;
- no per-tool icons;
- one running/attention marker at most;
- clicking expands the bounded Work activity view;
- collapsed text is product-owned projection from canonical Work/currentActivity.

### 5.3 Expanded bounded Work activity

Expanded Work inside the Session should stay compact.

Target visible height: approximately **5–7 compact rows/lines** before scrolling.

Use Nevo UI \`ScrollArea\` with its edge indicators so the user can perceive that more Work exists
above/below.

Do not expand the page by dozens of tool rows.

Example:

~~~text
┌──────────────────────────────────────────────────────────────┐
│ Checking the admission path…                                │
│   1 read · 2 searches · 4 commands                          │
│                                                              │
│ Verifying the recovery behavior…                            │
│   2 reads · tests passed                                    │
│                                                              │
│ ⟳ Executing command · pnpm test                             │
└──────────────────────────────────────────────────────────────┘
                          scrolls when history exceeds the cap
~~~

The block may expose an explicit **Open Work** action to move to the full L2 inspector.

### 5.4 Full L2 Work log

L2 is a grouped, chronology-preserving **work log**, not an icon-heavy timeline.

Visual model:

~~~text
Work

Checking the implementation and locating the admission path…
  1 read · 2 searches · 4 commands                            >

The persisted recovery state is handled elsewhere. Verifying that branch…
  2 reads · 1 command · tests passed                          >

One test failed; checking the assertion before retrying…
  ! Command failed · pnpm test                                >
  1 edit · tests passed                                       >

⟳ Executing command · pnpm check
~~~

Commentary is visually the narrative separator.

Tool activity belonging to the interval after a Commentary item appears beneath that Commentary as
one or more compact grouped rows.

A Turn that starts with tools before any Commentary may begin with a tool burst directly.

Reasoning that is not user-facing still acts as a semantic grouping boundary but does not become a
large prose block.

### 5.5 Older history

L2 remains bounded/paged.

Older content loads at the **top**:

~~~text
[Load older Work]

older commentary...
  older tool burst...

newer commentary...
  newer tool burst...

⟳ current activity
~~~

Loading older content must preserve the user's current viewport anchor.

## 6. L2 grouping algorithm

### 6.1 Tool bursts and chapter grouping

First partition ordered Work into semantic chapters.

A Commentary item starts a narrative chapter. The adjacent tool sequence after it belongs visually
under that Commentary until another semantic boundary appears.

Inside one adjacent happy-path tool sequence, summarize by canonical kind while preserving the order
of the first occurrence of each kind.

Example:

~~~text
commentary
read
search
search
command
command
command
command
~~~

renders:

~~~text
Commentary text…
  1 read · 2 searches · 4 commands
~~~

If the sequence is long, L2 may use one compact aggregate row. L3 retains every item.

For a homogeneous same-kind group, a more specific row is allowed:

~~~text
Read 3 files
~~~

Do not display one arbitrary subject such as `service.mjs` as the group subject when the grouped
items target different resources.

### 6.2 Boundaries

Grouping/chapter boundaries break on:

- Commentary;
- Reasoning;
- Interaction;
- any failed/cancelled/interrupted/unknown tool;
- active/queued tool;
- tool with compound actions that needs its own presentation.

Different happy-path tool kinds/titles do **not** automatically break one compact L2 burst; section
6.3 defines when mixed kinds may collapse into one aggregate. L3 preserves the exact item order and
individual title.

### 6.3 Mixed kind tools

L2 **may merge adjacent happy-path mixed kinds into one compact burst row** when their individual
order is not decision-relevant.

Preferred compact form:

~~~text
1 read · 2 searches · 4 commands
~~~

Use separate rows when:

- one tool is failed/cancelled/interrupted/unknown;
- a tool has important ToolActions;
- a tool subject/result is independently useful;
- preserving relative order is important to understand what happened.

L3 always preserves exact item order.

### 6.4 Info/warning semantics

Canonical Tool status currently has no generic `info` or `warning` status.

Therefore:

- do not parse output text to invent warning/info counts;
- failed/cancelled/interrupted remain explicit canonical exceptional states;
- a future normalized diagnostic severity may be shown in a burst only after Runtime/application
  provides it semantically;
- provider-specific strings such as "warning" inside raw stdout remain technical detail unless an
  adapter normalizes them.

### 6.5 Repeated Commentary

Desired L2 behavior may compact **exact normalized repeated Commentary** and show ×N while L3 remains
complete.

Important legacy discrepancy:

- legacy comments/documentation describe conservative repeated-Commentary dedupe;
- the inspected legacy `buildTimelineRows` implementation currently pushes every Commentary row and
  does not actually implement that cross-tool dedupe.

Do not copy the stale comment as behavior. If repeated Commentary compaction is implemented in the new
product, add explicit tests for it.

### 6.6 Visible row cap

Inline expanded Work activity should show roughly **5–7 compact lines/rows** before ScrollArea
scrolling.

The dedicated L2 Work inspector may show roughly **8–12 grouped rows/chapters** in its initial
window, then load older content above.

These are presentation defaults, not API constants.

Always keep current activity/newest history at the bottom. Never hide a current exceptional failure
behind the cap.

## 7. L3 ungrouped Work history

L3 shows every canonical Work item in exact order, oldest at the top and newest at the bottom.

This is the first level where generic Timeline is a strong default because exact event chronology is
the point of the surface.

Commentary still uses a wider/text-first row so it does not visually collapse into the same icon/text
density as a tool.

Example:

~~~text
Work details

10:31:02
Checking admission and recovery state…

           Read file · admission.mjs                    180 ms  ✓
           Read file · finish-operation.mjs             170 ms  ✓
           Search code · WORKSPACE_WRITER_BLOCKED...    210 ms  ✓
           Run command · pnpm test                      8.1 s   ✕

10:31:18
Inspecting the failed assertion before retrying…

           Edit file · readiness-policy.mjs             90 ms   ✓
           Run tests · workflow tests                   5.1 s   ✓
~~~

L3 may use Timeline for the technical rows/rail, but Commentary should visually span/read as prose
between tool groups instead of becoming another tiny icon row.

Do not use a Card per Work item.

Each row is selectable -> L4/detail.

## 8. Tool status presentation

| Status | L2/L3 treatment | Notes |
| --- | --- | --- |
| queued | current/Now only, quiet spinner/queued label | Normally not historical. |
| active | current/Now, running indicator | Do not duplicate in history. |
| completed | neutral/success check only if useful | Avoid green success boxes. |
| failed | semantic error marker + separate row | Never aggregate into successful group. |
| cancelled | neutral interrupted/cancelled marker | Cause in detail. |
| interrupted | neutral/warning marker | Not automatically user fault. |
| unknown | explicit unknown state | Never pretend completed. |

### Status fixture payloads

Use one canonical command fixture and vary only canonical status fields so visual review isolates the
status treatment.

Queued:

~~~json
{
  "type": "tool",
  "kind": "command",
  "title": "Run command",
  "subject": "pnpm test",
  "status": "queued",
  "startedAt": null,
  "completedAt": null
}
~~~

Active:

~~~json
{
  "type": "tool",
  "kind": "command",
  "title": "Run command",
  "subject": "pnpm test",
  "status": "active",
  "startedAt": "2026-10-01T10:00:00Z",
  "completedAt": null
}
~~~

Completed:

~~~json
{
  "type": "tool",
  "kind": "command",
  "title": "Run command",
  "subject": "pnpm test",
  "status": "completed",
  "exitCode": 0,
  "startedAt": "2026-10-01T10:00:00Z",
  "completedAt": "2026-10-01T10:00:05Z"
}
~~~

Failed:

~~~json
{
  "type": "tool",
  "kind": "command",
  "title": "Run command",
  "subject": "pnpm test",
  "status": "failed",
  "exitCode": 1,
  "closureReason": "process_exit",
  "startedAt": "2026-10-01T10:00:00Z",
  "completedAt": "2026-10-01T10:00:05Z"
}
~~~

Cancelled/interrupted/unknown use the same identity with their respective canonical status and
closureReason when available. Do not manufacture exit codes for states that do not provide one.

## 9. L4 common ToolInvocation detail

All tool kinds share a common metadata header:

~~~text
Tool title
toolName · kind · status

Subject / human-readable target

Started
Completed
Duration
Exit code                 when applicable
Closure reason            when applicable
Provider/tool technical id only in deeper metadata

ToolActions               when present
Input                     collapsible/raw
Output                    collapsible/raw
~~~

### Raw input/output rules

- monospace;
- preserve whitespace;
- horizontally/vertically scrollable;
- bounded initial height;
- Copy action;
- safe redaction before UI;
- large payload uses preview + Load full/detail reference;
- never render raw JSON as normal body typography;
- never place raw input/output in conversation/L1.

## 10. Per-tool formatting matrix

| Kind | Compact Conversation | L2 row | L3 subject | L4 primary detail |
| --- | --- | --- | --- | --- |
| read | Read file(s) | Read file (N) | file/path | path, range if normalized, input/output; future file-open target when capability exists |
| edit | Edited file(s) | Edit file | file/path | target, ToolActions, diff/reference, raw payload |
| write | Wrote/created file(s) | Write file | file/path | target, creation/write details, raw payload |
| list | Listed directory | List directory | directory/path | target path, options, returned items/raw output |
| search | Searched code/web/etc. | Search | query/subject | query, scope, normalized matches if available |
| command | Ran command | Run command | concise command subject | full command, cwd, exit code, output |
| test | Ran tests / tests passed | Run tests | suite/target | command/suite, exit code, normalized results if available |
| web | Fetched web content | Web | sanitized host/path | URL/method/target, response metadata/output |
| other | Used tool | tool title | subject if supplied | canonical metadata + raw input/output |

The labels above are presentation defaults. Canonical `title` supplied by Runtime may be more
specific and should normally win when truthful/human-readable.

## 11. Tool kind fixtures

Every kind needs at least completed + failure/exception coverage where the status is meaningful.

### T01 — read

Fixture: session-work/read-file

~~~json
{
  "id": "read-1",
  "seq": 10,
  "type": "tool",
  "toolName": "view_file",
  "kind": "read",
  "title": "Read file",
  "status": "completed",
  "actions": [],
  "subject": "packages/specflow/src/program.ts",
  "description": "packages/specflow/src/program.ts",
  "input": {
    "path": "packages/specflow/src/program.ts"
  },
  "output": "import { Command } from 'commander'; ...",
  "durationMs": 182,
  "startedAt": "2026-10-01T10:00:00Z",
  "completedAt": "2026-10-01T10:00:00.182Z",
  "createdAt": "2026-10-01T10:00:00Z",
  "updatedAt": "2026-10-01T10:00:00.182Z"
}
~~~

L2:

~~~text
▣ Read file · packages/specflow/src/program.ts
~~~

L4:

~~~text
Read file
view_file · read · completed

packages/specflow/src/program.ts

Duration    182 ms

Input
{ "path": "packages/specflow/src/program.ts" }

Output
import { Command } from 'commander'; ...
~~~

Preserve a resolvable product file reference when available, but do not render an Open file action
until the file-preview capability exists. Once implemented, that action uses the same local
Secondary/detail slot. Do not expose absolute host paths as the preferred human target.

### T02 — edit

Fixture: session-work/edit-file

~~~json
{
  "id": "edit-1",
  "seq": 11,
  "type": "tool",
  "toolName": "replace_file_content",
  "kind": "edit",
  "title": "Edit file",
  "status": "completed",
  "subject": "packages/nevo-ui/src/App.tsx",
  "actions": [
    {
      "id": "a1",
      "seq": 1,
      "kind": "edit",
      "title": "Replace content",
      "target": "packages/nevo-ui/src/App.tsx",
      "status": "completed"
    }
  ],
  "input": {
    "target": "packages/nevo-ui/src/App.tsx"
  },
  "output": "Replacement applied successfully.",
  "durationMs": 96,
  "createdAt": "2026-10-01T10:01:00Z",
  "updatedAt": "2026-10-01T10:01:00.096Z"
}
~~~

L2:

~~~text
✎ Edit file · App.tsx
    Replace content · packages/nevo-ui/src/App.tsx
~~~

Tool with actions stays its own row; do not merge into neighboring edit groups.

L4 should prefer an Inspect change/diff reference when available; raw tool output is secondary.

### T03 — write

Fixture: session-work/write-file

~~~json
{
  "id": "write-1",
  "seq": 12,
  "type": "tool",
  "toolName": "write_to_file",
  "kind": "write",
  "title": "Write file",
  "status": "completed",
  "subject": "docs/ideas/new-doc.md",
  "actions": [],
  "input": {
    "path": "docs/ideas/new-doc.md"
  },
  "output": "Created file successfully.",
  "createdAt": "2026-10-01T10:02:00Z",
  "updatedAt": "2026-10-01T10:02:01Z"
}
~~~

L2:

~~~text
＋ Write file · docs/ideas/new-doc.md
~~~

Distinguish edit/write semantically when Runtime knows the difference. UI must not infer "create" by
checking whether a path existed.

### T04 — list

Fixture: session-work/list-directory

~~~json
{
  "id": "list-1",
  "seq": 13,
  "type": "tool",
  "toolName": "list_directory",
  "kind": "list",
  "title": "List directory",
  "status": "completed",
  "subject": "docs/ideas/specflow-ui",
  "actions": [],
  "input": {
    "path": "docs/ideas/specflow-ui"
  },
  "output": ["README.md", "screens", "components"],
  "createdAt": "2026-10-01T10:03:00Z",
  "updatedAt": "2026-10-01T10:03:00.120Z"
}
~~~

L2:

~~~text
☷ List directory · docs/ideas/specflow-ui
~~~

Do not show "3 items" unless Runtime provides a normalized count or the output is a safely typed
canonical list. Do not parse arbitrary provider text to obtain the count.

### T05 — search

Fixture: session-work/search

~~~json
{
  "id": "search-1",
  "seq": 14,
  "type": "tool",
  "toolName": "grep_search",
  "kind": "search",
  "title": "Search code",
  "status": "completed",
  "subject": "WORKSPACE_WRITER_BLOCKED_BY_RECOVERY",
  "description": "Search in tools/specs",
  "actions": [],
  "input": {
    "query": "WORKSPACE_WRITER_BLOCKED_BY_RECOVERY",
    "path": "tools/specs"
  },
  "output": "Found matches in admission.mjs and readiness-policy.mjs",
  "createdAt": "2026-10-01T10:04:00Z",
  "updatedAt": "2026-10-01T10:04:00.220Z"
}
~~~

L2:

~~~text
⌕ Search code · WORKSPACE_WRITER_BLOCKED_BY_RECOVERY
  tools/specs
~~~

L4:
- query prominent/monospace where useful;
- scope/path secondary;
- normalized result count only if supplied semantically;
- raw result text in output detail.

### T06 — command

Fixture: session-work/command-success

~~~json
{
  "id": "cmd-1",
  "seq": 15,
  "type": "tool",
  "toolName": "run_command",
  "kind": "command",
  "title": "Run command",
  "status": "completed",
  "subject": "pnpm check",
  "description": "pnpm check",
  "actions": [],
  "input": {
    "command": "pnpm check",
    "cwd": "D:/repos/git/nevo-specflow"
  },
  "output": "Checks passed.",
  "exitCode": 0,
  "durationMs": 8420,
  "createdAt": "2026-10-01T10:05:00Z",
  "updatedAt": "2026-10-01T10:05:08.420Z"
}
~~~

L2:

~~~text
> Run command · pnpm check                                  8.4 s
~~~

L4:

~~~text
Run command
run_command · command · completed

pnpm check

Working directory
D:/repos/git/nevo-specflow

Exit code   0
Duration    8.4 s

Output
Checks passed.
~~~

Full command/cwd use code treatment.

If command contains secrets, redaction must happen before presentation.

#### Command failure

Fixture: session-work/command-failed

~~~json
{
  "id": "cmd-2",
  "seq": 16,
  "type": "tool",
  "toolName": "run_command",
  "kind": "command",
  "title": "Run command",
  "status": "failed",
  "subject": "pnpm test",
  "actions": [],
  "exitCode": 1,
  "closureReason": "process_exit",
  "output": "1 test failed.",
  "createdAt": "2026-10-01T10:06:00Z",
  "updatedAt": "2026-10-01T10:06:04Z"
}
~~~

L2:

~~~text
! Run command · pnpm test                                   failed
~~~

Failure remains one independent row and breaks grouping.

### T07 — test

Fixture: session-work/tests

~~~json
{
  "id": "test-1",
  "seq": 17,
  "type": "tool",
  "toolName": "run_tests",
  "kind": "test",
  "title": "Run tests",
  "status": "completed",
  "subject": "specflow-runtime",
  "actions": [],
  "input": {
    "command": "pnpm --filter @nevo/specflow-runtime test"
  },
  "output": "42 tests passed.",
  "exitCode": 0,
  "durationMs": 5120,
  "createdAt": "2026-10-01T10:07:00Z",
  "updatedAt": "2026-10-01T10:07:05.120Z"
}
~~~

L2:

~~~text
✓ Run tests · specflow-runtime                              5.1 s
~~~

Do not infer structured "42 passed" from arbitrary output unless the adapter normalizes it. Raw text
may still appear in detail.

### T08 — web

Fixture: session-work/web

~~~json
{
  "id": "web-1",
  "seq": 18,
  "type": "tool",
  "toolName": "web_fetch",
  "kind": "web",
  "title": "Web",
  "status": "completed",
  "subject": "docs.example.com/api",
  "actions": [
    {
      "id": "fetch-1",
      "seq": 1,
      "kind": "fetch",
      "title": "Fetch page",
      "target": "https://docs.example.com/api",
      "status": "completed"
    }
  ],
  "input": {
    "url": "https://docs.example.com/api"
  },
  "output": "200 OK",
  "createdAt": "2026-10-01T10:08:00Z",
  "updatedAt": "2026-10-01T10:08:00.440Z"
}
~~~

L2:

~~~text
◎ Web · docs.example.com/api
    Fetch page · docs.example.com/api
~~~

URLs shown to the user must be sanitized; credentials/query secrets must never leak through a
display target.

### T09 — other

Fixture: session-work/other-tool

~~~json
{
  "id": "other-1",
  "seq": 19,
  "type": "tool",
  "toolName": "provider_specific_operation",
  "kind": "other",
  "title": "Provider operation",
  "status": "completed",
  "subject": "Operation 17",
  "actions": [],
  "input": {
    "opaque": true
  },
  "output": {
    "ok": true
  },
  "createdAt": "2026-10-01T10:09:00Z",
  "updatedAt": "2026-10-01T10:09:01Z"
}
~~~

L2:

~~~text
◇ Provider operation · Operation 17
~~~

Never invent a more specific semantic kind from provider-specific names.

## 12. ToolAction formatting

ToolActions remain nested under their ToolInvocation.

L2:

~~~text
✎ Edit workspace
    Edit · file-a.ts
    Edit · file-b.ts
    Write · file-c.ts
    +4 more
~~~

Rules:

- show up to about 3 child actions in compact L2;
- then show +N more;
- failed child action is always surfaced even if it exceeds the normal preview cap;
- mixed ToolAction kinds stay nested; do not create fake top-level Work chronology;
- selecting any child opens the parent ToolInvocation detail focused on that action when possible.

L3 shows the parent invocation as one canonical item.

L4 lists every action in seq order:

~~~text
ToolActions
1. completed  Edit     file-a.ts
2. completed  Edit     file-b.ts
3. failed     Execute  pnpm test
~~~

## 13. Commentary / Reasoning / Interaction in Work

### Commentary L2

Commentary is a prose block that visually separates tool bursts.

~~~text
Checking the recovery path and the persisted operation state…

  2 reads · 1 search · 3 commands
~~~

It does not need a bullet/icon/rail marker in L2.

L3:
- prose-first row/block;
- timestamp may sit above/aside in muted metadata;
- full preview up to a few lines;
- select -> full Markdown/text detail.

### Reasoning L2

Reasoning and Commentary are **not the same canonical Work kind**.

Default L2 treatment:

~~~text
Thinking…
~~~

or omit historical Reasoning from the main L2 prose flow while preserving the grouping boundary and
offering it through technical inspection.

If a provider supplies a user-safe reasoning summary, it may appear as quiet supporting text, but
must remain visually distinct from Commentary.

Do not render raw reasoning as normal conversation.

### Interaction L2

Pending:

~~~text
! Permission · pending
~~~

Resolved:

~~~text
• Permission · resolved
~~~

Pending interaction remains actionable in Conversation Primary. Work inspector is historical/technical
context and should not duplicate the full response form.

## 14. Mixed-history example

Canonical:

~~~text
Commentary
Read
Read
Search
Reasoning
Read
Commentary
Command failed
Commentary
Edit with ToolActions
Test completed
Interaction resolved
~~~

L2:

~~~text
Checking current implementation…
  2 reads · 1 search

Thinking…

The recovery branch is different…
  1 read
  ! Command failed · pnpm test                              >

Fixing the assertion and retrying…
  1 edit · tests passed                                     >

Permission resolved
~~~

Note that:

- reads before Reasoning group;
- read after Reasoning does not join the earlier group;
- failed command is isolated;
- Commentary breaks groups;
- edit with child actions remains isolated;
- test remains its own semantic kind.

## 15. Data loading and event updates

Inherits
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md).

### Work history

- initial Session snapshot includes current/recent Work;
- older Work pages lazy-load;
- L2 projection is derived from canonical cached Work, not a separate server timeline format unless
  server-side pagination requires a compatible summary resource;
- L3/L4 detail must not refetch the whole Session when one item is selected.

### Raw payloads

If input/output are inline and already cached, opening detail is local.

If new Runtime externalizes large payloads:

~~~text
GET /api/sessions/:sessionId/work/:workId/detail
~~~

or an equivalent detail reference may load only the selected payload.

Several selected/visible large payloads may use bounded batch fetch, but never prefetch all raw outputs
for a Session.

### Realtime

Active tool progress updates current activity.

When the tool settles:
- canonical Turn event moves it into historical Work;
- L2 grouping recomputes for affected tail only where practical;
- do not rebuild/render thousands of old rows per progress tick.

## 16. Refresh

No independent global Work Refresh while Session live sync is healthy.

Work follows Session snapshot/reconnect.

A selected externalized raw detail MAY have local Retry if that one detail load fails.

Do not make Retry on one tool refetch every Turn.

## 17. Visual/token contract

- chronology rail/dividers: subtle border token;
- normal tool icon/text: muted/secondary;
- selected row hover: shared hover/selection treatment;
- active: running/accent semantic state;
- failed: semantic error;
- cancelled/interrupted: muted/warning based on meaning;
- Commentary: secondary text;
- Reasoning: quieter secondary text;
- raw input/output: neutral code surface;
- no provider-specific colours.

## 18. Containment rules

- timeline rows are not Cards;
- ToolAction child rows are not Cards;
- metadata definition list is borderless;
- raw code/output may use one bounded code surface;
- do not put Input Card inside Tool Card inside Work Sheet;
- Work inspector host already supplies containment.

## 19. Storybook/Figma matrix

Required:

~~~text
session-work/activity-collapsed
session-work/activity-expanded-bounded
session-work/work-log-commentary-chapters
session-work/l3-exact-timeline
session-work/read-file
session-work/read-files-grouped
session-work/edit-file
session-work/write-file
session-work/list-directory
session-work/search
session-work/command-success
session-work/command-failed
session-work/tests
session-work/web
session-work/other-tool
session-work/tool-with-actions
session-work/commentary
session-work/reasoning
session-work/interaction-pending
session-work/interaction-resolved
session-work/mixed-history
session-work/long-history
session-work/large-output
session-work/active-now-plus-history
~~~

Each fixture includes canonical payload.

## 20. Acceptance criteria

1. L2 preserves chat-direction chronology: oldest at top, newest/current at bottom.
2. Commentary remains visually prose-first and separates tool bursts.
3. Collapsed Work can be represented in one line; inline expanded Work is bounded to roughly 5–7
   rows with ScrollArea/edge indicators.
4. L3 can show every canonical item in original order.
5. L4 exposes every relevant ToolInvocation field without polluting L1/L2.
6. Every canonical tool kind has explicit formatting.
7. Failed/cancelled/interrupted tools never disappear into a success group.
8. Tools with ToolActions preserve parent/child semantics.
9. UI does not parse arbitrary raw output to invent semantic facts.
10. Large input/output does not force huge initial Session payload forever.
11. Active tool appears as current activity at the bottom, not duplicate history.
12. L2 avoids an icon-heavy generic Timeline; L3 may use Timeline for exact chronology.
13. Work uses list/log semantics rather than Card-per-item.
14. Legacy repeated-Commentary implementation discrepancy is not accidentally copied.
