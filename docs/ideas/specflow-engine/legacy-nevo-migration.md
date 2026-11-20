---
id: ideas.specflow-engine.legacy-migration
type: engineering
title: Legacy NEvo AI migration and full-feature cutover acceptance
status: draft
scope: specflow
areas: [docs, workflow, runtime, cli, testing]
tags: [legacy-nevo, migration, architecture, workflow]
read_when:
  - porting gates, finalize, human verification, filesystem watching or batches from the old nevo repository
  - reviewing whether a legacy module may be copied or needs redesign
  - planning when the old NEvo repository can remove its Node/TypeScript AI tooling
  - validating an end-to-end .NET feature through SpecFlow before retiring legacy AI
summary: >
  The legacy NEvo modules needing replacement or redesign, plus a project-specific cutover
  contract: a real .NET feature from agent-written Specification through Task implementation,
  independent review, verified GitHub merge and safe Close, without the old JS/TS tooling.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.ownership
  - ideas.specflow-engine.acceptance
  - ideas.specflow-engine.plan-06
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-engine.agent-workflow-entrypoints
  - ideas.specflow-engine.sequential-agent-orchestration
  - ideas.definition-starter-packs
  - ideas.roadmap
---

# Legacy NEvo AI migration and full-feature cutover acceptance

The migration source is the deterministic Task workflow in legacy `dczerwinskipl/nevo`. Specs
storage, identity, Git adapter, Create/Close, the Runtime Specs HTTP adapter, managed Sessions and
providers, and the workflow kernel (definitions, start/finish, readiness, step context, the finish
journal) already have SpecFlow owners; the kernel's port decisions are recorded in
[plan 06](execution-plans/06-workflow-kernel/README.md) §1. Reinspect the actual legacy source
before porting anything below.

## Modules still to port

| Old path                                                                                                                            | New owner                                                       | What to preserve                                                                     | What to change                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Gate contracts in `tools/specs/workflow/definitions/**`, `contracts.mjs` (command, markdown, human gates; `inspect()` / `verify()`) | Engine Workflow (plan 06 F03)                                   | Declarative gate contracts, the inspect/verify split, `failed` vs `blocked` taxonomy | Attempt-scoped evidence; `planFinish` refuses before any change while a gate is unsatisfied                                            |
| `tools/specs/workflow/actions/commit-and-push.mjs`                                                                                  | Engine Workflow action over the commit capability (plan 06 F04) | Fail-closed Git facts, scoped commit checks                                          | Engine-owned commit policy (ADR 0013/0016/0018), no direct cwd assumptions or implicit finalize checkout; stages in the finish journal |
| `tools/specs/approve/**`, `start/**`, `complete/**`, `verify/**`, `finalize/**`                                                     | Review against deterministic Engine operations                  | Relevant validation/PR evidence and user actions                                     | Do not port legacy lifecycle transitions as a second workflow mode                                                                     |
| `workflow verify-human --confirm` and human-verification file records                                                               | Engine human gate + local actor trust                           | Explicit human confirmation                                                          | Legacy records are **not** strong human identity proof; see [human gates](local-actor-and-human-gates.md)                              |
| `tools/dashboard/server/specs/watcher.mjs`, `events.mjs`                                                                            | Runtime observation/SSE                                         | Scoped filesystem invalidation                                                       | Watch registered roots, handle missing/replaced worktree, no source authority                                                          |
| Batch reservations, sequential continuation, remediation (`ai/orchestration/admission.mjs` and related, ~3 000 lines)               | Runtime orchestrator over Engine claims (plan 06 F01, F12)      | Explicit per-Task scope, staged invocation intent, unknown-outcome semantics         | Redesign, do not port the saga or the giant AgentSessionService                                                                        |

## Special caution: legacy finalize

Old `tools/specs/finalize/operation.mjs` checks out the base branch, commits the archive, merges the
PR and deletes branches. That sequence assumes a single mutable checkout and is not safe in a linked
worktree. Archive propagation and managed-worktree disposal are implemented by Close; a workflow
finalize must reuse them and add only workflow verification and remote PR integration.

