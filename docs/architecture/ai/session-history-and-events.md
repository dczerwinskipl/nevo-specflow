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

- Snapshot limit is fixed: up to the latest 40 conversation entries, <=256 KiB UTF-8 JSON overall, no full content chunks or complete Turn hydration.
- Entry previews include references when shortened.
- One indexed lookahead establishes hasOlder, not an exact count.

- The byte budget includes JSON escapes, metadata and the signed cursor.
- If the indexed count-bounded window exceeds it, return a smaller contiguous newest window and set the cursor immediately before its oldest returned item.
- Do not skip excluded entries or scan older rows to fill the page.
- Work and ToolAction pages use the same count-and-byte policy.

### Signed cursors and authorization

- Start history with Snapshot.history.before; subsequent pages use returned before. before is present iff hasOlder.
- A normal empty result means confirmed end.
- No unbounded scan to fill a page.
- History tokens encode signed {version, storeGeneration, projectId, sessionId, actorKey, collection, upperOrdinal, expiresAt}, with 24-hour expiry.
- Work/actions add parent ID and use their own collection order.
- The HMAC key persists in ignored local state; restart does not expire otherwise valid tokens.
- Verify the token and current authorization every request.
- Tokens are not access grants.
- Changing policy is enforced by current Auth, not a policy object identity stored in the token.

### Page order and consistency

- upperOrdinal is exclusive: query earlier entries by indexed range, return up to limit then reverse to ascending display order.
- Tokens pin older membership/order; item content may be more recent than the initial snapshot. revision comparison prevents stale pages overwriting live state.
- A page boundary may split a Turn; clients group by turnId without inventing another Turn.

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
- **Readers:** use the latest digest-bearing summary. Detached readers refresh through snapshot, resync or `conversation` changes and must not add counts themselves.

#### Provider classification

- Classification comes only from the provider's own tool identity on the driver's `action-open` fact (`operation`, see [driver protocol](../../reference/protocols/session-provider-driver.md)); it is never inferred from command text, arguments or titles, and an unmapped identity is `other`.
- `test` and `web` are used only when a provider's native tool itself identifies a test run or a web access; no currently supported provider maps one (the Codex `webSearch` item is `other`, see below).

#### Adapter-specific coverage

- The digest counts only ToolActions Runtime admitted; it is not a full count of every native tool a provider has.
- Claude web tools (`WebFetch`, `WebSearch`) are unreachable only because the adapter restricts Claude with `--tools` to the inventory above; widening that list requires a mapping in the same change.
- Codex `mcpToolCall` and `webSearch` ThreadItems each open one tool Work with one ToolAction classified `other` (owner decision; `web` is not inferred for a native web search), so the digest counts them and the Turn keeps running.
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

- Initial sequence: first GET Snapshot, then GET events?after=Snapshot.eventSeq.
- Event IDs equal canonical eventSeq.
- Use Last-Event-ID when query after is absent; conflicting values are 400 SESSION_CURSOR_INVALID. after in the future is invalid.
- No after/header means start after a current transaction boundary, never full replay from the beginning.

### Event envelope

- Each frame: id: <eventSeq>, event: session-change, data: JSON envelope: {sessionId, eventSeq, kind, changes}. kind is one of session, turn, conversation, work, interaction. changes carries bounded upserts/references for that kind, using the shapes above, and the current Session/activeTurn/currentActivity/interaction projection as needed.
- The changes object is discriminated by kind:

- session: {projection: LiveProjection} (a rename/archive/unarchive carries the current activeTurn,
  so Turn-dependent capabilities such as Cancel stay correct);
- turn: {turn: TurnSummary, projection: LiveProjection};
- conversation: {entries: ConversationEntry[], projection?: LiveProjection}, at most 8 entries;
- work: {turnId, items: WorkSummary[], projection?: LiveProjection}, at most 8 items;
- interaction: {projection: LiveProjection}.

### Projection and invalidation updates

- A live projection replaces the current small Session projection at its event sequence; it is not merged partially with an older snapshot.
- Exact event bodies and fields are described in [OpenAPI](../../reference/api/openapi.md).
- ToolAction changes emit work invalidation as a WorkSummary with its incremented revision; an open action inspector refreshes the affected bounded page.
- No raw action output in events.
- Terminal Turn update supplies its summary/outcome and a cleared activeTurn projection.

### Revision, presence and payload bounds

- Each upsert has canonical ID/revision.
- Removal of the current interaction is explicit {interaction:null}; omission means unchanged in events.
- Ordinary JSON read optionality is unchanged.
- An event frame is <=64 KiB.
- Large text updates reference content; clients read the visible portion on demand.
- Event segmentation is done before committing each canonical update, never by emitting two different frames with the same eventSeq.

### Durable replay and backpressure

- Persist event before broadcast.
- Replay batches <=100 frames and <=256 KiB, yield between batches.
- Subscriber queue <=256 KiB; on overflow emit unnumbered resync-required if possible, then close.
- A pruned gap emits unnumbered resync-required and closes.
- Never jump an event ID silently.
- Client deduplicates eventSeq, detects gaps and fetches a new bounded Snapshot.
- It merges already loaded older pages by ID/revision, keeping history; it does not reload the transcript.

### Heartbeats, authentication and lifecycle

- Heartbeat comments every 15 seconds do not advance eventSeq.
- Disconnect cleans the subscriber only.
- Committed outbox changes wake live subscribers.
- Idle streams revalidate authentication/policy at most one second apart without polling the outbox; no change is broadcast before its transaction commits.
- Close authorization/lifecycle resources on shutdown.
- Concurrent bootstrap/replay/broadcast must not lose the first event after the snapshot; test with an update in each handoff window.
