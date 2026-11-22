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

Snapshot limit is fixed: up to the latest 40 conversation entries, <=256 KiB UTF-8 JSON overall, no full
content chunks or complete Turn hydration. Entry previews include references when shortened.
History default/max 40 entries, <=256 KiB overall. One indexed lookahead establishes hasOlder,
not an exact count. Response:

The byte budget includes JSON escapes, metadata and the signed cursor. If the indexed count-bounded
window exceeds it, return a smaller contiguous newest window and set the cursor immediately before
its oldest returned item. Do not skip excluded entries or scan older rows to fill the page. Work and
ToolAction pages use the same count-and-byte policy.

Start history with Snapshot.history.before; subsequent pages use returned before. before is present
iff hasOlder. A normal empty result means confirmed end. No unbounded scan to fill a page.
History tokens encode signed {version, storeGeneration, projectId, sessionId, actorKey,
collection, upperOrdinal, expiresAt}, with 24-hour expiry. Work/actions add parent ID and use their
own collection order. The HMAC key persists in ignored local state; restart does not expire otherwise
valid tokens. Verify the token and current authorization every request. Tokens are not access grants.
Changing policy is enforced by current Auth, not a policy object identity stored in the token.

upperOrdinal is exclusive: query earlier entries by indexed range, return up to limit then reverse
to ascending display order. Tokens pin older membership/order; item content may be more recent
than the initial snapshot. revision comparison prevents stale pages overwriting live state.
A page boundary may split a Turn; clients group by turnId without inventing another Turn.

Work and ToolAction pages use the same bounded, authorized continuation model.
Work identity, kind and revision come from canonical Session state. Interaction status
is visible in Work, but only the current Interaction projection determines whether an
answer can be submitted. Work/action counts, when present, are maintained on writes,
not reconstructed by reading a page. A ToolAction belongs to a tool Work item,
and raw provider SDK objects are never exposed in the page.

### Work aggregate counts

`WorkPage.counts` is the Turn-wide Work aggregate, independent of which page is returned:

Runtime keeps the aggregate in the Turn record and updates it in the same transaction as every Work
open and Work state change (provider facts, interaction admission and delivery, Turn settlement,
restart recovery), like `actionCount`; the `work` read projects it and never scans Work at read
time. `counts` is omitted for Turns recorded before Runtime maintained the aggregate; they are not
backfilled. The UI MUST hide its summary row when `counts` is absent and MUST NOT derive it from
`items.length`, which is only a bounded page. Among pages of the same Turn, the one with the higher
`eventSeq` carries the newer counts.

### Work digest

A digest tallies the Turn's ToolActions by operation:

Runtime maintains it in the Turn record in the same transaction as each ToolAction open and state
change, including actions that Turn settlement marks failed. The Turn's latest `work-summary`
entry carries the current digest: a new tool Work's entry starts with the digest at that moment,
and each later change revises that entry (`revision` increments) and emits one `conversation`
change with that single entry. An earlier `work-summary` entry keeps the digest it had while it
was the latest; clients use the Turn's latest entry that carries one. No digest is attached
before the Turn's first ToolAction, and none for Turns recorded before Runtime maintained it.

Classification comes only from the provider's own tool identity on the driver's `action-open`
fact (`operation`, see [driver protocol](../../reference/protocols/session-provider-driver.md)); it is never
inferred from command text, arguments or titles, and an unmapped identity is `other`. `test` and
`web` are used only when a provider's native tool itself identifies a test run or a web access;
no currently supported provider maps one (the Codex `webSearch` item is `other`, see below).

The digest counts only ToolActions Runtime admitted; it is not a full count of every native tool a
provider has. Claude web tools (`WebFetch`, `WebSearch`) are unreachable only because the adapter
restricts Claude with `--tools` to the inventory above; widening that list requires a mapping in
the same change. Codex `mcpToolCall` and `webSearch` ThreadItems each open one tool Work with one
ToolAction classified `other` (owner decision; `web` is not inferred for a native web search), so
the digest counts them and the Turn keeps running. An MCP call's state follows its native status
(`completed` or `failed`); a web search carries no native status and is `completed` when its item
completes; either one still open when the Turn ends takes the Turn's terminal state (failed,
cancelled or interrupted). Codex ThreadItem types outside the adapter's accepted inventory still
fail the protocol. The Codex
adapter configures no MCP servers and disables web search, and no approval or sandbox path changes
for these items.

