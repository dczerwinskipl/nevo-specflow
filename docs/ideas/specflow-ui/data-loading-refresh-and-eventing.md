---
id: ideas.specflow-ui.data-loading-refresh-and-eventing
type: product
title: SpecFlow UI data loading, refresh, batching, and eventing
status: draft
scope: specflow
areas:
  - ui
  - runtime
tags:
  - queries
  - caching
  - batching
  - sse
  - refresh
  - invalidation
  - performance
read_when:
  - exploring realtime event coalescing, cursors, or reconnect behavior
  - evaluating prefetch, batching-window, polling, cache-tuning, or observability ideas
  - preserving migration evidence for advanced data-delivery behavior not yet promoted
summary: >
  Non-authoritative exploration of advanced SpecFlow UI eventing, prefetch, batching-window,
  polling, cache-tuning, observability, and migration ideas beyond the canonical data/loading rules.
related:
  - ideas.specflow-ui.screens
  - architecture.runtime.ownership-and-lifecycle
  - architecture.ai.canonical-session-turn-work
---

# SpecFlow UI data loading, refresh, batching, and eventing

> Canonical approved rules for UX data requirements, integration readiness, loading, refresh,
> coherent read-model boundaries, and basic batching now live in
> `product.specflow.ui.data-loading-and-integration`. This ideas document remains non-authoritative
> exploration for deeper eventing, tuning, prefetch, batching-window, observability, and migration
> details that have not all been promoted.
>
> **Interpretation:** everything below is candidate design/evaluation material unless it explicitly
> references an authoritative current document. Words such as "should", "must", or "do not" describe
> the current proposal, not a normative repository requirement. Promote accepted rules to their
> canonical owner instead of treating this file as authority.

## 1. Goal

The UI should feel live without becoming network-chatty, internally inconsistent, or expensive to
render.

The core rule is:

> **Data that must be interpreted together should arrive and update together. Data that is
> independently expensive or independently stale should remain independently loadable.**

Do not solve consistency by fetching everything in one giant response.

Do not solve performance by splitting one semantic state into dozens of unrelated requests.

---

## 2. Event processing: batch rendering, not semantics

A burst of 300 provider/runtime events must not cause 300 independent React cache writes/renders.

But events also must not be "debounced" by dropping intermediate semantic transitions.

Candidate model:

```text
transport event stream
  -> ordered event buffer
  -> semantic reducer/process in sequence
  -> one batched cache/store transaction
  -> one coalesced UI notification/render
```

When one semantic event changes several cached projections that the user sees together (for example
Task detail + parent Specification steering summary), apply those cache changes inside one framework
batch/transaction so observers do not render an impossible intermediate combination.

### 2.1 Coalescing window

Current tuning candidate for high-frequency Session/Work updates:

- collect ordinary streaming/progress events for roughly one animation frame or a small window
  (about 16–50 ms);
- process every event in order;
- commit the resulting canonical projection to the query/store once per window.

The exact window is an implementation tuning value, not an API contract.

This is **coalescing/throttled commit**, not classic trailing debounce. A continuous stream must still
produce periodic visible progress; it must not wait forever for the stream to become quiet.

### 2.2 Events that flush immediately

Do not wait for the ordinary coalescing window when an event changes a user-visible control or legal
action materially, for example:

- pending interaction created/resolved/expired;
- Turn terminal outcome;
- readiness becomes requires-attention/unavailable;
- cancellation acknowledged;
- operation becomes recovery-required;
- current execution ownership/scope changes.

These events should cause an immediate semantic commit after all earlier queued events have been
processed.

### 2.3 Last-write-wins is not enough

Do not simply keep the last raw event.

Tool actions, Commentary fragments, interaction lifecycle, usage, and terminal outcomes may be
distributed across several ordered events. Reduce the sequence into canonical state first, then
coalesce the UI/cache write.

---

## 3. Interactive query debounce

Debounce applies to user-driven remote lookup/search, not to canonical event processing.

For a server-backed search/filter:

- update the local input immediately;
- debounce the network query roughly 150–300 ms by default;
- cancel/ignore the previous request when the search term/scope changes;
- do not debounce an explicit Submit/Search action;
- do not send a request for every keystroke;
- keep the prior result visible while the new query is fetching when that does not mislead.

If filtering is entirely local over an already-loaded bounded collection, no network debounce is
needed.

The debounce interval is a UI tuning value, not part of the backend API.

## 4. Event payloads: snapshot vs delta

Prefer an event contract that is easy to reconcile.

