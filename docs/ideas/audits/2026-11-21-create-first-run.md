---
id: ideas.audits.2026-11-21-create-first-run
type: reference
title: Create and first-run verification for UX package B
status: draft
scope: specflow
areas: [ui, testing]
tags: [audit, first-run, create]
read_when:
  - reviewing UX package B issue 182 and its reproduction evidence
summary: >
  Current-main reproduction, before/after decisions and verification evidence for the
  Create and first-run follow-ups from the November 16 audit. Evidence, not a second UX contract.
related:
  - product.specflow.specification-creation
  - product.specflow.ui.specs-overview
  - product.specflow.ui.documentation-reader
---

# Create and first-run verification

Evidence for [#182](https://github.com/dczerwinskipl/nevo-specflow/issues/182), against
`fdc77086eb444a14d22ddb154b73c810e8dc2f75` (current main at investigation, includes #190).
The [historical audit](https://github.com/dczerwinskipl/nevo-specflow/blob/2f85e58d25ac9538f28e83fd59abf97e56553afd/ux-audit/findings.md)
was rechecked in disposable real projects using the built CLI, separate from the owner's dogfood instance.
The [baseline matrix](2026-11-21-create-first-run/baseline-matrix.txt) predates product edits.
The [initial proposal](2026-11-21-create-first-run/proposal.html) is historical design evidence:
the owner subsequently requested shorter blockers and technical details behind a drawer.
The final product follows the owning product contracts, not this prototype.

## Per-finding disposition

| Audit | Verified baseline / decision                                                                                        | Final change                                                                                                                                                                                                                                                                                                                                                                           | Disposition      |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| #2    | Empty list offered Create despite no usable archetypes.                                                             | Short blocker, How to fix it? details and Refresh from the existing catalogue. Missing, invalid, pending, failed and denied reads stay distinct.                                                                                                                                                                                                                                       | Fixed            |
| #3    | Missing name hid the actual missing-definitions blocker by submit.                                                  | Availability precedes input. Final owner direction puts one compact blocker and details trigger under the disabled Archetype field, with no footer duplicate; the unavailable CTA references that inline reason. Missing definitions install with --add-missing; invalid definitions validate/repair. Failed refresh retains draft and exposes Retry, with conditional focus recovery. | Fixed            |
| #4    | Disabled New workspace named no setting.                                                                            | Explain git.enabled: true in Project Home .nevo/config.yaml, commit and refresh. Engine checks and three cards preserved.                                                                                                                                                                                                                                                              | Fixed            |
| #12   | Absent docs directory named only docs.root.                                                                         | Create the actual configured root and metadata-bearing Markdown, or configure an existing folder; Refresh. Verified default and custom handbook root, then read a valid document.                                                                                                                                                                                                      | Fixed            |
| #14   | Existing NotStartedBare routed story already covers no goal, Sessions disabled and baseline documents.              | Verified actual no-goal first run at all required widths.                                                                                                                                                                                                                                                                                                                              | Already resolved |
| #16   | Ordinary start had feedback, but responsive remount lost pending state while the actual request remained in flight. | Native subject-scoped mutation cache preserves pending through authoritative refresh and preserves refusal after remount; retry clears old errors.                                                                                                                                                                                                                                     | Fixed            |
| #25   | Sessions-off copy lacked an enabling location.                                                                      | Shared project-maintainer guidance names sessions.enabled: true, .nevo/config.yaml, restart and allowed/ready provider. Other Sessions work stays with #184.                                                                                                                                                                                                                           | Fixed            |
| #32   | One-item classified groups have disclosure; statusless projects use a flat list.                                    | Keep expanded-by-default classification headings and uniform disclosure as rows change. No count-dependent layout.                                                                                                                                                                                                                                                                     | Not planned      |
| #34   | Actual completion page and toast repeated success.                                                                  | Remove only the project Create toast; keep result page and meaningful uncommitted-files warning from #173.                                                                                                                                                                                                                                                                             | Fixed            |
| #36   | Owner Q1 already selects configured default, else sole option, else deliberate choice.                              | Retain rule; fix stale no-default comment. Catalogue order implies no preference.                                                                                                                                                                                                                                                                                                      | Already resolved |

## Responsive evidence

All captures are actual product renders. EN and PL, reduced motion, keyboard and touch were checked
at 320, 390, 834 and 1440 px where relevant. Final screen evidence is embedded in
[PR #192](https://github.com/dczerwinskipl/nevo-specflow/pull/192) as GitHub attachments.
No screenshots are stored in the repository or the PR commit history.

| Final screen                              | Attachment                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Create — 320 px                           | [View](https://github.com/user-attachments/assets/c1f37c3e-9147-42d5-be40-1b1dec1f16e8) |
| Create — 390 px                           | [View](https://github.com/user-attachments/assets/b9acbd1e-b955-4926-8364-023cb2741fb6) |
| Create — 834 px                           | [View](https://github.com/user-attachments/assets/b5b7d257-4a6b-40a3-ba28-703c353e2d32) |
| Create — 1440 px                          | [View](https://github.com/user-attachments/assets/a15835d4-c9bd-4498-a9c7-3f9dff4d0d42) |
| Archetype help — phone                    | [View](https://github.com/user-attachments/assets/274d981b-b724-468e-b70a-b0d2238b8726) |
| Invalid definitions — phone               | [View](https://github.com/user-attachments/assets/52a5fda6-7fad-4b43-aef2-820a59ce4010) |
| Documentation absent                      | [View](https://github.com/user-attachments/assets/3f878323-e158-470f-b223-368788cc1713) |
| Sessions disabled                         | [View](https://github.com/user-attachments/assets/7f73872e-17a2-41ab-8993-c144e1987d4d) |
| Workflow pending after responsive remount | [View](https://github.com/user-attachments/assets/a88d5b75-e690-4a31-b7f3-f3eaa25ed5bb) |
| Create completed — current folder         | [View](https://github.com/user-attachments/assets/99469433-f805-404d-b424-52e93c3910eb) |
| Create completed — new workspace          | [View](https://github.com/user-attachments/assets/edf4d105-8c28-4c09-9ac0-0abc958b578e) |

The [evidence manifest](2026-11-21-create-first-run/evidence-manifest.json) records archived
file hashes and final attachment URLs. The complete original series, including before captures,
is preserved outside the repository as `nevo-182-audit-full-cb396e8f.zip` (19,890,826 bytes),
SHA-256 `ace8cfdfc3a24994c513cb7d6cba0df77968d7a588b11f1f8037591305bb71dd`.
Its per-file checksums and archive integrity were verified before pruning.

The [initial disclosure report](2026-11-21-create-first-run/after/disclosure-report.json) records
32 list/form cases before the final inline refinement. The [final inline report](2026-11-21-create-first-run/after/inline-report.json)
records 16 real missing/invalid cases across EN/PL and all four widths: other fields remain editable,
the footer does not repeat the blocker, the unavailable CTA references its inline explanation,
keyboard activation opens the instruction, and Escape restores focus. Technical commands stay in
the established responsive details surface.

Additional real integration evidence: [current-directory and managed Create](2026-11-21-create-first-run/after/create-report.json),
[Workflow pending and outcomes](2026-11-21-create-first-run/after/workflow-report.json),
[Workflow failure/retry](2026-11-21-create-first-run/after/workflow-retry-report.json),
[failed catalogue refresh and keyboard recovery](2026-11-21-create-first-run/after/catalogue-refresh-report.json),
[custom-root document read](2026-11-21-create-first-run/after/docs-read-report.json).
Workflow uses actual held HTTP requests and actual successful mutations; controlled network failure
is explicitly synthetic. No paid provider was called. Initial Overview composition cancelled reads
were immediately replaced by successful reads, with no browser exception; see the
[event timings](2026-11-21-create-first-run/after/overview-teardown-events.json).

## Checks and review

Baseline UI: 285 files / 2341 tests passed. Final pre-disclosure suite: 288 files / 2361 tests
passed; the updated list/form disclosure integration cases also passed (31 tests).
The new route missing/invalid regressions failed against baseline (2 expected failures); the
pending-remount regression also failed against baseline (1 expected failure), proving sensitivity.

The first Windows full suite had a 5000 ms ManagedSession.scrollPosition timeout and one obsolete
workspace-copy assertion. The copy assertion was corrected. The unchanged scroll test passed in
isolation and the complete later suite passed; this does not prove the original timeout's cause.
Initial documentation check failures were caused by CRLF introduced during edits; repository LF
was restored. Initial Storybook failures were obsolete exact-copy expectations, corrected explicitly.

Independent proposal and implementation reviews were performed, with prior rationale exposure
(nonblind). Final implementation review found two P2 recovery defects, both fixed and rechecked
independently in the actual app. The last owner-directed short-copy/drawer refinement was self-verified;
a fresh blind review was attempted but the reviewer could not run because of the service usage limit.
Do not describe that unperformed first-read as completed.

Final local check and PR CI outcomes are reported in the PR. A whole-repository Linux pnpm check
failed while loading the Figma registry (missing built contracts/sessions), cancelling parallel test
jobs; isolated registry suites passed on both baseline and changed trees. The same missing-module failure was reproduced on unchanged baseline with concurrent CLI/Figma tests; isolated suites pass on both trees. Root cause remains unproven. Tracked separately in [#191](https://github.com/dczerwinskipl/nevo-specflow/issues/191). No unrelated fix or test bypass was added.

## Documentation and scope

Updated owning Create, Specifications, Documentation, Overview and Sessions contracts; generated docs
index refreshed. Engine/domain, CLI/API and authorization semantics are unchanged. #151 / #190
committed-base checks and dropdown design were not reimplemented. No agent/Ask agent feature or
unrelated #183/#184/#169/#189 scope was introduced. Sessions follow-ups remain with
[#184](https://github.com/dczerwinskipl/nevo-specflow/issues/184). No new architectural problem was
silently absorbed. The owner accepted the final UX and code review with one P2 evidence-volume cleanup. That cleanup
moves final screens to PR attachments, removes all repository screenshots, and leaves the accepted product implementation unchanged.
This work does not merge the PR or close #182.
