---
id: product.specflow.ui.specification-tasks
type: product
title: Specification Tasks page and Task row presentation
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - changing the Specification Tasks page, its URL filters or Task rows
  - changing Task status marks, supporting text or attention overlays
summary: >-
  Full Specification Task inventory, Runtime-owned groups, blocking/group and text filters,
  reusable Task rows, empty states and presented status/attention semantics.
related:
  - product.specflow.ui.specification-overview
  - product.specflow.ui.workflow-execution
  - architecture.runtime.task-read-pagination-and-grouping
  - reference.api.task-reads
---

# Specification Tasks page and Task row presentation

Runtime owns grouping and filtering facts; this document owns how the Tasks page and shared rows
present them. The Overview's compact summary remains in
[Specification Overview](specification-overview.md#sections-and-order).

## Tasks page

`/specs/:specId/tasks` is the Specification's full Task inventory and the navigator's **Tasks**
item (a Full Task under it keeps Tasks active). It renders the Runtime's grouping as delivered, in
configured order, with the groups the configuration collapses (Cancelled, Ended) collapsed; the
section count is the progress text and the header offers **New task** when the Specification
projection allows it. No checkboxes and no bulk actions (plan 06 F12 is deferred).

It follows the [Specifications list](specs-overview.md) collection pattern: the `task` preset of
`CollectionColumns` (`minmax(0,40rem) minmax(15rem,22rem)`, `gap-x-6`), with a **Task | Status**
column header from 48rem of list width, group headers (dot, name, count) across both tracks, and
bounded tracks at any width while the row's hover and focus span the whole row. The filter by id
or title (local state) and the filter chip (blocking or group) are as wide as the title track. Below 48rem the
header is hidden and every row stacks: title, "id · Type", status, supporting line.

A row is the **Task row** (`TaskRow`, reused by the Overview Tasks section):

- **Task cell:** the title (`h3`, the link to the Full Task stretched over the row), then the id in
  mono and the Task Type ("`oidc-callback` · Implementation"). The title track is wide enough that
  an id does not break at Wide.
- **Status cell:** the status mark and label ([below](#task-status-presentation); "Waiting for
  T-02", "Draft · needs approval"), then at most two lines of support (pretty wrapping):
  - the **Requires attention overlay** when the Engine reports one for the Task, in the attention
    tone with `triangle-alert`. It is added under the status, never in its place. A Task on hold
    keeps its reason under the overlay (one line each, the full text in their tooltip), except an
    escalated one, whose overlay already quotes it. The row's item is the read's own `attention` field (the Task's own item, or
    the Specification's `task-escalated` naming it, resolved by the Runtime), or the `tasks-stuck`
    its `blocksSpecification` reflects; the row renders it and never derives attention. A broken
    Task gets no overlay line: its status already says it ("Cannot start · files broken"). The
    reason is worded from the item: a held Task that keeps the step from finishing "<step> cannot
    finish while this task is on hold" (it names the finish; its dependents only when it holds up
    no finish), one that holds up others "holds up T-02, T-03 (+N)", an escalated one "escalated
    to the specification: <feedback>", a Task the `tasks-stuck` names "<specification> cannot
    continue until it moves"; other reasons keep the Engine's message;
  - without an overlay, the hold reason of a Task on hold, verbatim (`holdReason` of the read; the label
    already says "On hold"), or the dependencies of a Task that has not run ("after T-02").

The page's search is router-owned and validated; absence is the default:

- `blocking=specification` (the only value) keeps the Tasks the current `tasks-stuck` names, in
  their groups, resolved by the Runtime when read, never from ids in the URL. A filter bar shows
  "Blocking specification · 2 tasks" (or "Nothing blocks the specification now") with a clear
  button, and the count reads "2 of 7 shown". Review tasks pushes the entry; clearing replaces it.
- `group=<id>` (the Overview's "N more in <group>" and its compact links) lists only that group's
  Tasks, resolved by the Runtime when read (`GET /api/specs/:specId/tasks?group=<id>`), as rows
  without a group header (also a group the configuration collapses); focus stays where the page
  puts it. A filter chip names the group ("Waiting") with a clear button, and the section count
  reads "4 of 12 shown" (the one count); with none left, "No tasks in this group now". The link pushes the entry; clearing replaces it.
- The two never combine: with both in the URL, `blocking` is kept and `group` dropped.

The filter by id or title narrows the rows on screen, and the section count follows it: "N of M
shown", N the rows left after the URL filter and the text filter, M all the Specification's Tasks
(the same M as the URL filter's count), so N always equals the rows listed. Without a URL filter a text filter turns the progress into
that count ("2 of 7 shown"); with no row left it reads "0 of 7 shown" over "No task matches the
filter.". The blocking chip keeps the Runtime's count of the Tasks it names. While a term is
typed every group with a match is shown expanded, also one collapsed by the configuration or by
the person, so every counted row is on screen; as on the [Specifications list](specs-overview.md)
its chevron stays, `aria-disabled="true"`, named "{group} section expanded while search is
active", and does nothing. Clearing the search restores the collapse the page had before it.

Without Tasks the page shows an empty state with the same logic as the Overview's Tasks, from the
same projection, and no filter by id or title (there is nothing to filter):

- While the workflow runs the title is "No tasks yet" and the description names the step that
  creates them (`The "Break the solution down" step (4 of 7) creates the tasks.`); without such a step
  it says "Tasks appear here once the specification is prepared for work."
- Once the workflow ended (completed or abandoned) the title is "No tasks were created", with no
  step line and no "yet".
- When the projection allows creating a Task (`specification.createTask`, independent of the
  stage) the description adds "You can also create them now with New task." after the step line,
  or reads "You can create them now with New task." alone.

The demo Runtime serves the same Tasks page read: it runs the Engine's workflow over in-memory
state ([ADR 0025](../../../architecture/decisions/0025-demo-runs-the-engine-in-memory.md)).

### Task status presentation

Every Task surface (Tasks page rows, Overview Task rows, Close blocker items, the Full Task status
line, Depends on rows) presents a status by its presented id, one mark and tone each:

| Status (label, presented id)           | Mark                                                    | Tone               |
| -------------------------------------- | ------------------------------------------------------- | ------------------ |
| Draft                                  | `edit`                                                  | neutral            |
| Ready to start (`ready`)               | info `StatusIndicator` dot                              | neutral            |
| Waiting                                | `clock`                                                 | neutral            |
| In progress                            | spinning `loader` (static under reduced motion)         | info               |
| On hold                                | `circle-pause`                                          | neutral            |
| Cannot start (`blocked`)               | none, its slot kept (until a Blocked state is designed) | neutral            |
| Done (`completed`)                     | `circle-check`                                          | success            |
| Cancelled, Abandoned                   | `close`, muted label                                    | neutral            |
| Cannot start · files broken (`broken`) | `circle-alert`                                          | danger (label too) |

One name per state: a status label matches the default grouping's group name ("Ready to start",
"Cannot start", "Done").

One owner each in `features/tasks/read-model`: `getTaskStatePresentation` / `taskStatusSupporting`
(the status) and `taskAttentionOverlay` with its predicate `taskRequiresAttention` (the attention
wording, and whether a row has one at all). Requires attention is an overlay added under the
status, never a status, and only when the Engine reports it. The Runtime presents only the ids of
this table; an unknown id is a contract drift that development builds assert. The general rule
(mark + label, tone meanings, attention as an overlay) is the design system's
[Status and attention on a row](../../../design-system/principles/information-row-hierarchy.md#status-and-attention-on-a-row).