For complex canonical entities such as Turn, a full normalized entity snapshot in a
\`turn.updated\`-style event is often safer than many UI-specific partial patches.

For lightweight invalidation domains, a granular invalidation event is enough:

```text
{
  type: "spec.changed",
  specId,
  revision?,
  changed: {
    documents?: ["task:TASK-03"],
    taskIds?: ["TASK-03"],
    steering?: true
  }
}
```

Do not send giant full-Spec payloads for every file watcher event.

Do not send an unstructured "something changed" event if the server can cheaply identify the affected
resource.

---

## 5. Query invalidation rules

Invalidate the smallest authoritative query that can now be stale.

Examples:

- Task workflow change -> Task projection + Specification steering summary for that Task;
- one document file change -> that document query + manifest metadata if title/availability changed;
- Session Turn update -> Session snapshot/cache, not every Specification document;
- Settings plugin/config change -> Settings catalog, not Session caches;
- PR headSha change -> PR metadata and naturally new diff cache keys, not every repository query.

Avoid broad invalidation such as "invalidate every SpecFlow query" after one mutation.

If a command returns a complete newer projection, update cache from the command/event result first,
then invalidate only as a consistency backstop if required.

---

## 6. Batch reads

### 6.1 When batching is appropriate

Batch reads when:

- the client already knows it needs several homogeneous resources;
- those resources share transport/auth/scope;
- each item remains independently cacheable;
- one request reduces overhead without coupling unrelated staleness.

Examples:

- several visible document summaries/bodies;
- several file diffs;
- several artifact metadata records.

Illustrative API:

```text
POST /api/specs/:specId/documents:batch

{
  ids: ["task:TASK-02", "task:TASK-03", "review:latest"]
}
```

Response:

```text
{
  items: [
    { id, ok: true, revision, document },
    { id, ok: false, error }
  ]
}
```

Partial item failure must not fail unrelated successful items unless the domain requires atomicity.

### 6.2 Windowed client batching

Independent item requests issued nearly together may be merged through a short batching window.

Legacy evidence already contains a generic pattern using:

```text
window ~= 20 ms
max batch size ~= 15
```

Those values are useful evidence, not frozen new-product constants.

Current proposal: make batching window and maximum batch size configurable.

### 6.3 Do not batch unrelated data blindly

Do not put Settings catalog, Session history, Specification documents, and Git diff data into one
"page bootstrap" endpoint merely because one route currently displays all of them.

Batch transport optimization must not destroy independent cache/invalidation boundaries.

---

### Deferred implementation: legacy Nevo batch queries

The previous dashboard had one confirmed production adapter for generic query batching:
`usePullRequestFileDiffs` in
[legacy Pull Request queries](https://github.com/dczerwinskipl/nevo/blob/main/tools/dashboard/ui/features/pull-requests/queries.ts)
used
[legacy `useBatchQueries`](https://github.com/dczerwinskipl/nevo/blob/main/tools/dashboard/ui/features/pull-requests/use-batch-queries.ts).
It combined individually keyed TanStack queries through `@yornaath/batshit` for
Git file diffs (default 20 ms scheduling window, at most 15 requests per batch),
with revision-aware `headSha` keys, in-flight deduplication, and progressive
background prefetch. No other production domain adapter was found in the old repo.

**Decision for SpecFlow MVP: document and defer; do not port the helper or its dependency.**
Feature queries use plain TanStack Query until an actual screen needs homogeneous,
independently cacheable bulk reads. In particular, do not implement an unused
`BatchQueriesProvider`, transport plugin or generic request queue.

If the Git Changes implementation eventually needs this capability, evaluate the
legacy code rather than copying it unchanged. Preserve explicit-open priority over
background hydration, scope requests by repository/revision, and let independent
items succeed or fail without discarding unrelated results. Benchmark real network
and server cost; batching should reduce overhead, not fetch hundreds of heavy diffs
merely because a PR's file manifest is visible.

## 7. Domain batch commands

If one user action semantically operates on many domain objects, expose one domain batch operation
instead of firing N unrelated mutation requests from the browser.

Example:

```text
POST /api/specs/:specId/tasks/actions:batch

{
  actionId,
  taskIds: ["TASK-02", "TASK-03", "TASK-04"],
  idempotencyKey
}
```

The response must define its atomicity:

- all-or-nothing; or
- per-item outcomes.

Do not fake a domain batch through \`Promise.all(N POSTs)\` when ordering, locking, admission, or
recovery must be coordinated.

Conversely, do not batch unrelated mutations just to reduce HTTP request count.

---

## 8. Documents and heavy detail

Use lightweight-first loading:

```text
collection/screen projection
  -> lightweight references/manifest

user opens or viewport predicts likely need
  -> one resource or small batch

deep/raw detail
  -> on demand only
