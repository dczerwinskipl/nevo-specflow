# Ad-hoc brief delivery and its conversation entry

## Goal

An ad-hoc write Turn sends the brief ahead of the owner's unchanged message and stores exactly what
it sent as a `brief` conversation entry, written with the dispatch intent (D7, C5, architecture.md
S5, S6).

## Scope

- Contracts `sessions/model.ts`: `ConversationEntrySchema.kind` gains `'brief'`, with an ordinary
  `TextPreview` text. `TurnSummary` does not change.
- Runtime `features/sessions/lifecycle/managed-invocation.ts`: the driver input is the brief from mint
  (Task `adhoc-brief-render`), a line `## Message from the owner`, then the owner's message unchanged.
  The `request` entry keeps the owner's text.
- Runtime `persistence/`: the `dispatch-intent` operation takes `brief?`. In the same transaction it
  appends the `brief` entry, records `StoredTurn.brief: { sha256, entryId }` and emits one
  `conversation` change. No store version is needed (entries are JSON).
- The owner's message keeps its 128 KiB limit. **Open check:** whether the providers' input limit
  allows that plus the brief. If it does not, the composed input is refused before dispatch
  (`PROVIDER_UNAVAILABLE`, not-dispatched), and the limit is documented.
- Docs: the ad-hoc brief, its delivery and its entry in `architecture.runtime.agent-step-execution`;
  the `brief` entry kind and its write with the dispatch intent in
  `architecture.ai.session-history-and-events` and `architecture.ai.canonical-session-turn-work`.

Out: the transcript rendering (Task `transcript-brief-part`).

## Verification

Runtime tests with a fake driver:

- the driver input is the brief, the separator line, then the message, in that order;
- the `request` entry holds only the owner's text;
- a dispatched ad-hoc Turn has one `brief` entry and a `StoredTurn.brief` whose digest matches it, and
  both are written in the dispatch-intent transaction;
- a Turn refused before dispatch intent has no `brief` entry;
- read-only and attempt Turns have none;
- a 16 KiB brief is paged through the existing entry content reads.

Acceptance A6 at the Runtime boundary: the ad-hoc Turn carries the brief, and no attempt is created.

## Planning notes

Work kind: backend. Recommended profile: `nevo-agents:implementer`.
