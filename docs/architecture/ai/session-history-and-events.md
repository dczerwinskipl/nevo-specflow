---
id: architecture.ai.session-history-and-events
type: architecture
title: Session history, content ranges, Work digest and live events
status: current
scope: specflow
areas: [ai, runtime, server, security]
tags: [sessions, history, cursor, work, sse, content]
read_when:
  - reviewing session history, content ranges, work digest and live events
summary: >-
  Bounded Session history and Work pages, signed durable cursors, UTF-8 content ranges, native tool classification and SSE resync guarantees.
related:
  - reference.api.sessions
  - architecture.ai.session-storage-and-lifecycle
  - reference.protocols.session-provider-driver
  - architecture.runtime.authorization
---

# Session history, content ranges, Work digest and live events

Session history, Work, content and event streaming use bounded reads and scoped
continuation. Their HTTP routes and schemas are in
[Session OpenAPI](../../reference/api/openapi.md).

## Bounded history and Work

### Snapshot bounds

- **Limit:** newest 40 conversation entries, at most 256 KiB of serialized UTF-8 JSON, including escapes, metadata and signed cursor. Never hydrate full Turns or content chunks.
- **Oversize:** return the newest contiguous subset, with a cursor before its oldest entry. Shortened previews reference content. Never scan or skip older entries to fill the page.
- **Continuation:** one indexed lookahead sets `hasOlder`, not a total count. Work and ToolAction pages follow the same bounded read policy.

### Signed cursors and authorization

- **Start:** use `Snapshot.history.before`; continue with each page's `before`, present exactly when `hasOlder`. An empty result without continuation confirms the end.
- **Signature:** HMAC cursor binds store generation, project, Session, actor, collection, exclusive pagination boundary and 24-hour expiry. Work/action cursors also bind their parent. Exact serialized field names are private storage details.
- **Durability:** the HMAC key persists in ignored local state; a restart does not invalidate an otherwise valid cursor.
- **Access:** verify token and current authorization on every request. Tokens grant no access; policy changes apply through Auth.

### Page order and consistency

- Read indexed entries earlier than exclusive `upperOrdinal`, then reverse to ascending display order.
- Cursor membership and ordering are pinned; item content can advance. Compare `revision` to prevent stale history overwriting live state.
- Pages may split Turns. Group by `turnId` without creating synthetic Turns.

### Work and ToolAction page authority

- Work and ToolAction pages use the same bounded, authorized continuation model.
- Work identity, kind and revision come from canonical Session state.
- Interaction status is visible in Work, but only the current Interaction projection determines whether an answer can be submitted.
- Work/action counts, when present, are maintained on writes, not reconstructed by reading a page.
- A ToolAction belongs to a tool Work item, and raw provider SDK objects are never exposed in the page.

### Work aggregate counts

- **Scope:** `WorkPage.counts` covers the whole Turn, independent of the page.
- **Updates:** Runtime maintains the Turn aggregate transactionally on Work open/state changes, including provider facts, interaction admission/delivery, Turn settlement and restart recovery. `actionCount` follows the same rule. Reads never scan Work.
- **Legacy:** omit `counts` for older Turns; do not backfill. UI hides the summary if absent and never derives it from `items.length`.
- **Ordering:** the highest `eventSeq` of a Turn's pages supplies the newest counts.

### Work digest

- **Scope:** count admitted ToolActions by operation, including actions failed during Turn settlement. Update the Turn digest transactionally on every ToolAction open/state change.
- **Publication:** the latest `work-summary` entry carries the digest. New tool Work starts with the current value; further changes increment its `revision` and emit one `conversation` change containing that entry.
- **History:** earlier summaries retain their recorded digest. No digest exists before the first ToolAction or for legacy Turns without it.

#### Provider classification

- Classification comes only from the provider's own tool identity on the driver's `action-open` fact (`operation`, see [driver protocol](../../reference/protocols/session-provider-driver.md)); it is never inferred from command text, arguments or titles, and an unmapped identity is `other`.
- `test` and `web` are used only when a provider's native tool itself identifies a test run or a web access; no currently supported provider maps one (the Codex `webSearch` item is `other`, see below).

#### Adapter-specific coverage

- The digest counts only ToolActions Runtime admitted; it is not a full count of every native tool a provider has.
- Claude web tools (`WebFetch`, `WebSearch`) are unreachable only because the adapter restricts Claude with `--tools` to the inventory above; widening that list requires a mapping in the same change.
- Codex `mcpToolCall` and `webSearch` ThreadItems each open one tool Work with one ToolAction classified `other` (native web search does not imply the `web` operation), so the digest counts them and the Turn keeps running.
- An MCP call's state follows its native status (`completed` or `failed`); a web search carries no native status and is `completed` when its item completes; either one still open when the Turn ends takes the Turn's terminal state (failed, cancelled or interrupted).
- Codex ThreadItem types outside the adapter's accepted inventory still fail the protocol.
- The Codex adapter configures no MCP servers and disables web search, and no approval or sandbox path changes for these items.

#### Detached readers

A reader outside the live stream may hold a stale digest: a new Work's first summary predates its first ToolAction. Only a revised `work-summary`, snapshot or resync updates it. Never increment the digest client-side.

#### Native identity mapping