A reader that is not following the live stream (a detached tab, or one that has loaded only
history pages) holds the digest from the last `work-summary` revision it received, which can be
behind the current one: for example, a new tool Work's entry is created with the digest before
that Work's first ToolAction and is revised only when that action opens. Such a reader catches up
on its next snapshot/resync or `conversation` change; it MUST NOT add its own counts to the digest.

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

revision is required and immutable. offset defaults 0; limitBytes defaults/max 64 KiB.
Offsets count UTF-8 bytes and must be valid character boundaries; invalid/out-of-range -> 400.
A conversation `TextPreview.text` is the UTF-8 byte prefix of its content (at most 2048 bytes, cut on a
character boundary), so a client continues with `offset` = the UTF-8 byte length of the preview text,
not 0, and appends the pages to the preview.
Return the longest valid UTF-8 prefix within the byte budget, nextOffset iff more remains.
Old referenced revisions are retained for the Session lifetime (until Session delete), including for actively growing
text; use immutable chunk references/prefix manifests rather than copying all prior text per delta.
Append-only text revisions can identify immutable published prefixes by length/generation with
constant-size revision metadata. Do not copy a growing chunk list or rehash the whole text on each
delta; edits/replacements allocate a new content generation while retaining referenced prefixes.
No compression is required for these limits to hold. Expanding text reads only that content range.
Auth verifies content/Turn/Work membership in the selected Session before returning any bytes.

## Event stream

Initial sequence: first GET Snapshot, then GET events?after=Snapshot.eventSeq.
Event IDs equal canonical eventSeq. Use Last-Event-ID when query after is absent; conflicting
values are 400 SESSION_CURSOR_INVALID. after in the future is invalid. No after/header means
start after a current transaction boundary, never full replay from the beginning.

Each frame: id: <eventSeq>, event: session-change, data: JSON envelope:
{sessionId, eventSeq, kind, changes}. kind is one of session, turn, conversation, work,
interaction. changes carries bounded upserts/references for that kind, using the shapes above,
and the current Session/activeTurn/currentActivity/interaction projection as needed.
The changes object is discriminated by kind:

- session: {projection: LiveProjection} (a rename/archive/unarchive carries the current activeTurn,
  so Turn-dependent capabilities such as Cancel stay correct);
- turn: {turn: TurnSummary, projection: LiveProjection};
- conversation: {entries: ConversationEntry[], projection?: LiveProjection}, at most 8 entries;
- work: {turnId, items: WorkSummary[], projection?: LiveProjection}, at most 8 items;
- interaction: {projection: LiveProjection}.

A live projection replaces the current small Session projection at its event sequence;
it is not merged partially with an older snapshot. Exact event bodies and fields
are described in [OpenAPI](../../reference/api/openapi.md).
ToolAction changes emit work invalidation as a WorkSummary with its incremented revision;
an open action inspector refreshes the affected bounded page. No raw action output in events.
Terminal Turn update supplies its summary/outcome and a cleared activeTurn projection.

Each upsert has canonical ID/revision. Removal of the current interaction is explicit
{interaction:null}; omission means unchanged in events. Ordinary JSON read optionality is unchanged.
An event frame is <=64 KiB. Large text updates reference content; clients read the visible portion
on demand. Event segmentation is done before committing each canonical update, never by emitting
two different frames with the same eventSeq.

Persist event before broadcast. Replay batches <=100 frames and <=256 KiB, yield between batches.
Subscriber queue <=256 KiB; on overflow emit unnumbered resync-required if possible, then close.
A pruned gap emits unnumbered resync-required and closes. Never jump an event ID silently.
Client deduplicates eventSeq, detects gaps and fetches a new bounded Snapshot. It merges already
loaded older pages by ID/revision, keeping history; it does not reload the transcript.
Heartbeat comments every 15 seconds do not advance eventSeq. Disconnect cleans the subscriber only.
Committed outbox changes wake live subscribers. Idle streams revalidate authentication/policy at
most one second apart without polling the outbox; no change is broadcast before its transaction commits.
Close authorization/lifecycle resources on shutdown. Concurrent bootstrap/replay/broadcast must
not lose the first event after the snapshot; test with an update in each handoff window.
