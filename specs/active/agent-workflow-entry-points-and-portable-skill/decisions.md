# Decisions

## Context

The owner took D1 to D4 on 2026-11-25 in Gather requirements, and D5 to D7 the same day in Write the
Specification, when PR #189's Idea "Agent workflow entry points and portable SpecFlow skill" became
this Specification. E6 (ADR 0026) had already delivered managed single-step agent execution. D8 was
taken in Design the solution, and D9 and D10 in Review the breakdown. That step's design decisions (S1 to S9, with their alternatives) are in
architecture.md, and the owner chose to leave internal design choices to it.

## Options

- **Scope.** The portable external skill, project-mode Create with an agent (L131), ad-hoc Session
  guidance, the Now-block **Start workflow** wording.
- **External trust (no L140).** Owner-attributed finish on request, authoring only, or reads only.
- **Skill delivery.** `init` generates wrappers from one shipped source, a separate install command,
  or docs and a print command only.
- **Create with an agent.** A real first-step attempt, an idle Session as in the demo, or out.
- **Create composition.** The UI chains Create and the existing agent-execution start, or the Create
  request carries the agent choice and the Create operation starts it.
- **Skill commands.** A `skill show` and `skill install` group, or folding the skill into
  `definitions install`.
- **Ad-hoc brief delivery.** Prepended to every ad-hoc write Turn and shown apart, through each
  provider's instructions channel, or prepended only on a fresh native context.
- **First step at Create.** A `firstStep` per archetype on the archetype catalogue, a map of them on
  `create-options`, or asking for the archetype before the method.
- **Skill install on a detached HEAD.** Refuse before writing, like definitions, or write and note that
  nothing was committed.
- **Committing skill wrappers.** A new `skill` manual-commit scope, or `all` in the CLI only, like
  definitions.

## Decision

- **D1 Scope.** In: the portable external skill, project-mode Create with an agent (first step only,
  never "prepared"), ad-hoc Session guidance, and the Idea's managed brief requirements (no native
  skills or MCP, refuse instead of a silent downgrade). Out: the Now-block wording (filed separately),
  P103, L140, MCP, starter packs, orchestration, the NEvo migration.
- **D2 External trust.** The skill MAY run `workflow start` and `workflow finish` as the local owner,
  only when the user asked for it in that conversation, recorded and labelled as the owner's. It stops
  and asks before any owner-authority result. Instruction-only, and the skill says so.
- **D3 Delivery.** One provider-neutral, versioned skill source ships with the CLI package. Generated
  wrappers go to `.claude/skills/nevo-specflow` and `.agents/skills/nevo-specflow`, and a read command
  prints the skill.
- **D4 Create with an agent.** "With an agent" on the project Create form creates the Specification
  and starts Run with agent on its first agent-executable step as a real E6 attempt.
- **D5 Create composition.** The UI chains two calls. The Create request and operation do not change.
  After Create completes, the UI calls the existing agent-execution route.
- **D6 Skill commands.** `nevo-specflow skill show` prints the skill (an agent read).
  `nevo-specflow skill install [--force] [--dry-run]` writes or updates the wrappers, modelled on
  `definitions install`. The first `init` runs the install with the definitions. **Correction:** `init`
  refuses an initialized project, so updating is `skill install`, not a re-run of `init` (A4).
- **D7 Ad-hoc brief.** Every ad-hoc write Turn sends a compact brief ahead of the owner's message. The
  transcript keeps the owner's text as their message and shows the brief as a separate, collapsed
  "SpecFlow brief" part.
- **D8 First step at Create.** The workflow, and so its first step, comes from the archetype, and the
  form asks for the method first. Each archetype in the catalogue carries its `firstStep`. The method
  step is offered when at least one selectable archetype starts with an agent's step. **With an
  agent** then lists only those archetypes, and the action names the step once one is picked. This
  corrects C6, which had put a single `firstStep` on `create-options`.
- **D9 Skill install without a branch.** With Git enabled, a detached HEAD or a repository with no
  commits refuses `skill install` with `COMMIT_BLOCKED` before anything is written, as
  `definitions install` does. Only Git disabled writes without a commit and notes it.
- **D10 Committing skill wrappers.** No new manual-commit scope. The CLI's `commit --scope all` covers
  the ledger owner `skill`. The HTTP `all` leaves `skill` out, as it leaves out `definitions`. The CLI
  and UI Close reports show a **Skill wrappers** group whose remedy is `nevo-specflow skill install`,
  which commits leftover wrapper paths (architecture.md S3).