## Special caution: batches and handover

One Session can execute an explicit Task batch sequentially, and handover requires an explicit new
execution intent; neither silently advances workflow or spawns an unrequested reviewer. Declared
`continuation: auto` transitions are the exception
([ADR 0019](../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md)).

## Migration agent checklist

1. Read current `main` and the current architecture, then this **draft** dossier as candidate guidance.
2. Inspect the legacy implementation and tests; classify each part as domain operation, adapter,
   persistence, observer or provider lifecycle.
3. Identify all ambient `ROOT`, `process.cwd()`, mutable globals and cross-layer imports.
4. Locate the Engine-owned use case and ports; expose the same operation to CLI and HTTP without
   duplicated transition logic.
5. For every mutation, add competing-process tests and failure/restart recovery.
6. Include negative tests for no Runtime, stale claim, missing worktree, wrong actor and commit scope.
7. Label each module **port**, **refactor**, **replace**, **delete** or **defer**, with owner, source
   revision and regression proof.
8. Update normative docs/ADRs **after** the proof and explicit owner approval.
## Outcome: retire NEvo's repository-local AI tooling

This is a **project-specific migration and acceptance gate**, not a new Workflow kernel,
a mandatory feature of every SpecFlow installation or a rewrite of the old Node
implementation. The target is \`dczerwinskipl/nevo\` as a normal **.NET repository**
whose Specifications, Tasks, agent Sessions, review, documentation navigation and
GitHub delivery are run by an **independently installed Nevo SpecFlow**.

The final tracked repository should contain C# source, tests, examples, solution,
project documentation and project-owned \`.nevo/\` configuration/definitions. It
should **not** contain the legacy Node/JavaScript/TypeScript server, dashboard,
workflow CLI, test tooling or their package manifests. SpecFlow itself can be
implemented in TypeScript and run outside this repository: the requirement is no
repository-local JS/TS application or Node tooling dependency, **not** no Node
process anywhere on the workstation.

### Functional parity before removal

Audit the **current** legacy main branch and give each capability a recorded
disposition: **equivalent in SpecFlow**, **project-owned configuration/instruction**,
**explicitly retired by owner**, or **gap blocking cutover**. Do not claim parity
because both products have a button with the same name.

| Current NEvo capability / source | Intended replacement / acceptance |
| --- | --- |
| \`/nevo-ai:spec-create\`, \`spec-refine\`, \`spec-review\`, \`spec-approve\`; \`AGENTS.md\` change classes and owner decisions | Project-mode agent creation L131, Specification authoring steps using E6/P102, continuation P103, independent readiness review and trusted owner gates. Capture the existing S/T/A/E intent without forcing four separate hard-coded workflows |
| \`task-next\`, \`task-start\`, \`task-review\`, \`task-apply-review\`; \`multi-task-review\` | Engine-ready Task selection, P104 bounded batches, fresh independent reviewer, review feedback -> new implementation attempt, P105 test evidence. No fabricated reviewer approval |
| \`spec-status\`, \`spec-audit\`, \`self-check\`, follow-up add/resolve | Deterministic status and next-action projection; explicit scoped audit and follow-up/evidence contract or documented owner-approved retirement. General chat that *appears* to audit is not parity |
| \`spec-resolve-comments\`, \`spec-finalize\`, GitHub skill and \`tools/specs/finalize/**\` | T101 GitHub PR review-thread fetching/resolution/CI, T102 guarded commit/push and integration with SpecFlow Close. Owner-approved squash merge only; preserve branch on uncertain outcomes |
| \`tools/docs.mjs\`, \`docs/routing.generated.json\`, required-context rules | SpecFlow workspace-scoped docs list/get/context/search/check, valid converted metadata and targeted document routing. Agent must demonstrably use relevant NEvo architecture/API/transaction docs, not simply be able to list them |
| \`tools/dashboard/**\`, Sessions, watchers and orchestration | SpecFlow Workbench, managed provider Sessions, durable attempt status, refresh/recovery and agent/Task evidence. No remaining dependency on the legacy dashboard |
| \`tools/specs.mjs\`, \`tools/specs/**\`, \`.nevo-ai/workflows/**\` | Single SpecFlow source of truth for Specification/Task state and project-owned workflow/task-type/archetype definitions. Never dual-write two workflow stores |

Preserve **project knowledge** independently of tooling. Review \`AGENTS.md\`,
\`CLAUDE.md\`, \`.cursor/rules/\`, \`.github/copilot-instructions.md\`,
\`docs/ai/**\`, current \`docs/development/**\`, ADRs and package reference
documentation. Move owner-decision policy, API compatibility, package boundaries,
transaction/persistence rules, testing conventions and documentation-routing
rules into authoritative NEvo docs and SpecFlow agent profiles where appropriate.
Use the optional [technology starter packs](../definition-starter-packs.md) as a
base, not a substitute for these repository-specific rules.

SpecFlow Docs has a **different frontmatter taxonomy** from old NEvo. Convert
legacy \`type: development\`/\`type: ai\` and other unsupported metadata, correct
\`related\` references and links, regenerate indices with SpecFlow Docs and prove
\`nevo-specflow docs check\` on a real checkout. Do not silently drop documents
from context because they fail parsing. Decide how to retain old
\`specs/active/**\` and \`specs/archive/**\` history before deleting its
commands; historical Specifications need not be imported into a live Workflow
unless the owner explicitly requires it.

### Prerequisite capabilities, without duplicating owners

- **P102/I101 + E6/#169:** safe, attributed, recoverable agent execution of one
  Specification or Task attempt through Runtime's bound CLI broker.
- **L131 + P103:** real-project "Create with agent", end-to-end Specification
  preparation and declared continuation, stopping for owner questions and approval.
- **P104:** dependency-respecting Task execution and independent fresh-Session
  review/rework, without infinite retries.
- **P105:** executable build/test/documentation gates with trustworthy results.
- **T101/T102:** PR/CI/comment/merge integration plus commit/push and safe
  post-merge close/cleanup. A successful local Git commit is not a merged PR.
- **L148:** optional .NET seeds; acceptance is NEvo-specific instruction and
  verification quality, not merely installing a pack.
- **I103:** installed real-project E2E is the baseline. Its proposed **1.0**
  minimum covers a manual journey plus **one agent step**, not the complete
  autonomous Specification-to-PR cutover described here. Do not turn all the
  items above into implicit 1.0 release blockers.

See [agent entry points](agent-workflow-entrypoints.md) and
[sequential automation](sequential-agent-orchestration.md). This document
owns only the **legacy repository retirement outcome** and proof.

## Project cutover definition of done

A full-feature cutover requires **one newly specified, non-trivial, real change
to the NEvo .NET libraries** performed **after legacy tooling is removed**,
using an installed SpecFlow build outside the NEvo checkout. A demonstration
with prewritten Task documents, demo-mode Runtime, manual edits of workflow
state, a mock-only feature, or direct use of the old Node CLI does **not**
satisfy the gate.

1. **Boot and knowledge:** from a clean clone of \`dczerwinskipl/nevo\`,
   bootstrap SpecFlow with project-owned \`.nevo/config.yaml\`, workflow,
   Task Types and agent archetypes; load NEvo's converted docs and selected
   instructions. Verify a managed agent reads the right package-boundary,
   API/transaction, and relevant testing documents for its actual Task.
   No hidden personal global instruction files are required to succeed.
2. **Specify the feature:** an owner requests the change in the SpecFlow UI
   or the authorized entry point. An agent performs discovery, proposes
   alternative solutions where the existing NEvo policy demands them,
   asks the owner for architectural choices and creates a **substantive,
   complete Specification**. The declared requirements, design, acceptance
   criteria and Task breakdown are present; owner approval is recorded by
   the trusted owner actor. Finishing the first authoring step is **not**
   treated as a complete Specification.
3. **Execute real Tasks:** prepare and approve at least **two actual
   dependent Tasks**, modify production C# and accompanying automated tests,
   preserve context and task-specific path scope, and use managed agent
   attempts. The Engine, not prompts or the old \`change.yaml\` lifecycle
   fields, determines readiness and completion.
4. **Independent verification:** execute the relevant \`dotnet build\`,
   \`dotnet test\` and \`nevo-specflow docs check\` under enforced gates.
   Reviewer runs in a separate fresh managed Session, can return actionable
   findings, and a subsequent eligible implementation attempt receives that
   feedback. Prove one review-failure/rework/pass route through an actual
   change or a controlled acceptance fixture, **never** falsify a real
   production review to make the demo green.
5. **Recovery and owner gates:** exercise a restart during an active attempt
   and test at least one unknown native outcome in a controlled negative test.
   There must be no duplicate dispatch, fabricated finish, owner-approval
   bypass or silent loss of durable changes. Missing tool/provider/quota or
   unsafe worktree state must stop with visible recovery guidance.
6. **Deliver through GitHub:** commit/push only authorized paths, open a real
   PR, observe CI and review threads, resolve required comments, obtain
   the owner's merge approval, **squash-merge** into \`main\`, and safely
   archive/Close the Specification and clean up its branch/worktree. A
   post-merge failure must not be reported as a successful Close.
7. **Prove legacy independence:** no step above invokes \`node tools/specs.mjs\`,
   \`node tools/docs.mjs\`, \`npm run dashboard:*\` or the legacy
   \`/nevo-ai:*\` commands. None of the tracked
   \`*.js\`, \`*.mjs\`, \`*.cjs\`, \`*.jsx\`, \`*.ts\`, \`*.tsx\` files or
   \`package.json\`/\`package-lock.json\` artifacts remain in NEvo.
   Remove \`tools/**\`, the old \`.claude/hooks/**\` JS, obsolete AI skills
   and \`.nevo-ai/workflows/**\` only after recorded parity decisions.
   Revise \`README.md\`, \`AGENTS.md\`, provider/Cursor/Copilot pointers,
   documentation, .gitignore and GitHub Actions; retire the Node tool-test
   workflow without removing the .NET test CI.
8. **Clean-clone verification:** repeat the installation, documentation
   validation, \`dotnet restore\`, \`dotnet build\`, \`dotnet test\` and
   project workflow smoke tests on the post-cleanup \`main\`. Align
   \`.github/workflows/dotnet.yml\` with the pinned
   \`global.json\` (.NET 10 SDK in the currently inspected NEvo tree).
   Neither CI nor normal development should require \`npm ci\` inside NEvo.

**Required acceptance record:** target NEvo SHA and SpecFlow version/commit;
Specification/Task IDs; configuration and migrated-docs revision; executor
and reviewer Session/attempt IDs; owner-decision evidence; tests and
gate results; restart/negative-test evidence; PR URL and GitHub checks;
squash commit; terminal Close/worktree status; and an explicit parity
disposition for every legacy command/capability in the table above. A
checklist without linked evidence is not an accepted cutover.

### Order of execution and rollback boundary

1. Inventory live legacy AI features, active Specifications, archived
   knowledge and all imports in \`dczerwinskipl/nevo\`. Decide what history
   to preserve; no destructive bulk removal as the first migration step.
2. Install/configure SpecFlow alongside the legacy tooling for a **rehearsal**
   full feature. Record functional gaps, fix them in SpecFlow, and prove
   relevant NEvo .NET rules and documentation are actually applied.
3. Remove the old Node/JS/TS tooling and adapt NEvo CI/docs in a separate,
   reviewable **migration PR**. Do not merge until the surviving code and
   tests are green. Keep a tag/commit anchor for diagnosis and rollback.
4. Run the **final, new-feature SpecFlow E2E after cleanup** and attach the
   evidence above. Only then declare legacy NEvo AI retired. If any gate
   fails, keep the retirement incomplete and track the confirmed gap; do
   not claim success because the migration PR merged.

This is deliberately a stronger acceptance condition than SpecFlow's
initial installed 1.0 acceptance and is specific to NEvo becoming a
JS/TS-free .NET development repository.
