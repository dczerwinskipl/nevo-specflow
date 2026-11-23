---
id: product.specflow.specification-create-admission-and-errors
type: product
title: Specification Create Git admission and error feedback
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - reviewing Create branch protection, blocked submission or uncertain failure copy
summary: >-
  User-visible specification Create Git admission and error feedback with immutable operation identity,
  authoritative inspection and explicit refusal/unknown-outcome boundaries.
related:
  - product.specflow.specification-creation
  - architecture.runtime.specification-create-options
  - engineering.shared.specification-create-recovery
  - reference.api.specflow-specification-operations
  - reference.api.operation-progress
---

# Specification Create Git admission and error feedback

[Create choices and workspace selection](specification-creation.md) own the form.
Engine lifecycle owns admission and recovery invariants; this document owns their UI presentation.

## Commit and protected branches (Git enabled only)

Everything in this section applies **only when `create-options` carries `commits`**, which the
Runtime sends exactly when Git is enabled for the project. Without it the screens, the progress
steps and the copy are exactly those of a project with Git off: no Commit row, no committing step,
no protection text, no protected-branch reasons. (`commits` lists the protected and allowed
patterns for display; the per-workspace decision is in each workspace's `selectable` and
`reason`.)

When Git is enabled the Engine commits the new Specification's files (the scaffold) on the branch
where they are created, and it never commits on a branch the project protects
(`git.commits.protectedBranches`, optionally narrowed by `allowedBranches`; see
`reference.configuration.specflow-git-worktrees`). The UI says so before submit and never in server
text:

- **Tiles and pickers.** A workspace whose branch is protected (`reason: branch-protected`) or not on
  the allowed list (`branch-not-allowed`) is disabled with a plain-language reason that names the
  branch, for example _"The branch master is protected: Nevo does not commit there. Create the
  specification in a new workspace."_ This covers the **Current folder** tile (the tile's visible
  description is the reason, never the default tile while it is blocked) and the individual
  workspaces in the **Existing workspace** picker; when every linked workspace with a branch is
  protected the whole tile says _"All other workspaces are on protected branches. Create the
  specification in a new workspace."_ While another tile is active and **New workspace** is
  available, a quiet note offers a one-click **Use New workspace**. A protected branch can still be
  a merge target (it is not evaluated), so the merge-target logic and its muted dirty note are
  unchanged.
- **Generated or typed branch name.** `newWorktree.branchProtected: true` means the branch the
  pattern generates is protected. The tile stays selectable, the Branch name row states
  _"The generated branch X is protected: Nevo does not commit there. Use your own branch name."_ and
  Create stays unavailable (the footer prerequisite names the same problem, and a blocked Create
  opens the row and leads to its branch field) until the owner types a branch name of their own. A typed branch name is checked in the browser with the contracts rule
  (`engineCommitRefusal`, the exact predicate the Engine uses) and a protected or not-allowed name is
  a field-level error _before_ submit. The server remains authoritative.
- **Invalid Git configuration.** `newWorktree.reason: git-policy-invalid` disables only the
  **New workspace** tile, calmly: _"The project's Git configuration is invalid. Check
  .nevo/config.yaml."_ Current folder and Existing workspace keep working.
- **Commit note.** Under the decision rows of a new workspace a quiet note refers to the branch
  shown above instead of repeating it: _"The specification files will be committed to this
  branch."_ The current-folder and existing-workspace summaries have a quiet line that names the
  branch: _"The specification files will be committed to branch X."_ The progress page lists it (_Commit_: the branch) among its **Technical details**, not in
  the configuration summary, from facts the form saved with the draft.

### Errors (code to copy; server text is never shown)

| Code (HTTP)              | Meaning                                                              | What the UI says and does                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRANCH_PROTECTED` (422) | The Engine will not commit on this branch. **Nothing was created.**  | Alert _"The branch is protected"_ plus the explanation for what was sent: a typed branch name is flagged at its field; a generated name offers **Enter your own name**; a chosen workspace offers **Refresh options** (which then shows the disabled reason). The form is kept. |
| `COMMIT_BLOCKED` (409)   | The checkout cannot take a commit now. **Nothing was created.**      | Alert _"Git cannot take a commit right now"_: a merge or rebase may be in progress, no branch is checked out, or Git has the index locked; finish or abort it and try again. The form is kept and can be submitted again.                                                       |
| `COMMIT_FAILED` (503)    | The files **were written** but the commit failed. Recovery required. | Calm recovery alert _"The specification files were created but could not be committed"_: the specification is not registered yet, do not create it again, ask the project operator to resume the operation or to commit the new files, then check the operation again.          |

`COMMIT_FAILED` is the existing recovery-required state with its own copy: the form locks, the
only action is a check of the **same** operation (never a fresh create, never a blind retry), and
the progress page says the files exist, so it never shows the "Nothing was created" line. The page
shows that line only for refusals that changed nothing (`BRANCH_PROTECTED`, `COMMIT_BLOCKED` and the
other not-applied codes). A later check that reads `recovery-required` without a code keeps the
generic recovery copy.

Some codes can also be raised after the Runtime reserved the operation, when the journal, the files
or a commit may already exist: `CONTROL_LOCK_BUSY`, `REGISTRY_CONFLICT`, `GIT_POLICY_INVALID` and
`WORKTREE_PATH_CONFLICT`. The UI treats them as an **unknown outcome** (never "Nothing was
created"): the form keeps the stored operation and offers **Check the result** for the same
operation, which tells whether anything was created. Only codes that are always raised before the
reservation (validation and preconditions) declare that nothing was changed.

Create options are a snapshot of Git state, so the Create screen treats only options fetched
since the screen was entered as current: while they load it shows the loading state of the
workspace section instead of options cached from an earlier visit.