## Consequences

- External work stays owner-attributed until L140. The guard before owner-authority results is
  enforced for managed agents (D17) but not for external agents, and the docs say so.
- Create with an agent needs no new backend contract, and a refused or lost agent start leaves a
  usable Specification. A non-UI client chains the same two calls.
- `skill install` writes provider folders. It keeps a hand-edited wrapper unless `--force` and never
  touches other skills. This repository's `nevo-agents` tool manages only `nevo-agents-*` folders, so
  the two coexist.
- Uncommitted wrappers are a CLI matter, like definitions: a UI-only owner is sent to the CLI to clear
  them before Close.
- Every ad-hoc write Turn pays for a small brief, and a Turn now has an owner message and a separate
  brief part.
- The demo's idle-Session Create with an agent now differs from project mode. Aligning them is not
  in scope.

## Task text changes (D9, D10)

The breakdown review (attempt 1) asked for changes to four Tasks. The owner decided them as D9 and
D10 (decisions.md). A Task's `task.md` cannot be changed in a Specification step, so the changes are
recorded here, in decisions.md. **They are part of each named Task's scope and verification, and they take
precedence over its `task.md` where the two differ.** The fifth change, the Skill wrappers group in
the UI, is Task `close-skill-wrappers-group`.

### Task `engine-project-file-install`

Scope:

- The branch check of S3 step 3: with Git enabled, a detached HEAD or a repository with no commits is
  refused with `COMMIT_BLOCKED` before writing, as `assertDefinitionsCommittable` does for definitions
  (D9). Only Git disabled writes without a commit.
- **Replaces** the sentence "The design does not fix which `nevo-specflow commit --scope` reaches
  `skill` paths. `all` must, and the CLI reference records the choice." with: no new manual-commit
  scope (D10). The CLI's `commit --scope all` covers `skill` paths. The HTTP `all` leaves them out, as
  `resolveManualCommitTarget`'s `allowDefinitions` filter leaves out `definitions`. The CLI reference
  records this.
- Contracts `documents/errors.ts`: the uncommitted hold's owner union gains the variant
  `{ kind: 'skill' }` beside `definitions` and `specification`, with its count and paths.
- **Specification architecture.md: already applied.** The breakdown could not save it
  (`DOCUMENT_COMMITS_PENDING`). Review the breakdown (attempt 2) saved the S3 text and the module map
  rows for D9 and D10 once the move was committed. This Task does not edit architecture.md.

Verification, in addition:

- a detached HEAD gives `COMMIT_BLOCKED` and writes nothing;
- the hold names the owner `skill`, and the contracts schema accepts it;
- manual commit `all` as the CLI calls it commits `skill` paths, and `all` as the HTTP route calls it
  leaves them uncommitted, as it does `definitions`.

### Task `skill-source-and-commands`

Scope:

- **Replaces** "it notes when nothing was committed (no Git, detached HEAD)" with: it notes when
  nothing was committed (Git disabled). A detached HEAD or a repository with no commits is the
  Engine's `COMMIT_BLOCKED` refusal before writing, printed as `CODE: message` (D9).
- **Close report.** `src/documents/uncommitted-groups.ts` gains the owner `skill`: a **Skill wrappers**
  group whose remedy is `nevo-specflow skill install`, which commits the leftovers (D10,
  architecture.md S3).

Verification, in addition:

- Integration: a detached HEAD refused with `COMMIT_BLOCKED` and nothing written, and Git disabled
  writing with the no-commit note.
- The CLI Close report: an uncommitted wrapper shows the **Skill wrappers** group with the
  `skill install` remedy, and not a Specification group.

### Task `acceptance-and-coverage`

Scope, in addition:

- **A2.** A finish refused by a gate and one refused by an unmet dependency: the refusal names it,
  and the attempt stays active.
- **A4.** With a wrapper left uncommitted, Close is held, and both the CLI report and the UI dialog
  show the **Skill wrappers** group with the `skill install` remedy, which clears it.

Planning notes: it also depends on `close-skill-wrappers-group` (four dependencies).

### Task `create-with-agent`

Verification: **replaces** "none (no method step)" with: no selectable archetype has
`firstStep.agent` (no method step, S7), and a mix (With an agent lists only the agent-first
archetypes). This matches ux.md's acceptance line.
