---
id: ideas.audits.documentation-maintainability-2026-11-22
type: engineering
title: Current-document maintainability audit and refactor ledger
status: draft
scope: repo
areas: [docs, testing]
read_when:
  - reviewing the documentation maintainability refactor PR stack
  - planning follow-up audits of long current documents and retrieval benchmarking
summary: >-
  Evidence and disposition ledger for the Create, Task, document-engine, workflow and UI documentation split, with deferred review candidates and unverified retrieval requirements.
related:
  - ideas.documentation-maintainability
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specification-documents
  - architecture.workflow.workflow-kernel
  - reference.cli.nevo-specflow-docs
---

# Documentation maintainability audit

**Status:** retrospective audit of the completed #201/#203/#204/#205 stack and
follow-up readability work (#209/#210), against `main` at
`7b91ebcb20047aba7295d735e88f6a1072805873`. This is a **draft audit record**, not
an authoritative system contract. GitHub issues [#206](https://github.com/dczerwinskipl/nevo-specflow/issues/206)
and [#207](https://github.com/dczerwinskipl/nevo-specflow/issues/207)
own remaining investigation and the measured retrieval benchmark, respectively.
[#202](https://github.com/dczerwinskipl/nevo-specflow/issues/202) already owns demo API convergence.

## Confirmed defects and corrections

| Source `current` document            | Confirmed problem                                                                                                                  | Disposition and preserved contract                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runtime/specification-lifecycle.md` | Create/Close/integration and manual Create recovery intertwined; headings include owner dates and PR chronology                    | #203: short stable-ID entry; Create, Specification Close, Worktree integration and Engineering operator recovery; immutable intent, verified Git effects, journal, CAS rebind and explicit refusals retained |
| `runtime/task-read-composition.md`   | Obsolete `#60`/`#53` commit snapshot and a separate migration readiness section compete with implemented behavior                  | #203: remove historical baseline; retain Task/Engine/Runtime ownership, authorization, source ports and coherence; link to existing paging/grouping owner                                                    |
| `runtime/specification-documents.md` | ~93 KB mixes manifest, catalogue, validation, byte limits, queue claims and manual commit/recovery; limit table has padded columns | #204: focused manifest/registry, definitions, single limits table, durable writes/queue, commit policy/ledger; leave explicit invariants on hub                                                              |
| `workflow/workflow-kernel.md`        | ~73 KB puts Task resources, gates, attempts, continuation, attention and storage in one retrieval unit                             | #204: five topic owners plus short stable-ID hub; retain state transitions, actors, Task guards, attention, Run journal and recovery                                                                         |
| `ui/documentation-reader.md`         | ~60 KB combines product navigation, ranking and result UI, rendering, state tables, implementation notes and historical decisions  | #205: navigation, search, layout/states, short hub; unimplemented device/ranking considerations moved to Ideas                                                                                               |
| `ui/documents-archetypes-ui.md`      | ~54 KB combines document tree, Create archetypes, tab states, state matrix and discussions of terminology                          | #205: tree, archetypes, cross-screen states; existing editor mode owns tab states                                                                                                                            |
| `ui/application-architecture.md`     | ~39 KB mixes React application composition/Runtime ports with product routes, authentication, localization and feature detail      | #205: architecture composition and product navigation/auth owners; the old ID is a useful route map                                                                                                          |

Sizes are from the #201 snapshot or rounded source observations, not a token benchmark. The original
sections were reassigned as whole blocks wherever possible to minimize accidental deletion of
refusal and recovery guarantees. Moving text does **not** itself prove agreement with implementation.
Source-code comparisons and CI are separate validation gates.

## Documentation authority map

| Contract                                                | Primary owner                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Public HTTP methods, DTOs and response status           | TypeBox / generated OpenAPI from #201, never expanded back into Markdown                                          |
| Specification Create/Close, Git integration, CAS        | `architecture/runtime/specification-{create,close,worktree}*.md`                                                  |
| Interrupted Create operator recovery                    | `engineering/shared/specification-create-recovery.md`                                                             |
| Registry, archetypes, identity and validation           | `architecture/runtime/document-{manifest-and-registry,definitions}.md`                                            |
| Byte and queue limits                                   | `architecture/runtime/document-limits.md`                                                                         |
| Durable document writes and commit queue                | `architecture/runtime/document-write-and-commit-queue.md`                                                         |
| Commit policy, manual ledger and workflow-state commits | `architecture/runtime/document-commit-policy.md`                                                                  |
| Workflow Tasks, gates, continuation and journal         | `architecture/workflow/workflow-{tasks,definitions-and-gates,continuation-and-attention,storage-and-recovery}.md` |
| Reader routes, search and rendering                     | `product/specflow/ui/documentation-reader-{navigation,search,layout-and-states}.md`                               |
| Document tree, Create and editing                       | `product/specflow/ui/documents-tree.md`, `create-archetypes.md`, `documents-editor-mode.md`                       |

## P2 and non-size-only follow-ups

The corpus inventory identified these additional large `current` documents for review in #206.
They are **not confirmed defects merely by size**, and the absence of changes is not approval:

| Candidate                                               | Approx. bytes before refactor | Audit question                                                                |
| ------------------------------------------------------- | ----------------------------: | ----------------------------------------------------------------------------- |
| Design system React component guidelines                |                        66,651 | Are individual component recipes independent retrieval owners?                |
| Design system Secondary navigation                      |                        49,388 | Can API, sizing and product-specific examples be separated?                   |
| Specification creation Product                          |                        42,056 | Is error handling duplicated with Engine and OpenAPI?                         |
| Design system dynamic workspace split                   |                        40,034 | Can API/transition rules be found without reading implementation history?     |
| Session storage/lifecycle Architecture                  |                        28,180 | Are operator recovery and immutable history rules independently discoverable? |
| Workflow execution Product                              |                        28,611 | Is future Ask agent (E6) presented separately from current UX?                |
| Specification Overview Product                          |                        28,213 | Are row/group rules duplicated with Task read/grouping Architecture?          |
| Workflow workbench decisions Product                    |                        15,623 | Does a date-stamped `current` decision ledger duplicate canonical UI docs?    |
| Full Session Product, Engineering code organization, CI |                 25–29 KB each | Are these cohesive enough to leave intact?                                    |
| Long CLI / Configuration references                     |                      26–35 KB | Does section retrieval already make a split unnecessary?                      |

The #201 migration removes many oversized API Markdown references from the current source of truth.
Separate Demo transport remains accurate until #202 completes. History is appropriate in ADRs
and draft audit records, but not in authoritative behavior descriptions.

## Verification ledger

| Check                                               | Evidence / status                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PR #201 baseline and related issues                 | Checked: base head `e5adca56cfbb6c4b0839e6ee2a80c1f772174796`; #202 exists                                                          |
| Unique stable IDs and `related` references          | New documentation IDs added to both generated indexes; programmatic metadata scan reported no missing `related` IDs                 |
| Targeted moved Markdown link paths                  | Connector-based checks of newly split architecture and UI documents; does not substitute for full `docs:check`                      |
| Recovery and refusal text                           | Original Create, Close, Engine document and workflow sections retained in topic owners; code-level parity remains owner-review work |
| `pnpm docs:check`, generated index/fragments, CI    | Must pass on the **final reviewed SHA**; not claimed by this audit                                                                  |
| Retrieval relevance, fetched UTF-8 bytes and tokens | **Not measured**. #207 requires actual `docs:search` and `docs:get` runs on both worktrees, with invariant coverage per question    |

## Five retrieval acceptance questions

1. How to resume interrupted Create? Expect the lifecycle entry and operator recovery.
2. Specification Close versus Workspace/Worktree Close? Expect distinct archive and disposal contracts.
3. What prevents Task completion? Expect Task readiness, gates, wait/attention and explicit refusal rules.
4. How does the document commit queue recover? Expect leases, journal checkpoints, claims, retry/takeover and Git proof.
5. What bounds Session lifecycle? Expect Session storage and state/turn authority, not workflow task state.

`docs:search` returns ranked documents and up to three matching sections per hit; `docs:get --content`
reads whole non-reference documents and selective sections of reference documents. Ranking may be
lexical or hybrid and corpus/index freshness matters. A count of Markdown lines or the size
of an entry-point file is **not** equivalent to measured token savings.

## Current-document readability inventory (2026-11-23)

Scope: every Markdown file under Architecture, Product, Engineering, Design System and Reference
with `status: current` at the pinned `main` revision above. Current ADRs and README
navigation files are included; decision chronology belongs in ADRs by design. The audit is based on **full text**, not file
size alone. A >100-word paragraph or >120-word bullet is a **review signal**, not a policy failure.

Disposition: **Keep** means no structural readability finding in this pass; **Reformat**
means a long or mixed rule needs clearer presentation; **Deduplicate** requires an authority
check; **Move history** means non-current material should move to Ideas/ADR; **Split** is
reserved for an independently owned subject. An unverified source-code contract is never
silently treated as verified. The `Check` column records editorial parity where performed,
not code-level agreement. All final link, index, source parity and retrieval checks remain
tracked by #206/#207 until evidenced on the final PR HEAD.

| Current document and primary owner | Disposition | Evidence or follow-up | Check |
| --- | --- | --- | --- |
| `architecture/README.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/ai/README.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/ai/canonical-session-turn-work.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/ai/provider-boundary.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/ai/provider-process-ownership.md` | Reformat | 0 long paragraphs; 1 long bullets; max section 289 words | code check pending |
| `architecture/ai/session-admission-and-providers.md` | Reformat | 4 long paragraphs; 1 long bullets; max section 537 words | text parity #209 |
| `architecture/ai/session-association-and-list.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 299 words | text parity #209 |
| `architecture/ai/session-commands.md` | Reformat | 2 long paragraphs; 1 long bullets; max section 446 words | text parity #209 |
| `architecture/ai/session-history-and-events.md` | Reformat | 5 long paragraphs; 0 long bullets; max section 426 words | text parity #209 |
| `architecture/ai/session-storage-and-lifecycle.md` | Reformat | 11 long paragraphs; 2 long bullets; max section 545 words | code check pending |
| `architecture/ai/session-telemetry-observations.md` | Reformat | 0 long paragraphs; 4 long bullets; max section 409 words | text parity #209 |
| `architecture/decisions/0001-record-architecture-decisions.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/decisions/0003-branch-and-release-model.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 377 words | code check pending |
| `architecture/decisions/0004-mit-license.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/decisions/0005-repository-tooling-is-separate-from-the-product-api.md` | Reformat | 0 long paragraphs; 1 long bullets; max section 135 words | code check pending |
| `architecture/decisions/0007-documentation-architecture-and-taxonomy.md` | Reformat | 1 long paragraphs; 0 long bullets; max section 277 words | code check pending |
| `architecture/decisions/0008-product-naming-and-surfaces.md` | Keep | no overlong paragraph/bullet found | code check pending |
| `architecture/decisions/0009-product-package-build-model.md` | Reformat | 0 long paragraphs; 1 long bullets; max section 470 words | code check pending |
| `architecture/decisions/0010-toolchain-policy-and-version-sources.md` | Reformat | 0 long paragraphs; 1 long bullets; max section 194 words | code check pending |
| `architecture/decisions/0011-product-artifact-packaging-and-pnpm-compatibility.md` | Reformat | 0 long paragraphs; 1 long bullets; max section 187 words | code check pending |
| `architecture/decisions/0012-product-package-topology-and-dependency-direction.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 501 words | code check pending |
| `architecture/decisions/0013-engine-owned-commits-and-protected-branches.md` | Reformat | 0 long paragraphs; 3 long bullets; max section 939 words | code check pending |
| `architecture/decisions/0014-feature-owned-operation-lists.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 286 words | code check pending |
| `architecture/decisions/0015-specification-manifest-as-document-registry.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 582 words | code check pending |
| `architecture/decisions/0016-engine-owned-document-commits.md` | Reformat | 1 long paragraphs; 5 long bullets; max section 2830 words | code check pending |
| `architecture/decisions/0017-definitions-as-project-data.md` | Reformat | 1 long paragraphs; 2 long bullets; max section 850 words | code check pending |
| `architecture/decisions/0018-engine-commit-policy-and-manual-commit.md` | Reformat | 1 long paragraphs; 3 long bullets; max section 2089 words | code check pending |
| `architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md` | Reformat | 0 long paragraphs; 2 long bullets; max section 604 words | code check pending |
