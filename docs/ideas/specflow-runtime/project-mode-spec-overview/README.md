---
id: ideas.specflow-runtime.project-mode-spec-overview
type: architecture
title: Project-mode Specification Overview — decision record and open follow-ups
status: draft
scope: specflow
areas: [runtime, server, ui]
tags: [specification, workspace, overview, tasks, activity, sessions, documents, planning]
read_when:
  - asking why the project-mode Overview has a temporary Tasks source and a partial Activity history
  - replacing the manifest Tasks source with the workflow kernel's Task source
  - adding Task, document or commit events to the project-mode Activity history
summary: >
  Decision record (a proposal, not a current rule) of making the Specification Overview work on a project Runtime
  (owner decisions 2026-11-08, delivered in PR #126): Overview sections independent of Tasks, the
  temporary manifest Tasks source, the partial Activity history, the overview-derived description
  and the preparation block. Keeps the decisions, the rejected alternatives and the open follow-ups;
  the behaviour is owned by the Specification Overview and the Specification Workspace API.
related:
  - product.specflow.ui.specification-overview
  - reference.api.specification-workspace
  - ideas.specflow-ui.session-association-ux
  - ideas.specflow-ui.screens.specification-workspace
  - architecture.runtime.task-read-composition
---

# Project-mode Specification Overview — decision record

**A proposal, not a current rule.** The behaviour is owned by the
[Specification Overview](../../../product/specflow/ui/specification-overview.md) (sections, the
preparation block, empty Tasks, Activity history, what project mode shows today) and the
[Specification Workspace API](../../../reference/api/specification-workspace.md#project-summary-tasks-and-activity)
(summary, temporary Tasks contribution, activity events). They win on any difference.

**Problem it solved.** Before PR #126 every project Specification read as `preparationState: empty`
(nothing on `main` writes manifest Tasks), the UI hid the description, Documents and Continue
session whenever there were no Tasks, and Tasks and Activity were `not_implemented`, so a real
Runtime showed only "Not available on this server" although Documents and Sessions existed.

## Owner decisions (2026-11-08)

| #         | Decision                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1        | With no Tasks the Tasks section keeps its header and shows an inline empty state: title and description, no glyph, no border, row-sized             |
| D2        | Partial real activity (Specification created, Session started); the Secondary opens by default only when a Session event exists                     |
| D3, D4    | The preparation block's button **Start session** opens New Session, gated by `actions.startSession`; the legacy conversation dialog path is removed |
| D5        | Demo `activity` unchanged (available and empty)                                                                                                     |
| D6        | The description is derived from the overview document (bounded, plain text)                                                                         |
| D-summary | 320 graphemes including a trailing `…`, cut at a word boundary where possible; rendered as plain text                                               |
| D7        | The blue accent on the preparation block is accepted                                                                                                |
| D8        | Localization of document types is deferred to a separate PR                                                                                         |

## Rationale and rejected alternatives

- **Sections independent of Tasks:** "no Tasks" selects only the preparation block and the empty
  Tasks state. Hiding everything for an empty Specification contradicted the draft rule that an empty
  Specification must explain the preparation path and keep a readable content target.
- **Tasks from the verified manifest only:** `tasks: []` is a verified fact; a non-empty list has no
  verified schema, so it stays `not_implemented` rather than being guessed. Same rule as the
  Specifications list progress.
- **Bordered `EmptyState variant="default"` for empty Tasks, rejected:** too heavy for a section
  without column headers whose rows read like Documents. The owner chose a new Nevo UI
  `EmptyState variant="inline"` (variant A of the reviewed renders) and then removed its glyph,
  because the **Tasks** header already shows the Tasks icon.
- **Activity option A (partial real events), chosen over an empty or unavailable history:** two real
  events are better than none; the "Specification created" event alone does not open the Secondary,
  because it is not a reason to look.
- **Localized activity titles:** the contract carries a closed `event` discriminator by which the UI
  localizes, with English `title`/`description` as fallback, instead of the UI matching English text.
- **Revision unchanged by an overview edit:** documented, not fixed; clients refetch after their own
  document writes.

## Open follow-ups

- **Engine Task source.** The Tasks section and `preparationState` read the manifest `tasks`
  temporarily. When the workflow kernel merges (Tasks in `.execution/tasks/<id>.yaml`, manifest
  `tasks` stays `[]`), both move to the kernel Task source and the manifest rule is deleted; until
  then project mode shows no real Task rows.
- **Fuller Activity history.** Task, document-edit and commit events; Session events beyond the
  workspace Sessions section's 100-row cap.
- **Overview freshness.** An overview-only change does not change the workspace `revision`.
- **D8.** Localized document type labels.
- Out of scope and still hidden in project mode: Repository and Changes, Engine attention.
