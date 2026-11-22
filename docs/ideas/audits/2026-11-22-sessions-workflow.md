---
id: ideas.audits.2026-11-22-sessions-workflow
type: product
title: Sessions and workflow follow-ups — issue 184
status: draft
scope: specflow
areas: [ui]
tags: [audit, ux, sessions, workflow]
read_when:
  - reviewing the disposition and verification of issue 184
summary: Current-main verification of the Sessions and workflow observations from audit 168.
---

# Sessions and workflow follow-ups

Delivery evidence for [#184](https://github.com/dczerwinskipl/nevo-specflow/issues/184),
starting from `a197d1408db8c26786650a4c74b8f763203d0c13`. Historical observations are evidence,
not requirements to reintroduce obsolete behavior. Screenshots and raw probe results stay outside Git.

## Findings before implementation

| Finding                   | Current evidence                                                                                                                                          | Proposed resolution                                                                                                  | Status                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| #25 Sessions disabled     | #192 delivered project-owner enabling guidance and verified it in the application.                                                                        | Recheck the existing state; preserve project/workstation policy.                                                     | Previously fixed; recheck pending                  |
| #26 Demo Session          | Real demo detail now includes the request and a consistent read-only notice; no failed HTTP responses in the probe.                                       | Verify input-required and working examples and stream lifetime.                                                      | Investigation                                      |
| #27 Phone controls        | Real demo header clears the first message. Managed Session stories explicitly use Polish fixtures; their first message begins below the header at 390 px. | Check scrolling and touch/keyboard behavior at narrow widths; preserve the shared navigation contract.               | Investigation                                      |
| #43 Demo start            | Unavailable provider description is English in the English app. Composer still says “Choose the agent” after a provider and model are selected.           | Replace the inactive composer's instruction with the actual remaining action: start the Session.                     | Reproduced                                         |
| #29 Close story           | Overview and Tasks now agree. Opening Close through the header menu names workflow, Tasks, pending writes and a running Session; no ready-to-close claim. | Verify the existing dialog stories and add coverage only if a gap remains.                                           | Previously fixed; coverage check pending           |
| B8 Session identity       | Real demo start replaces the URL with `/sessions/:id`, preserves the entered title and shows the provider-ready state.                                    | Verify project mode and unnamed/renamed cases; preserve intentional owner naming.                                    | Demo verified; project check pending               |
| B9 Cost and limits        | Current UI has per-dimension telemetry status and a limits refresh command; provider protocol tests cover native cumulative cost.                         | Verify updates and stale/unavailable readings without using paid providers or inventing estimates.                   | Investigation                                      |
| B10 Finish attachments    | Specification composition supplies only document titles; the dialog's menu has no filename or text search. Task attachments already use paths.            | Show title plus filename/path and support lookup by either, using the shared searchable control.                     | Source confirmed; application reproduction pending |
| B11 Review labels         | Shipped workflows now supply “Approved” and “Changes requested”; the UI prefers the declared label.                                                       | Verify real projection and dialog; retain custom workflow labels.                                                    | Previously fixed; application check pending        |
| B13 Worktree dependencies | A Git worktree contains tracked source, not ignored dependency directories. #169 explicitly excludes automatic setup.                                     | Verify the current lifecycle and document the project-specific setup remedy; do not execute arbitrary install hooks. | Triage pending                                     |

## Intended interaction for confirmed changes

- Before Session start, the form owns provider/model selection and Start. The inactive Composer
  explains that starting the Session enables messaging; it does not repeat a completed selection.
- Finish attachments answer “which document?” with its title, then filename/path. Lookup must match
  either. Selecting a document attaches its unchanged reference; removing it makes it selectable
  again. The existing Finish command continues to own submission and pending state.
- Use existing design-system controls. No new screen abstraction or workspace setup behavior.

## Final dispositions

| Finding | Disposition                                                   | Verification and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #25     | Already resolved by #192                                      | Actual project with Sessions off at 390/834/1440 px identifies `sessions.enabled: true`, `.nevo/config.yaml`, restart and an allowed, ready provider. No overflow.                                                                                                                                                                                                                                                                                                                     |
| #26     | Already resolved by #173                                      | Actual demo's working and input-required Sessions contain their request and the corresponding Work/interaction. Read-only controls agree with capability state. Both loaded without failed HTTP responses and opened one healthy SSE connection. The persistent heartbeat deliberately prevents network idle; snapshot readiness is the completion criterion.                                                                                                                          |
| #27     | Changed by design                                             | Preserve the established shared floating-navigation contract. After the header scrolls out, controls overlay passing content; this is not a claim of zero overlap. Initial content clears the header. Shared scroll padding protects focus/anchor destinations. Actual long project Session checked at 320/390/834/1440 px without horizontal overflow. Story fixtures deliberately use Polish, while the app follows its selected locale.                                             |
| #43     | Fixed                                                         | The inactive Composer now says “Start the session to send a message”, in English and Polish. It no longer asks for a provider already selected. The demo's unavailable provider reason was already localized correctly.                                                                                                                                                                                                                                                                |
| #29     | Already resolved by #173 and later Close work                 | Overview and Tasks agree; opening the blocked Close dialog names the running Session, unfinished workflow/Tasks and pending write. Current Close stories cover the distinct outcomes, including unavailable checks and failures.                                                                                                                                                                                                                                                       |
| B8      | Fixed remaining misleading copy; route/title already resolved | Real demo start replaces the URL and displays the entered Session name. The actual project Session read displays its persisted name. Blank-name copy no longer promises automatic agent naming: it says the owner can name the Session later. No naming feature or new agent behavior added.                                                                                                                                                                                           |
| B9      | Not reproduced in current controlled flow                     | Native cost/usage decoding, persistence and invalidation tests pass. An explicit UI-store regression verifies cost changes from `0.3489` to `0.52` with increasing usage while limits remain independently stale; rendered stale readings and limits refresh are covered. A stale account limit is not evidence that Session cost is stale. No estimate is invented. A live paid-provider account was not exercised; this does not establish the cause of the historical frozen value. |
| B10     | Fixed                                                         | Actual Finish previously offered only the Specification title for `overview.md`. The shared Combobox now matches title/path, displays both, preserves the reference, excludes attached options and restores them on removal. Attached rows distinguish duplicate titles. Keyboard selection does not submit Finish. Last-item focus, removal, Escape, reopening, Polish and long paths at 320 px are verified.                                                                         |
| B11     | Already resolved by #173                                      | Current shipped review transitions declare “Approved” and “Changes requested”; the UI prefers these labels. Review dialog tests verify them. Custom project labels remain authoritative; no UI inference from `pass`/`fail` added.                                                                                                                                                                                                                                                     |
| B13     | Intended current lifecycle; remedy documented                 | A disposable Git worktree retains tracked `package.json` but omits ignored dependencies. The Engine's workspace owner creates the Git checkout, not an installed environment. Run the project's documented install/build setup there before tests (for this repository, frozen dependency installation and the applicable workspace builds). Automatic provisioning remains outside #169 and this UX package; no install hook, agent behavior or new follow-up issue introduced.       |

### Necessary shared-control correction

The attachment lookup exposed a real integration defect: React Aria's portalled list inherited
Radix modal pointer blocking. Registering that existing portal as a Radix dismissable layer keeps
options clickable/tappable and makes Escape belong to the list before the Dialog. The dependency
was already pinned transitively; only its direct declaration was added, without changing versions.
The same interaction is verified in the shared Combobox's own Dialog contract story.

## Verification evidence

- Actual project attachment selection/removal and prepared Session start: 320/390/834/1440 px,
  with emulated touch at 320/390 and keyboard interaction on the wider layouts. References remain
  unchanged. The lookup returns focus after removal and the last option has a useful focus target.
- Actual project long Session: the persisted title, readable conversation, initial/scrolled layout,
  and no horizontal overflow at the same widths, using only the controlled no-effect mock.
- Actual Sessions-off guidance: 390/834/1440 px. Actual demo working/input-required states: 390 px.
- Targeted Storybook contracts include attachment lookup, duplicate titles, long paths at 320 px,
  nested modal interaction, reopening, Session start and Close. Product and shared-control tests
  retain accessibility checks and restore the overlays/viewport they open or change.
- Targeted UI suites, including the 95-case workflow/start/telemetry set and the 75-case
  start-handoff/telemetry integration set, passed; these overlap and are not added into a new total.
  Native protocol/lifecycle/persistence telemetry: 100 tests passed. No live AI account was used.
- Independent proposal and final responsive UX review: no material findings. Independent actual-diff
  code review: no blocking finding at review time; the delivery PR records the final recheck and CI.
  Reviews were informed by the supplied rationale, not blind first-read reviews.
- Initial browser tests exposed modal pointer blocking and nested Escape; both were fixed. Other
  initial failures were incorrect test labels, assertions while the popup hid the rest of the dialog,
  and a test option type mismatch; these were corrected rather than labelled unrelated flakes.
- Full-repository verification, final HEAD, CI and the hosted Storybook review artifact are recorded
  in the delivery PR linked from #184. Screenshots and raw reports remain outside Git.

No Engine/Runtime production behavior, CLI/API shape, authorization, workspace-card layout or
Run with agent implementation was changed. All confirmed in-scope defects are handled here; no new
issues are required to complete the dispositions above.
