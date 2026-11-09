---
id: ideas.specflow-ui.components.session-work-inspector
type: product
title: Session Work inspector — open per-tool formatting
status: draft
scope: specflow
areas:
  - ui
  - ai
  - runtime
tags:
  - session
  - work
  - tools
  - tool-action
  - inspection
read_when:
  - adding tool kind, subject or normalized result facts to Work history or ToolAction detail
  - formatting a specific canonical tool kind
  - creating Storybook fixtures for tool execution
summary: >
  Open Work-inspection design beyond the implemented Full Session contract: per-tool-kind
  formatting and fixtures, nested ToolAction previews, normalized result counts, large-payload
  references and a per-operation Work digest in Work history. Needs Runtime tool kind/subject first.
related:
  - product.specflow.ui.full-session
  - ideas.specflow-ui.components
  - ideas.specflow-runtime.session-v10-backend-readiness
  - reference.api.sessions
  - architecture.ai.canonical-session-turn-work
---

# Session Work inspector — open per-tool formatting

The implemented Work history (L2) and ToolAction detail (L4) rules are in the
[Full Session contract](../../../product/specflow/ui/full-session.md#work-history-l2). This note keeps
the design that waits on richer Runtime tool facts.

## 1. Missing tool facts

Today's ToolAction carries title, state, input, output, error and timestamps only. The formatting
below needs, from the Runtime/adapter (never parsed from titles or output by the UI):

- the canonical tool **kind** (`read | edit | write | list | search | command | test | web | other`)
  and a human-readable **subject** per tool Work;
- **normalized result counts** (test passed/failed, search matches, listed items) — never inferred
  from raw stdout;
- exit code, closure reason and duration as typed fields;
- an additive **large-payload** shape (`preview`, `ref`, `truncated`) so big inputs/outputs load on
  demand instead of inline;
- canonical file/diff references.

## 2. Work digest in Work history

The Work block's per-operation breakdown comes from the Work digest. Work history's own counts row
shows only the Work aggregate (total, in progress, by Work kind) because the aggregate has no
per-operation breakdown of tool Work. Showing "48 reads · 24 writes · …" in Work history needs the
digest (or an equivalent aggregate) exposed for the Turn's Work page.

## 3. Per-tool formatting matrix

| Kind    | Compact Conversation     | L2 row         | L3 subject              | L4 primary detail                                                                       |
| ------- | ------------------------ | -------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| read    | Read file(s)             | Read file (N)  | file/path               | path, range if normalized, input/output; future file-open target when capability exists |
| edit    | Edited file(s)           | Edit file      | file/path               | target, ToolActions, diff/reference, raw payload                                        |
| write   | Wrote/created file(s)    | Write file     | file/path               | target, creation/write details, raw payload                                             |
| list    | Listed directory         | List directory | directory/path          | target path, options, returned items/raw output                                         |
| search  | Searched code/web/etc.   | Search         | query/subject           | query, scope, normalized matches if available                                           |
| command | Ran command              | Run command    | concise command subject | full command, cwd, exit code, output                                                    |
| test    | Ran tests / tests passed | Run tests      | suite/target            | command/suite, exit code, normalized results if available                               |
| web     | Fetched web content      | Web            | sanitized host/path     | URL/method/target, response metadata/output                                             |
| other   | Used tool                | tool title     | subject if supplied     | canonical metadata + raw input/output                                                   |

The labels above are presentation defaults. Canonical `title` supplied by Runtime may be more
specific and should normally win when truthful/human-readable.

## 4. Tool kind fixtures

Every kind needs at least completed + failure/exception coverage where the status is meaningful.

### T01 — read

Fixture: session-work/read-file

```json
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
```

L2:

```text
▣ Read file · packages/specflow/src/program.ts
```

L4:

```text
Read file
view_file · read · completed

packages/specflow/src/program.ts

Duration    182 ms

Input
{ "path": "packages/specflow/src/program.ts" }

Output
import { Command } from 'commander'; ...
```

Preserve a resolvable product file reference when available, but do not render an Open file action
until the file-preview capability exists. Once implemented, that action uses the same local
Secondary/detail slot. Do not expose absolute host paths as the preferred human target.

### T02 — edit

Fixture: session-work/edit-file

```json
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
```

L2:

```text
✎ Edit file · App.tsx
    Replace content · packages/nevo-ui/src/App.tsx
```

Tool with actions stays its own row; do not merge into neighboring edit groups.

L4 should prefer an Inspect change/diff reference when available; raw tool output is secondary.

### T03 — write

Fixture: session-work/write-file

```json
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
```

L2:

```text
＋ Write file · docs/ideas/new-doc.md
```

Distinguish edit/write semantically when Runtime knows the difference. UI must not infer "create" by
checking whether a path existed.

### T04 — list

Fixture: session-work/list-directory

```json
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
```

L2:

```text
☷ List directory · docs/ideas/specflow-ui
```

Do not show "3 items" unless Runtime provides a normalized count or the output is a safely typed
canonical list. Do not parse arbitrary provider text to obtain the count.

### T05 — search

Fixture: session-work/search

```json
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
```

L2:

```text
⌕ Search code · WORKSPACE_WRITER_BLOCKED_BY_RECOVERY
  tools/specs
```

L4:

- query prominent/monospace where useful;
- scope/path secondary;
- normalized result count only if supplied semantically;
- raw result text in output detail.

### T06 — command

Fixture: session-work/command-success

```json
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
```

L2:

```text
> Run command · pnpm check                                  8.4 s
```

L4:

```text
Run command
run_command · command · completed

pnpm check

Working directory
D:/repos/git/nevo-specflow

Exit code   0
Duration    8.4 s

Output
Checks passed.
```

Full command/cwd use code treatment.

If command contains secrets, redaction must happen before presentation.

#### Command failure

Fixture: session-work/command-failed

```json
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
```

L2:

```text
! Run command · pnpm test                                   failed
```

Failure remains one independent row and breaks grouping.

### T07 — test

Fixture: session-work/tests

```json
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
```

L2:

```text
✓ Run tests · specflow-runtime                              5.1 s
```

Do not infer structured "42 passed" from arbitrary output unless the adapter normalizes it. Raw text
may still appear in detail.

### T08 — web

Fixture: session-work/web

```json
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
```

L2:

```text
◎ Web · docs.example.com/api
    Fetch page · docs.example.com/api
```

URLs shown to the user must be sanitized; credentials/query secrets must never leak through a
display target.

### T09 — other

Fixture: session-work/other-tool

```json
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
```

L2:

```text
◇ Provider operation · Operation 17
```

Never invent a more specific semantic kind from provider-specific names.

## 5. ToolAction formatting

ToolActions remain nested under their ToolInvocation.

L2:

```text
✎ Edit workspace
    Edit · file-a.ts
    Edit · file-b.ts
    Write · file-c.ts
    +4 more
```

Rules:

- show up to about 3 child actions in compact L2;
- then show +N more;
- failed child action is always surfaced even if it exceeds the normal preview cap;
- mixed ToolAction kinds stay nested; do not create fake top-level Work chronology;
- selecting any child opens the parent ToolInvocation detail focused on that action when possible.

L3 shows the parent invocation as one canonical item.

L4 lists every action in seq order:

```text
ToolActions
1. completed  Edit     file-a.ts
2. completed  Edit     file-b.ts
3. failed     Execute  pnpm test
```