| Provider    | Native identity                                                                       | Operation    |
| ----------- | ------------------------------------------------------------------------------------- | ------------ |
| Claude      | `Read`                                                                                | read         |
| Claude      | `Glob`, `Grep`                                                                        | search       |
| Claude      | `Edit` / `Write`                                                                      | edit / write |
| Claude      | `Bash`                                                                                | command      |
| Codex       | ThreadItem `commandExecution` (one action, parsed fragments ignored)                  | command      |
| Codex       | ThreadItem `fileChange` (one patch)                                                   | edit         |
| Antigravity | `view_file` / `list_dir`                                                              | read / list  |
| Antigravity | `find_by_name`, `grep_search`                                                         | search       |
| Antigravity | `write_to_file` / `replace_file_content`, `multi_replace_file_content`                | write / edit |
| Antigravity | `run_command`                                                                         | command      |
| any         | anything else (`call_mcp_tool`, undeclared names, mock scenarios without `operation`) | other        |

## Content ranges

### Request and offsets

- **Read:** `GET /api/sessions/{sessionId}/content/{contentId}` requires an immutable content `revision`.
- **Bounds:** `offset` defaults to 0; `limitBytes` defaults to and is capped at 64 KiB.
- **Unit:** offsets count UTF-8 bytes; out-of-range offsets and invalid character boundaries return `400`.

### Preview pagination

- `TextPreview.text` contains at most the first 2048 UTF-8 bytes, cut on a character boundary.
- Continue at the preview's UTF-8 byte length, **not 0**; append subsequent ranges.
- Return the longest complete UTF-8 prefix within the limit. Include `nextOffset` only while content remains.

### Revision retention and storage

- Keep referenced revisions for the entire Session lifetime, including growing text, until Session deletion.
- Store immutable chunks/prefixes and constant-size length/generation metadata for append-only revisions. Never recopy the growing chunk list or rehash all text per delta.
- Replacements allocate a new content generation, retaining referenced prefixes. Read only the requested range; compression is not required.

### Authorization

Check content, Turn and Work membership in the selected Session **before returning bytes**.

## Event stream

### Bootstrap and replay cursor

- **Start:** GET Snapshot, then subscribe with `events?after=Snapshot.eventSeq`. Frame IDs equal canonical `eventSeq`.
- **Resume:** absent query `after` uses `Last-Event-ID`. Conflicting values or an `after` in the future return `400 SESSION_CURSOR_INVALID`.
- **Without cursor:** begin at the current transaction boundary, never at the start of history.

### Event envelope

Each `session-change` frame has `id: <eventSeq>` and JSON `{sessionId, eventSeq, kind, changes}`. `changes` is discriminated by `kind`:

| `kind` | `changes` |
| --- | --- |
| `session` | `{projection: LiveProjection}`, including current `activeTurn` after rename/archive/unarchive |
| `turn` | `{turn: TurnSummary, projection: LiveProjection}` |
| `conversation` | `{entries: ConversationEntry[], projection?: LiveProjection}`; up to 8 entries |
| `work` | `{turnId, items: WorkSummary[], projection?: LiveProjection}`; up to 8 items |
| `interaction` | `{projection: LiveProjection}` |
| `telemetry` | `{telemetryRevision: SessionSequence}`; invalidates the separately authorized telemetry read, **not** its contents |

Only the current Session/Turn/activity/Interaction projection is sent where applicable. The authoritative union is `SessionChangeSchema` in `packages/specflow-contracts/src/sessions/model.ts`; the HTTP contract is generated in [OpenAPI](../../reference/api/openapi.md).

### Projection and invalidation updates

- Replace the small Session `LiveProjection` at its sequence; never partially merge an older snapshot. Exact shapes: [OpenAPI](../../reference/api/openapi.md).
- ToolAction changes invalidate Work through an incremented `WorkSummary.revision`. An open inspector rereads its bounded page. Events contain no raw action output.
- Terminal Turn events include summary/outcome and clear `activeTurn`.

### Revision, presence and payload bounds

- Upserts have canonical IDs/revisions. `{interaction:null}` removes the interaction; omission means unchanged. Optional fields in ordinary JSON reads are unaffected.
- One frame is at most 64 KiB. Large text changes reference on-demand content ranges.
- Segment updates **before committing** canonical state; never emit two frames with the same `eventSeq`.

### Durable replay and backpressure

- **Publish:** persist before broadcast. Replay up to 100 frames and 256 KiB per batch, yielding between batches.
- **Overflow/gaps:** subscriber queues hold up to 256 KiB. On overflow or pruned replay gaps, send unnumbered `resync-required` if possible, then close. Never skip event IDs silently.
- **Client:** deduplicate `eventSeq`. On gaps fetch a bounded Snapshot, merging already loaded pages by ID/revision without reloading the whole transcript.

### Heartbeats, authentication and lifecycle

- **Heartbeat:** comments every 15 seconds do not advance `eventSeq`. Disconnect releases only the subscriber.
- **Outbox:** committed changes wake subscribers; never broadcast before transaction commit.
- **Authorization:** idle streams revalidate authentication/policy at intervals no longer than one second, without polling the outbox.
- **Shutdown and races:** close authorization/lifecycle resources. Bootstrap, replay and broadcast must not lose the first event after Snapshot; test every handoff window.
