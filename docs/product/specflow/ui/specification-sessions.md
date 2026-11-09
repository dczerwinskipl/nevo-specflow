---
id: product.specflow.ui.specification-sessions
type: product
title: Specification Sessions list
status: current
scope: specflow
areas: [ui, ai]
tags: [sessions, session-list, paging, archive, associations, continue-session]
read_when:
  - changing the Sessions list of a Specification at /specs/:specId/sessions
  - changing its rows, Current/Archive collections, Show more paging, states or freshness
  - changing a Session row shared with Continue session (provider mark, agent fact, status)
summary: >
  The implemented Sessions list of one Specification: rows of its associated Sessions from the
  paged Session list read, the shared Session row (provider mark, age, agent, Task count, effective
  readiness status), Current/Archive collections, explicit Show more paging that tolerates short and
  empty pages, states, New session gating and refresh-on-action freshness.
related:
  - product.specflow.ui.full-session
  - product.specflow.ui.specification-overview
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
  - reference.api.sessions
  - reference.api.specification-workspace
---

# Specification Sessions list

`/specs/:specId/sessions` (page title **Sessions**, inside the Specification) lists every Session
associated with the Specification. It reads `GET /api/sessions?specId=`
([Sessions API, Session list](../../../reference/api/sessions.md#session-list)); the workspace read
only gates **New session**. The workspace Sessions section is the source of the navigator preview and
Continue session only; this screen never renders its rows. Standalone Sessions are listed nowhere in
the UI. Why the screen looks this way, and the alternatives rejected, are in the
[Session association UX decision record](../../../ideas/specflow-ui/session-association-ux/README.md).

## Toolbar

A row above the list holds the collection control and **New session**, which opens
`/specs/:specId/sessions/new`. **New session** shows once the workspace read is there and its
`actions.startSession` is available or has reason `no_provider`; it is omitted otherwise
([Full Session, Starting a Session](full-session.md#starting-a-session)).

## Rows

One `OperationalRow` per Session in an `InformationList`, newest created first (the list read's
order). The title opens `/sessions/:sessionId`. Rows show no ids; mode, effort and cost are not shown
(cost is per-Session telemetry no row fetches; mode and effort stay in the Session's Context).

| Slot    | Content                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| leading | The provider mark (`SessionProviderIcon`, Codex, Claude, Antigravity; any other provider gets the `chat` glyph). Decorative, so every row has a mark                    |
| primary | The Session title, else **Untitled session** (also used by the navigator preview and Continue session)                                                                  |
| facts   | In this order, each omitted when absent: relative `updatedAt`; the agent fact; the associated Task count (**1 task**, **3 tasks**), only when the association has Tasks |
| status  | The Session status below; nothing for a ready Session. No archived label under **Archive**                                                                              |

- **Agent fact.** Visible text: the model title, else the raw model id, else the provider title,
  else the provider id, capped at 16 rem with an ellipsis. Assistive technology reads **{provider},
  model {model}** (the provider alone without a model), so the provider shown only by the decorative
  mark is announced. Titles come from the Runtime (`providerTitle`, `modelTitle`); the UI never
  joins rows with `GET /api/session-providers`, so a viewer without the Create capability still sees
  them. The Task count's accessible text is **Associated with N tasks**.
- **Inline facts.** The facts flow as one `·`-separated line, age first, so ages line up whether or
  not a row has Tasks; an absent fact takes no space. A row at least 40 rem wide keeps the title on
  one line (ellipsis) and puts the status after the facts as the last inline item; a narrower row
  wraps the title and facts and puts the status on its own line. A line breaks between facts, never
  inside the age or the Task count, and never starts with a separator.
- **Mark placement.** The mark is centred on the whole row content (title, facts and, when wrapped,
  the status line) at every row height (`InformationList.Leading align="row-center"`). It does not
  capture clicks, so a click on it opens the Session like the rest of the row.

### Status: effective Session readiness only

The row status comes from the row's effective `readiness` alone (the single-Session read's provider
projection, applied by the list read). `activeTurn.state` adds no row state and Engine attempt facts
never colour a row ([AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)).

| `readiness`              | Status                           | Tone and icon                    |
| ------------------------ | -------------------------------- | -------------------------------- |
| `ready`                  | none                             | none                             |
| `busy`                   | **Active**                       | info, spinning `loader` icon     |
| `requiresAttention`      | **Requires attention**           | attention, `triangle-alert` icon |
| `authenticationRequired` | **{provider}: sign-in required** | muted, no icon                   |
| `unavailable`            | **Session state unknown**        | muted, no icon                   |

A sign-in is provider-wide and resolved in the provider's CLI, so it names the provider and stays
muted. Status is always text; colour and icon only repeat it.

### The same row elsewhere

- **Continue session** on the [Specification Overview](specification-overview.md#sections-and-order)
  renders the same row (mark, age, agent, Task count, status) from the workspace Sessions section's
  row fields.
- The **navigator preview** keeps its own row: an active/attention marker, only active and attention
  Sessions, no mark and no model; a Session needing a sign-in does not enter it.
- The Task screen's Sessions section lists Engine attempt executions, a different subject.

## Collections

A `SegmentedControl` (**Session collection**) with **Current** and **Archive** maps to
`archived=exclude` and `archived=only`. **Current** is the default, so archived Sessions are hidden
until the user switches. The choice is the search parameter `sessionCollection=archive`; its absence
means **Current** (`collection` already names the Specification's own collection). Switching
replaces the history entry.

## Paging

A secondary **Show more** button under the list loads the next rows; while it loads it reads
**Loading…** and is `aria-disabled`, and a second press is ignored. A page may hold fewer items than
requested, or none, while `nextCursor` is present
([Sessions API, Session list](../../../reference/api/sessions.md#session-list)):

- One load (the first load or one press) follows `nextCursor` until at least one row arrives or the
  cursor ends, at most 4 requests.
- **Rows arrived:** they are appended below without scrolling and a polite status says **Loaded N
  sessions**. Focus stays on the button, or moves to the first appended row when the list has ended
  and the button goes away.
- **4 requests, no rows, cursor remains:** the button stays with the muted line **No more sessions
  in this batch. You can keep looking.**, also announced.
- **No cursor:** the button disappears. When a press ends the list without new rows, focus moves to
  the page heading so it is not lost with the button. The empty state shows only with no rows **and**
  no cursor.
- **Failed request:** the loaded rows stay, the line **Couldn’t load more sessions.** appears (and is
  announced), and the button retries the same cursor.

Infinite scroll is not used: the end of the list stays reachable for keyboard users.

## States

| State          | Content                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loading        | list skeleton under the toolbar                                                                                                                                                   |
| empty, Current | **This specification has no sessions yet.** plus **New session** when offered                                                                                                     |
| empty, Archive | **No archived sessions**, no action                                                                                                                                               |
| failed         | attention alert **Couldn’t load sessions.** with **Retry**                                                                                                                        |
| 403            | attention status **You don’t have access to this specification’s sessions.**                                                                                                      |
| Sessions off   | the workspace reports `sessions_disabled` (or the list answers `SESSION_DISABLED`): **Sessions are turned off in this project.** alone, without collections; the list is not read |

A transient failure of a refetch keeps the rows already shown; a 403 or 404 drops them, since the
caller may no longer see them.

## Freshness

Refresh-on-action: after this UI's own Session create, rename, archive, unarchive or delete, the UI
resets both collections of the list to their first page (appended pages are dropped) and refetches
them together with the workspace read, whose `revision` does not cover Sessions. What the list shows
stays on screen until the first page is read again (no skeleton). Rows are not live.