```

### Documents

- manifest/metadata is lightweight;
- body fetched only when opened or intentionally prefetched;
- body cache can be effectively immutable until a granular change event/revision invalidates it;
- opening one document must not fetch every document body.

### Session history

- initial Session snapshot should contain enough recent/current data for the main experience;
- older Turns/large Work history should be pageable/lazy when history grows;
- Floating Session must not trigger full historical hydration.

### Files/diffs

- manifest first;
- diffs/file bodies on demand;
- cache identity includes content/head revision;
- explicit user-open request has priority over background prefetch.

---

## 9. Prefetch rules

Prefetch only when likelihood and cost justify it.

Good candidates:

- Task detail for the currently focused/keyboard-selected Task after a short intent delay;
- first visible document bodies in a document-reading flow;
- visible-group file diffs;
- Full Session detail when user explicitly chooses Open full session.

Do not:

- prefetch every Task in a large Specification;
- fetch every document body because the manifest loaded;
- hydrate all Work details because Full Session opened.

Prefetch must be cancellable/low priority and never block explicit user requests.

---

## 10. Suggested refresh policy per current screen

### Specs Overview

Refresh: **yes**, header/overflow.

Refreshes:

- selected Current/Archive collection projection currently displayed (`current` / `archive`).

May also refetch on:

- window focus;
- relevant Spec change event.

Does not:

- fetch all Task documents;
- fetch all Sessions.

### Specification Workspace

Refresh: **yes**, header/overflow when live invalidation is unavailable or user explicitly requests.

Refreshes together:

- Specification steering projection;
- Task semantic summaries/actions included in that projection.

Does not blindly refresh:

- every document body;
- every historical Session;
- every file/diff.

An open document/detail may have its own refresh/invalidation if its source changed.

### Task Detail

Refresh: **usually implicit through parent/live invalidation**.

If exposed in overflow:

- refresh Task projection only;
- refresh currently open evidence only when that evidence has its own stale signal or user explicitly
  asks.

### Project Settings

Refresh: **yes**, header/overflow.

Refreshes:

- Settings catalog/effective values;
- plugin/config contribution list.

If raw source detail is open, source detail refresh is separate unless server revision says it
changed.

### Full Session

Generic Refresh: **normally no** while live connection is healthy.

Use:

- Reconnect / Retry snapshot when transport/session is unavailable or desynchronized.

Reconnect flow:

1. fetch authoritative snapshot;
2. resume events from returned cursor.

Do not refetch all historical Work on every reconnect.

### Floating Session

No independent Refresh.

It uses the same Session cache/live subscription as Full Session.

---

## 11. Polling policy

Short polling is a fallback, not a default.

Prefer:

- event-driven invalidation for repository/Runtime changes;
- focus refetch for resources whose upstream changes cannot be observed locally;
- slow safety refresh measured in minutes where missing an event would leave important stale data;
- short polling only for a deliberately tiny projection where events add more complexity than value.

Current recommendation: avoid polling large document/history/diff payloads every few seconds.

---

## 12. Error isolation

An independently loaded resource should fail independently.

Examples:

- one Task document fails -> Task state still renders;
- one diff fails -> file manifest and other diffs remain usable;
- one Settings plugin contribution fails -> core Settings remain usable if backend can isolate it;
- old Session history page fails -> current Turn/composer remain usable.

A coherent read model that must be mutually consistent should fail as one model rather than exposing
an impossible mixed state.

---

## 13. Observability requirements

Proposed development diagnostics would make it possible to see:

- query key/resource identity;
- snapshot revision;
- last applied event sequence;
- event backlog/coalescing count;
- batch request size;
- cache hit/miss;
- explicit refresh reason;
- invalidation reason/source.

These diagnostics belong in development tooling/logging, not ordinary end-user UI.

---

## 14. Proposed evaluation criteria

1. A burst of realtime events does not create one React render/cache write per raw event.
2. Ordered events are never dropped merely because rendering is coalesced.
3. A continuous event stream still produces periodic progress updates; trailing debounce cannot
   starve the UI indefinitely.
4. User-attention/terminal events become visible without an arbitrary debounce delay.
5. One heavy resource is not polled when granular invalidation is available.
6. Query invalidation is resource-scoped.
7. Several homogeneous reads can use a bounded configurable batch.
8. Unrelated domains are not forced into one giant bootstrap response.
9. Domain multi-object mutations use an explicit batch operation when coordination matters.
10. Refresh scope is visible/documented and does not invalidate the entire app.
11. Existing usable data remains visible during background refresh.
12. Stale in-flight responses cannot overwrite a newly selected route/resource.
13. Heavy history/document/file data is loaded progressively.
14. Remote text search/filter queries are debounced and stale requests cannot overwrite the current
    search scope.
