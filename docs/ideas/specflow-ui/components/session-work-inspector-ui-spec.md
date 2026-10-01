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
├── WorkTimelineProjection
├── WorkTimelineRow
│   ├── CommentaryRow
│   ├── ReasoningRow
│   ├── InteractionRow
│   └── ToolGroupRow
├── WorkItemDetail
└── ToolInvocationDetail
    └── ToolActionList
~~~

### Nevo UI primitives

Use generic Timeline only as a structural chronology primitive if its API fits.

Use Typography, MarkdownDocument, Collapsible, Button/IconButton, StatusIndicator, code/preformatted
surface, ScrollArea, and semantic tokens.

### Strong rule

**Conversation is not Timeline. Work inspector may use Timeline.**

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

## 5. L2 Work inspector layout

Default root:

~~~text
Work

Now
  ⟳ Run tests · workflow tests                    00:08

History
  • Checking the implementation…
  ▣ Read file (3)
  ⌕ Search code · WORKSPACE_WRITER_BLOCKED...
  ▣ Edit file · admission.mjs
  ! Run command · pnpm test                       failed
  • Retrying after the failed check…
  ✓ Run tests · workflow tests
  Interaction · resolved

(+18 older)                                      [Load older]
~~~

Now/current activity is separate from historical rows.

Do not put an active item into the grouped historical list with equal weight.

## 6. L2 grouping algorithm

### 6.1 Happy-path tool grouping

Group only when all are true:

- items are adjacent in canonical chronology;
- `type === "tool"`;
- `status === "completed"`;
- no ToolActions that need individual presentation;
- same canonical `kind`;
- same semantic `title`.

If subjects are equal, preserve subject.

If subjects differ, group but omit one misleading subject.

Example:

~~~text
Read file · service.mjs
Read file · routes.mjs
Read file · actions.mjs
~~~

becomes:

~~~text
Read file (3)
~~~

Do not display `service.mjs` as the group subject.

### 6.2 Boundaries

Grouping breaks on:

- Commentary;
- Reasoning;
- Interaction;
- any failed/cancelled/interrupted/unknown tool;
- active/queued tool;
- tool with compound actions;
- different kind/title.

### 6.3 Mixed kind tools

Unlike Conversation/L1, L2 does not merge read + search + command into one row.

L2 preserves semantic chronology:

~~~text
Read file (2)
Search code
Run command
~~~

Conversation may summarize the same burst as:

~~~text
Read 2 files · searched code · ran command
~~~

### 6.4 Repeated Commentary

Desired L2 behavior may compact **exact normalized repeated Commentary** and show ×N while L3 remains
complete.

Important legacy discrepancy:

- legacy comments/documentation describe conservative repeated-Commentary dedupe;
- the inspected legacy `buildTimelineRows` implementation currently pushes every Commentary row and
  does not actually implement that cross-tool dedupe.

Do not copy the stale comment as behavior. If repeated Commentary compaction is implemented in the new
product, add explicit tests for it.

### 6.5 Visible row cap

L2 should be bounded.

Legacy uses 8 visible rows as a useful precedent.

New product recommendation:

- default roughly 8–12 grouped rows;
- configurable, not API contract;
- newest rows visible;
- older hidden count/load affordance at top;
- never hide a current exceptional failure behind the cap.

## 7. L3 ungrouped Work history

L3 shows every canonical Work item in exact order.

Example:

~~~text
Work details

10:31:02  Commentary
           Checking admission...

10:31:04  Read file
           admission.mjs                         180 ms  ✓

10:31:05  Read file
           finish-operation.mjs                  170 ms  ✓

10:31:06  Search code
           WORKSPACE_WRITER_BLOCKED...           210 ms  ✓

10:31:09  Run command
           pnpm test                              8.1 s  ✕

10:31:18  Commentary
           Inspecting the failed assertion...
~~~

L3 rows may use Timeline.

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
| read | Read file(s) | Read file (N) | file/path | path, range if normalized, input/output, Open file |
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

packages/specflow/src/program.ts                         [Open file]

Duration    182 ms

Input
{ "path": "packages/specflow/src/program.ts" }

Output
import { Command } from 'commander'; ...
~~~

If a product file reference can be resolved, Open file uses File Secondary. Do not expose absolute
host paths as the preferred human target.

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

~~~text
• Checking the recovery path…
~~~

Text-first, one-line preview.

L3:
- full preview up to a few lines;
- select -> full Markdown/text detail.

### Reasoning L2

~~~text
◌ Thinking · Evaluating architecture boundaries…
~~~

Visually quieter/italic or otherwise secondary.

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
• Checking current implementation…
▣ Read file (2)
⌕ Search code · admission
◌ Thinking · Comparing workflow states…
▣ Read file · finish-operation.mjs
• The recovery branch is different…
! Run command · pnpm test                         failed
• Fixing the assertion and retrying…
✎ Edit file · readiness-policy.mjs
    Edit · readiness-policy.mjs
✓ Run tests · workflow tests
• Permission · resolved
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

1. L2 preserves chronology while reducing repetitive happy-path tools.
2. L3 can show every canonical item in original order.
3. L4 exposes every relevant ToolInvocation field without polluting L1/L2.
4. Every canonical tool kind has explicit formatting.
5. Failed/cancelled/interrupted tools never disappear into a success group.
6. Tools with ToolActions preserve parent/child semantics.
7. UI does not parse arbitrary raw output to invent semantic facts.
8. Large input/output does not force huge initial Session payload forever.
9. Active tool appears as Now/current activity, not duplicate history.
10. Work uses timeline/list semantics rather than Card-per-item.
11. Legacy repeated-Commentary implementation discrepancy is not accidentally copied.
