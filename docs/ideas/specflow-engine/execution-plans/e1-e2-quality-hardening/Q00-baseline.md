---
id: ideas.specflow-engine.e1e2-hardening.q00-baseline
type: engineering
title: 'Q00 current E1/E2 behavioral baseline'
status: draft
scope: specflow
areas: [testing, workflow, cli, runtime]
tags: [execution-plan, temporary, hardening, baseline]
read_when:
  - implementing or reviewing E1/E2 Q01 through Q07
summary: 'Pinned pre-refactor journal, Git lifecycle and transport contract evidence, with executable characterization and exact-SHA verification requirements.'
related:
  - ideas.specflow-engine.e1e2-hardening
  - ideas.specflow-engine.e1e2-hardening.q00
---

# Q00 — pre-refactor behavioral baseline

**Evidence state: candidate, not ACCEPT.** Test source has been inspected; local tests and exact-new-HEAD three-OS results have **not** been executed/confirmed in this artifact. Do not use a previous SHA's green result to approve Q00, Q01, or T17.

## Identity and immutable comparison point

| Item                            | Exact value                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Repo / PR                       | \`dczerwinskipl/nevo-specflow\` / #53                                                      |
| Branch                          | \`feature/specflow-engine-foundation\`                                                     |
| PR base                         | \`docs/ideas-engine-workspace-foundation\` at \`b03853629aa32e9136269a5f9cc696b60d9e78b6\` |
| Pre-Q00 HEAD (plan)             | \`3347f7bb3a00cac9b3c50894be81b207b244bb3a\`                                               |
| HEAD tree                       | \`c895c83864144b874dd4e6fb6780b35c048c661f\`                                               |
| Squashed implementation         | \`abada44cd32d78a58cb533c5f815fe1ab8149de0\`                                               |
| Squash tree                     | \`327f472e41a0b5e459f216c75792a0634f90e8bb\`                                               |
| Audited original implementation | \`d3770c575b89a8e27e58e9bd468f9febacde2588\`                                               |
| Audited original tree           | \`327f472e41a0b5e459f216c75792a0634f90e8bb\`                                               |

The tree equality proves _source equivalence_ at the squash, not new run results or CI status. Q00 itself adds characterization and documentation only. The next reviewer must pin the **new** HEAD and compare tests against the identical physical scenario or journal input.

## No backward compatibility

This is an unreleased, unmerged implementation. **No legacy journal reader, schema migration, alias, dual-write, or compatibility adapter is required.** The baseline describes _what today's implementation does_, including weaknesses, not a promise to preserve errors. Q01 may deliberately tighten an unintended current acceptance or repair the model-only \`recovery-required\` stage **if separately reviewed and recorded**; it must not accidentally change safety semantics. Nothing in this document licenses replaying uncertain Git or weakening durable intent.

## Journal inputs, expected outputs and durable effects

Executable fixture corpus: [\`packages/specflow-engine/test/quality-hardening-q00-journals.test.ts\`](../../../../../packages/specflow-engine/test/quality-hardening-q00-journals.test.ts). It constructs canonical context with **real git init + commit**, current immutable identities, resource derivation and deterministic Git object IDs. Close fixtures are structural evidence, not a substitute for execution of the physical Git transitions below.

| Format and input                                                                                 | Expected parser / store result         | Required side-effect check                                                      |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------- |
| Create v2, all \`CREATE_STAGES\`                                                                 | ACCEPT, unchanged JSON fields          | Parsing does not run Git                                                        |
| Create wrong version, foreign Project Home, forged fingerprint                                   | \`CREATE_JOURNAL_CORRUPT\`             | Reject without rewrite                                                          |
| Create legacy \`change.yaml\`, unexpected target keys, unknown stage                             | \`CREATE_JOURNAL_CORRUPT\`             | Reject without rewrite                                                          |
| Create unexpected top-level key                                                                  | Currently ACCEPT                       | Known non-strictness; **not** a compatibility requirement                       |
| Close v1 valid reserved / archive intent / archive commit intent / committed                     | ACCEPT                                 | Read preserves bytes                                                            |
| Close v1 valid primary terminal, linked archive-only terminal                                    | ACCEPT with exact outcome              | No new Git activity on parser read                                              |
| Close v1 linked integration preparation, worktree preparation, scratch intent/candidate/conflict | ACCEPT with pinned matching evidence   | Parser does not publish Git                                                     |
| Close v1 publish intent, verified integration, rebound, disposal, worktree terminal              | ACCEPT with required stage proof       | Parser does not mutate registry                                                 |
| Close v1 retained linked conflict, optional retired scratch proof                                | ACCEPT with coherent conflict evidence | No scratch removal on parser read                                               |
| Close changed version, Project Home identity, fingerprint, resource claims                       | \`CLOSE_JOURNAL_CORRUPT\`              | Tampered JSON stays byte-identical                                              |
| Close missing primary destination, illegal primary integration selector                          | \`CLOSE_JOURNAL_CORRUPT\`              | No unreserved Git ref                                                           |
| Close missing committed archive, forged scratch root, absent rebind proof                        | \`CLOSE_JOURNAL_CORRUPT\`              | No settlement or resource retirement                                            |
| Close unsupported future stage                                                                   | \`CLOSE_JOURNAL_CORRUPT\`              | No hidden migration                                                             |
| Close \`recovery-required\` in TypeScript union                                                  | Currently \`CLOSE_JOURNAL_CORRUPT\`    | **Model/store inconsistency; record as a candidate defect**, not a desired rule |
| Close unexpected top-level key                                                                   | Currently ACCEPT                       | Known non-strictness; **not** a compatibility requirement                       |

The Create parser is \`src/specs/create/journal-codec.ts\` (v2). Close validation currently lives in \`src/specs/lifecycle/journal-store.ts\` (v1); it is deliberately the future Q01 extraction target. Any codec extraction should compare **identical input and output/error code**, then explicitly enumerate approved intentional corrections. Actual files are read/written in tests to verify rejection does not alter bytes.

## Real-Git lifecycle comparison: existing regression evidence to execute

These are **test references, not PASS claims**. For each case capture before/after \`git rev-parse HEAD\`, \`git status --porcelain\`, \`git ls-files --stage\` when index changes, source/target branch, worktree membership, state of canonical \`specification.yaml\`, registry \`revision\` and binding \`generation\`, journal stage/evidence, and behavior on same \`operationId\` retry.

| Case / input                                                     | Existing executable source                                                                                          | Expected externally visible result                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Linked worktree close, real fast-forward; retry                  | \`test/close-worktree-lifecycle.test.ts\`                                                                           | \`completed\`; same specId, destination binding, source worktree gone, same HEAD on retry; preserve branch ref                              |
| Primary Spec archive; retry                                      | \`test/close-specification-lifecycle.test.ts\`                                                                      | \`completed / archived-in-primary\`; scoped commit only, registry revision unchanged, no second Git commit                                  |
| Linked Spec archive then integrate                               | \`test/close-specification-lifecycle.test.ts\`                                                                      | \`completed / integrated-and-removed\`; archived canonical source in primary, binding CAS, managed worktree removed                         |
| Linked archive only; retry                                       | \`test/close-specification-lifecycle.test.ts\`                                                                      | \`completed / archive-only-closed\`; no primary merge, source worktree and original binding retained; same-intent retry no mutation         |
| Archive-only then separate Worktree Close                        | \`test/close-specification-lifecycle.test.ts\` LC38                                                                 | Archived manifest moves to primary via separate worktree integration; binding rebind; no second archive                                     |
| Divergent candidate, physical two-parent proof                   | \`test/git-integration-proof.test.ts\`                                                                              | Exact HEAD, index, tree and ref proof; no blind repeat of Git publication                                                                   |
| Divergent conflict and operator reconciliation                   | \`test/archive-close.test.ts\`, \`test/git-integration-proof.test.ts\`, \`test/specs/close.http.test.ts\` (Runtime) | Conflict evidence retained, primary unchanged, no implicit cleanup; explicit process-quiescence acknowledgement and separate reconciliation |
| Stale identity, policy/branch drift, foreign worktree            | \`test/lifecycle-admission.test.ts\`, \`test/close-worktree-lifecycle.test.ts\`                                     | Fail closed; no unapproved commit, rebind, or deletion                                                                                      |
| Killed archive/integration/disposal and cross-process contention | \`test/close-sigkill.test.ts\`, \`test/close-process-contention.test.ts\`                                           | Real terminated processes and physical recovery evidence; one-winner resource/CAS behavior; no presumed exactly-once from journal stage     |

All paths in this table without a package prefix are relative to \`packages/specflow-engine/\` unless marked Runtime.

## Public consumer contract: compare during Q05

**Engine exports:** \`packages/specflow-engine/src/index.ts\` exports \`openSpecFlowEngine\`, \`createSpecificationFromRequest\`, \`inspectCreateSpecification\`, \`previewCloseOperation\`, \`inspectCloseOperation\`, \`closeWorktree\`, \`closeSpecification\`, \`reconcileArchivedConflictScratch\`, and their associated types. Production transport imports are \`packages/specflow/src/specs/command.ts\`, \`packages/specflow-runtime/src/features/specs/create/endpoint.ts\`, and \`packages/specflow-runtime/src/features/specs/close/endpoint.ts\`. Q05 must check both actual consumers and direct Engine package callers in-repo. The \`@nevo/specflow-engine/testing\` export is internal test-only, not a production transport contract.

**CLI:** \`specs create --json\` emits one JSON object with \`operationId\`, \`specId\`, \`slug\`, \`workspaceId\`, \`workspaceRoot\`, \`relativeManifestPath\`. The CLI chooses the current checkout by default; HTTP chooses verified Project Home primary by default. \`specs close --yes --json\` and \`specs worktree close --yes --json\` currently expose the Engine result including \`journal\`. \`specs close-inspect <operationId>\` currently emits the entire raw Close journal. \`specs [close|worktree close] --preview\` emits a plan object, not the sanitized HTTP preview shape. Reconciliation CLI emits \`operationId,stage,scratchRetired,next\`. These are **observed implementation shapes, not endorsed future public API**.

**HTTP Create:** \`POST /api/specs\`, TypeBox \`CreateSpecRequestSchema\` rejects unknown body properties, success \`201\` with \`CreatedSpecSchema\`, unauthorized \`401/403\`, typed \`400/409/422/503\`; no Engine returns \`503\`. Existing tests: \`packages/specflow-runtime/test/specs/create.http.test.ts\`, \`packages/specflow/test/create-cross-transport.test.ts\`.

**HTTP Close:** \`POST /api/specs/:specId/close\` and \`POST /api/specs/:specId/worktree/close\` require operation ID and distinct per-Spec capabilities. Whole-branch integration additionally needs **project Git Integrate** permission, including retry/inspection paths. Success \`200\` for completed; nonterminal/conflict is specified as \`202\`; response is \`{operationId,specId,kind,status,stage,outcome?,conflictPaths?,scratchRetired?}\`. Preview routes return \`{operationId,specId,kind,location,integrationRequired}\`. Inspection routes return the projected Close result, not the raw journal; no found operation returns \`404\`. Reconciliation requires \`confirmedNoActiveGitProcess: true\`. Authentication errors \`401/403\`, typed \`400/404/409/422/503\`. Existing tests: \`packages/specflow-runtime/test/specs/close.http.test.ts\`. Do not mislabel the schema's \`202\` path as observed PASS until a conflict case is executed.

**Comparison rule:** For a deliberately approved breaking pre-release change, snapshot the _new_ intended shape and update all consumers atomically. There is no promise of backward compatibility.

## Verification to attach before Q00 independent ACCEPT

Run with **Node >=24.20.0 <25**, pinned pnpm lockfile and real Git:

\`\`\`sh
git rev-parse HEAD
node --version && git --version && pnpm --version
pnpm --filter @nevo/specflow-engine exec vitest run test/quality-hardening-q00-journals.test.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @nevo/specflow-engine test:unit
pnpm --filter @nevo/specflow-engine test:filesystem:full
pnpm --filter @nevo/specflow-runtime test
pnpm --filter @nevo/specflow test
\`\`\`

The PR branch's temporary T17 platform workflow currently covers full Engine and CLI/Runtime tests on Ubuntu, Windows and macOS; permanent PR CI runs a smaller set. Execute/check each job **on the Q00 commit SHA**, and separately preserve T17 ownership and its LC01–LC40 acceptance. For every run record exact SHA, OS, versions, counts, FAIL/SKIP, logs, journal stage, physical evidence and whether retries mutate. A queued check is not PASS.

**Local authoring environment at baseline drafting:** Linux container, Node v22.16.0, Git 2.47.3, pnpm unavailable; this environment cannot run repository-supported Node 24 tests. **No local PASS claims.** Independent review of fixture adequacy and current-SHA platform execution are still pending. Q01 is not yet authorized as ACCEPT-dependent work.
