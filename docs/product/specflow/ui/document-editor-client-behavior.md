---
id: product.specflow.ui.document-editor-client-behavior
type: product
title: Document editor save, commit and Close interaction behavior
status: current
scope: specflow
areas: [ui, workflow]
tags: [documents, editor, commits, recovery, close]
read_when:
  - implementing document editor save and commit feedback
  - mapping document errors into user-visible recovery steps
summary: >-
  Editor feedback, commit queue and manual-commit affordances, conflict draft retention
  and Close blocker presentation for Specification documents.
related:
  - product.specflow.specification-documents
  - product.specflow.ui.documents-editor-mode
  - architecture.runtime.document-operation-transport
  - reference.api.specification-documents
---

# Document editor save and commit behavior

This file covers presentation rules only. The Engine owns writes,
revisions, Git policy and commits
([architecture](../../../architecture/runtime/specification-documents.md)).
The exact HTTP response fields are in [OpenAPI](../../../reference/api/openapi.md).

## Browsing, creating and protecting

- Render registered and unclassified document files, dangling registry
  entries and completeness requirements. `protected` means the overview
  cannot be renamed/moved/deleted; it is not synonymous with a
  required document type. A requirement can be satisfied by several files.
- Show missing archetype definitions by their frozen id/version,
  retaining the Specification registry and requirements. Invalid
  definition files are a quiet warning, not a reason to hide valid
  archetypes. When none are installed, offer
  `nevo-specflow definitions install` without inventing an archetype.
- For image and binary files, choose the viewer by `kind` and
  use the raw route; there is no editable text body. Unclassified
  `u-` ids change on classification, so the active tab follows
  the **returned registered document id**.
- Display actionable refusal reasons on controls before the action:
  `branch-protected`, `branch-not-allowed`, `commit-blocked`,
  `archived`, `busy`; never show a Save affordance that an
  authoritative write would predictably refuse. Unreadable/
  changed-policy failures must still be handled on submit.

## Saving and observing commits

- On successful save show **Saved** immediately because disk changed.
  If automatic Git commit is pending, a quiet `Committing` hint
  suffices. `failed` needs an actionable state. With manual policy,
  show **Changes saved, not committed** and a Commit changes action,
  not a pending spinner.
- A revision conflict preserves the editor draft, or **all** drafts
  of a failed all-or-nothing Save all. Reload the server revisions
  and invite the user to reconcile. Send fresh `operationId` per
  action; retry an uncertain request with the same id.
- A busy queue uses `retryAfterMs` for autosave backoff and retains
  the draft. A normal `settling` marker should not produce a warning.
  The tree shows pending/failed/uncommitted commit state without
  polling Git; the operation list is a separate view of outstanding
  work.
- A failed commit offers **Retry** and **Abandon** only when the
  Engine says the operation is safely actionable. `content-changed`
  means an external edit interrupted a pending commit and a fresh
  save is needed; `recoveryRequired:true` shows the operator
  procedure, with no unsafe Retry.
- Commit changes opens a dialog with ledger entries, selected
  closed path subset and a bounded message. `MANUAL_COMMIT_STALE`
  reloads it, `MANUAL_COMMIT_CONFLICT` identifies externally changed
  paths, `MANUAL_COMMIT_UNAVAILABLE` explains pending or failed
  queued work, and branch policy refusals explain why a Git commit
  is forbidden. The local/project/default policy source is
  displayed read-only, never changed implicitly from the UI.

## Close with uncommitted documents

- `DOCUMENT_COMMITS_PENDING` has distinct causes: for
  `commit-pending`, show a bounded wait followed by Check again;
  for `commit-failed`, direct the user to the failed operation;
  for `commit-uncommitted`, identify each actual owner and paths
  from the Engine's safe ledger projection.
- A ledger may include a Specification's document files, its
  Task/execution state, another Specification sharing the worktree
  or definitions. Name the affected owner and safe relative
  paths, including hidden counts; do **not** suggest a commit
  scoped to the current Specification when other owners hold
  changes. A step-in-progress can sometimes commit workflow state
  by finishing; other causes require appropriate Git/manual
  intervention. Warn that discarded files outside SpecFlow
  cannot be recovered by the UI.
- The Close dialog does not silently flush/stash/discard unrelated
  changes or offer an unsafe universal `Commit now`. It can
  navigate to the appropriate Document commit action only when
  its scope is valid.
