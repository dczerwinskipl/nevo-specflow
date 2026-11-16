---
id: ideas.audits.2026-11-16-ui-ux-audit
type: product
title: UI/UX audit of Nevo SpecFlow, 2026-11-16
status: draft
scope: specflow
areas:
  - ui
  - workflow
tags:
  - audit
  - ux
  - evidence
  - screenshots
read_when:
  - triaging UI/UX findings for the Specifications list, Create, Overview, Tasks, Documents, Sessions, workflow actions, navigation or the documentation reader
  - planning UX fixes and wanting screenshot evidence across desktop, tablet and phone
summary: >
  Evidence, not rules: a screenshot audit of the SpecFlow UI at commit e0fd4d33 across the demo
  app, an empty project and Storybook on four devices, with 49 findings ranked by impact and nine
  scenario pages. The 949 screenshots live on the review-only branch ux-audit/2026-11-16.
related:
  - ideas.specflow-ui
  - ideas.audits.2026-11-16-agent-e2e
---

# UI/UX audit of Nevo SpecFlow, 2026-11-16

Evidence only. Nothing here is a requirement; a finding becomes work only once it is accepted and
promoted into the relevant product or design-system document.

Each scenario below has its own page with every step captured per device. The images are on the
review-only branch [`ux-audit/2026-11-16`](https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/README.md), pinned to commit `9ddf6421`;
that branch is never merged. Click a thumbnail for the full image.

- **Date:** 2026-11-16
- **Commit:** `e0fd4d33` (head of PR #163, “fix(tasks): name every Overview summary Task by id and title”), detached worktree, `pnpm install` + `pnpm turbo run build --filter=@nevo/specflow...`.
- **Purpose:** evidence only. Nothing in the product was changed. The live dogfood Runtime on :4318 was not touched.

### Environments

| Env tag      | How it was started                                                                                                                                                                                                                                                                                                         | Data                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `real-demo`  | `C:/Users/domin/nevo-verify/ux-audit/env-demo`: `git init`, `.nevo/config.yaml` = `nevo-specflow.example.yaml` with `runtime.server.port: 4319` (auth none), `.nevo/local/config.yaml` with `runtime.authentication.localUserId: demo-user`, committed; then `node <worktree>/packages/specflow/dist/bin.js start --demo`  | Built-in demo data. Session pages and project Documentation cannot load in demo. |
| `real-empty` | `C:/Users/domin/nevo-verify/ux-audit/env-empty`: same config files with port 4320, committed, `nevo-specflow project bootstrap`, then `start` (not demo). Later `definitions install` (committed), Specifications created and driven through the UI, a few steps through the CLI, a small `docs/` folder added at the end. | Zero Specifications at first; one, then two. Managed Sessions disabled.          |
| `storybook`  | `storybook build` of `tools/storybook` into `ux-audit/sb-static`, served by `scripts/serve-static.mjs` on 127.0.0.1:6006                                                                                                                                                                                                   | Story fixtures (SpecFlow/Screens/*).                                             |

The exact order of mutations is in [`scripts/steps-e*.mjs`](https://github.com/dczerwinskipl/nevo-specflow/tree/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/scripts) and the CLI calls in the S03/S07 preconditions. Repeat a capture with `node scripts/capture.mjs scripts/<steps file> [filter-regex]`, then `node scripts/build-docs.mjs`.

### Devices

| Tag         | Viewport           | Notes                           |
| ----------- | ------------------ | ------------------------------- |
| desktop     | 1440×900           | mouse                           |
| tablet      | 834×1112 portrait  | touch, isMobile                 |
| tablet-land | 1112×834 landscape | touch, isMobile (real app only) |
| phone       | 390×844            | touch, isMobile                 |

All shots at deviceScaleFactor 2, dark colour scheme, `en-US`. File names: `shots/<scenario>/<env>-<device>-<step>.png`; `-full.png` is the full-page variant. Steps marked “(mutation)” were done once, on desktop only.

### Scenarios

| Scenario                                                                                                              | Real-app shots | Storybook shots | Observations |
| --------------------------------------------------------------------------------------------------------------------- | -------------- | --------------- | ------------ |
| [S01-first-run: First run: Specifications list and Documentation home](2026-11-16-ui-ux-audit/S01-first-run.md)       | 56             | 15              | 4            |
| [S02-create: Creating a Specification](2026-11-16-ui-ux-audit/S02-create.md)                                          | 44             | 21              | 7            |
| [S03-overview: Specification Overview through its lifecycle](2026-11-16-ui-ux-audit/S03-overview.md)                  | 113            | 33              | 12           |
| [S04-tasks: Tasks page and Task detail](2026-11-16-ui-ux-audit/S04-tasks.md)                                          | 107            | 21              | 4            |
| [S05-documents: Documents: list, reader, side panel, editor](2026-11-16-ui-ux-audit/S05-documents.md)                 | 48             | 18              | 4            |
| [S06-sessions: Sessions](2026-11-16-ui-ux-audit/S06-sessions.md)                                                      | 24             | 24              | 4            |
| [S07-workflow-actions: Workflow actions: Finish step, Close, Abandon](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | 73             | 18              | 7            |
| [S08-navigation: Navigation: menu, back stack, switching Specifications](2026-11-16-ui-ux-audit/S08-navigation.md)    | 40             | 12              | 3            |
| [S09-docs-reader: Documentation reader and search](2026-11-16-ui-ux-audit/S09-docs-reader.md)                         | 36             | 27              | 4            |

Totals: 541 real-app captures and 189 Storybook captures (each above the fold, plus a full-page shot where the page scrolls): 949 PNG files. Ranked list: [Findings, ranked by impact](#findings-ranked-by-impact) below.

## Findings, ranked by impact

Deduplicated across scenarios. `*` in a screenshot name stands for every device captured; those
findings show one thumbnail per device.

| #                                   | Impact   | Scenario                                                               | Devices        | Finding                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------- | ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1](#1-critical--s07--all)          | critical | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | Close is a dead end in a project made from the example config: the dialog says “Ready to close”, and confirming shows “Close cannot start now — The workflow did not change. Try again.” next to the green “Ready to close”. The CLI names the real causes: untracked Specification files, then “requires explicit git.integrationTargetBranch configuration”. Neither appears in the UI. |
| [2](#2-high--s01--all)              | high     | [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md)               | all            | The empty-list state only offers “New specification”; with no archetype definitions installed the form it leads to cannot create anything (see S02). The list does not mention the missing definitions.                                                                                                                                                                                   |
| [3](#3-high--s02--all)              | high     | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | all            | With no definitions installed the footer only says “Enter a specification name. Go to the field”; the real blocker (no archetypes, a CLI command to run) sits mid-form as a small info line.                                                                                                                                                                                              |
| [4](#4-high--s02--all)              | high     | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | all            | “New workspace — Disabled in the project configuration.” gives no hint which setting enables it; with the example config this is the default for every new project.                                                                                                                                                                                                                       |
| [5](#5-high--s02--desktop)          | high     | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | desktop        | Create in the current folder leaves the new files untracked in git (`?? specs/`), but the progress page reports plain success. Storybook has a “Created but not committed” design that the real flow did not show. This later blocks Close (S07).                                                                                                                                         |
| [6](#6-high--s03--all)              | high     | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | The overview.md template sentence “Describe the intended outcome of this specification.” is shown as the Specification’s description under the title in every state, including Completed and Abandoned.                                                                                                                                                                                   |
| [7](#7-high--s03--all)              | high     | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | A Task put on hold (with a reason) does not appear under “Requires attention”; the Overview only lists it under an “On hold” group and the reason is not visible there.                                                                                                                                                                                                                   |
| [8](#8-high--s04--all)              | high     | [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md)                       | all            | The demo Task detail (State/Flow facts, “NEXT WORK — NOT STARTED”, “Related resources 14”) and the project-mode Task detail (NOW card, Documents, Context, Depends on) are two different screens for the same object.                                                                                                                                                                     |
| [9](#9-high--s07--all)              | high     | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | On a retry the “Close specification” confirm stays disabled for 8+ seconds with no explanation, then the same error appears without a click.                                                                                                                                                                                                                                              |
| [10](#10-high--s07--all)            | high     | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | Closing an abandoned Specification: the dialog shows a disabled “Close specification” and an empty gap where the check result should be, with no reason given.                                                                                                                                                                                                                            |
| [11](#11-high--s09--all)            | high     | [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md)           | all            | Plain Markdown files are all skipped (“missing frontmatter”); the required fields and allowed types are only revealed one error at a time, so a person fixes the same files several times before anything shows.                                                                                                                                                                          |
| [12](#12-medium--s01--all)          | medium   | [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md)               | all            | The Documentation home of a project without a `docs/` folder explains the setting in config terms (“the folder set as docs.root in .nevo/config.yaml”), with no action in the UI.                                                                                                                                                                                                         |
| [13](#13-medium--s02--desktop)      | medium   | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | desktop        | Progress step reads “Name and branch reserved” although “Current folder” creates no branch.                                                                                                                                                                                                                                                                                               |
| [14](#14-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Design vs real, not started: layout and wording match the “Overview early states / Not started” story. The story always has a written goal under the title and a Sessions section with “New session”; the real project without a goal and with Sessions disabled has neither, and that case has no story.                                                                                 |
| [15](#15-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Overview: “Tasks appear when the workflow reaches Break the solution down (step 4 of 7).” Tasks page at step 4: “Tasks appear when … (step 4 of 7) finishes. Create tasks with New task, also before the workflow starts.” The two texts disagree, and the Overview offers no “New task”.                                                                                                 |
| [16](#16-medium--s03--desktop)      | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | desktop        | After “Start …” the page kept showing “Ready to start” with a dimmed button for at least 2.5 s; no progress text.                                                                                                                                                                                                                                                                         |
| [17](#17-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Same person shown as “started by you” for UI actions and “started by domin” (OS user) for CLI actions.                                                                                                                                                                                                                                                                                    |
| [18](#18-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | All documents stay “Template only” through Completed; nothing on the NOW card links the empty documents to the step that should fill them.                                                                                                                                                                                                                                                |
| [19](#19-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Demo Overview has no NOW/workflow card at all, while the project-mode Overview leads with it; the demo is not representative of the real screen.                                                                                                                                                                                                                                          |
| [20](#20-medium--s03--all)          | medium   | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Task summary rows: demo shows the id twice (“TASK-07 TASK-07 · Uprawnienia…”); project mode shows “sign-in-screen Sign-in screen…” with no separator. On phone the line is cut with a trailing “...”.                                                                                                                                                                                     |
| [21](#21-medium--s04--all)          | medium   | [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md)                       | all            | Task detail shows internal tokens: step id in monospace (“· implement ·”), workflow name and “rev 1”.                                                                                                                                                                                                                                                                                     |
| [22](#22-medium--s04--tablet-phone) | medium   | [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md)                       | tablet, phone  | On tablet/phone the Task detail collapses Documents and Context into closed disclosures with “+” buttons, leaving most of the screen empty.                                                                                                                                                                                                                                               |
| [23](#23-medium--s05--tablet-phone) | medium   | [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md)               | tablet, phone  | On phone the Documents entry opens straight into overview.md; the file tree is only reachable through the header file switcher, and “Filter by type” could not be reached at tablet/phone widths.                                                                                                                                                                                         |
| [24](#24-medium--s05--tablet-phone) | medium   | [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md)               | tablet, phone  | The side panel opened from the Overview is 50/50 on desktop but becomes a full-screen page on tablet and phone, with the document title shown twice (header and H1).                                                                                                                                                                                                                      |
| [25](#25-medium--s06--all)          | medium   | [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md)                 | all            | “Sessions are turned off in this project.” is the whole page: no reason, no pointer to the setting, while the nav item stays visible.                                                                                                                                                                                                                                                     |
| [26](#26-medium--s06--all)          | medium   | [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md)                 | all            | Demo session page contradicts itself: header “Response required”, body “This session has no messages.”, footer “You can only view this session.” The page also never reaches network idle.                                                                                                                                                                                                |
| [27](#27-medium--s06--phone)        | medium   | [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md)                 | phone          | Storybook Full Session on phone: the floating round menu and “…” buttons sit on top of the conversation text at the top edge (text runs underneath them). The story renders in Polish (“Nie powiodło się: 1 uruchomienie testów”), unlike the English app.                                                                                                                                |
| [28](#28-medium--s07--all)          | medium   | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | The Close blockers dialog lists the workflow and unfinished Tasks well, but does not check uncommitted files, so it shows no blocker while files are still untracked.                                                                                                                                                                                                                     |
| [29](#29-medium--s07--all)          | medium   | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | Design vs real: the “Specification close blocked” story renders the Overview without the Close dialog open, and its fixture shows “Tasks 1 of 5 done” on the NOW card next to “No tasks yet” in the Tasks section. No story covers the “Close cannot start now” error seen in the real app.                                                                                               |
| [30](#30-medium--s08--all)          | medium   | [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md)             | all            | Switching Specification from the Tasks page opens the other Specification’s Overview, so the person loses the page they were on.                                                                                                                                                                                                                                                          |
| [31](#31-medium--s09--all)          | medium   | [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md)           | all            | Demo Documentation says “cannot be read right now … Try again in a moment” with Retry, although in demo it can never load.                                                                                                                                                                                                                                                                |
| [32](#32-low--s01--all)             | low      | [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md)               | all            | With exactly one Specification the list still renders full section headers with collapse chevrons (one row per section).                                                                                                                                                                                                                                                                  |
| [33](#33-low--s01--desktop)         | low      | [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md)               | desktop        | Demo list shows a “Sample data” label at the right of the tabs; nothing equivalent marks the real list.                                                                                                                                                                                                                                                                                   |
| [34](#34-low--s02--desktop)         | low      | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | desktop        | “Done. Opening the specification...” ends in a trailing ellipsis; a toast “Specification created” repeats the page heading.                                                                                                                                                                                                                                                               |
| [35](#35-low--s02--desktop)         | low      | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | desktop        | The new Specification URL uses a UUID (`/specs/f497511d-…`) while demo URLs use slugs (`/specs/admission`).                                                                                                                                                                                                                                                                               |
| [36](#36-low--s02--all)             | low      | [S02-create](2026-11-16-ui-ux-audit/S02-create.md)                     | all            | Archetype radios have no default; the documents list only appears after a choice (“Choose an archetype to see the documents Create makes.”).                                                                                                                                                                                                                                              |
| [37](#37-low--s03--all)             | low      | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Two “…” menus on the page (header “More actions” and NOW card “Workflow operations”) with different contents.                                                                                                                                                                                                                                                                             |
| [38](#38-low--s03--desktoptablet)   | low      | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | desktop/tablet | Breadcrumb middle item is the key in demo (“UI-1234”) and the title in project mode (“SSO sign-in”). Tablet portrait and phone drop the breadcrumb and show only “Overview”.                                                                                                                                                                                                              |
| [39](#39-low--s03--all)             | low      | [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md)                 | all            | Demo group labels are Polish (“Implementacja”, “Ukończone 5”) inside the English UI.                                                                                                                                                                                                                                                                                                      |
| [40](#40-low--s04--all)             | low      | [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md)                       | all            | New task dialog validation is inline and specific (“Use lowercase letters, digits and dashes…”).                                                                                                                                                                                                                                                                                          |
| [41](#41-low--s05--all)             | low      | [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md)               | all            | Tree order is alphabetical (overview, backend, behaviour, ux) while the Overview lists the same documents in archetype order (overview, behaviour, ux, backend).                                                                                                                                                                                                                          |
| [42](#42-low--s05--all)             | low      | [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md)               | all            | Editor mode shows the YAML frontmatter as the first lines of every document.                                                                                                                                                                                                                                                                                                              |
| [43](#43-low--s06--desktop)         | low      | [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md)                 | desktop        | New session (demo): “Local adapter” card text is Polish (“Niedostępny w tym środowisku demonstracyjnym.”); the composer placeholder says “Choose the agent and start the session” while an agent is already selected.                                                                                                                                                                     |
| [44](#44-low--s07--all)             | low      | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | Finish-step dialogs explain results and required feedback clearly; the confirm stays disabled and an inline error appears when feedback is missing.                                                                                                                                                                                                                                       |
| [45](#45-low--s07--all)             | low      | [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md) | all            | Abandon requires a reason (confirm disabled until filled); after confirming, the NOW card shows “Abandoned”, the reason and “Close specification”.                                                                                                                                                                                                                                        |
| [46](#46-low--s08--all)             | low      | [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md)             | all            | In the drawer the current Specification title is cut with a trailing “…” on every width (“Deterministic admission an…”).                                                                                                                                                                                                                                                                  |
| [47](#47-low--s08--tablet-phone)    | low      | [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md)             | tablet, phone  | Phone/tablet headers show a back arrow on Task and Document pages but a hamburger on Overview; tablet portrait drops the breadcrumb entirely.                                                                                                                                                                                                                                             |
| [48](#48-low--s09--all)             | low      | [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md)           | all            | Search snippets show raw Mermaid source (“U->>W: Open sign-in”).                                                                                                                                                                                                                                                                                                                          |
| [49](#49-low--s09--phone)           | low      | [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md)           | phone          | The skipped-files warning stays at the top above the search field on phone, pushing results down.                                                                                                                                                                                                                                                                                         |

### 1. Critical · S07 · all

Close is a dead end in a project made from the example config: the dialog says “Ready to close”, and confirming shows “Close cannot start now — The workflow did not change. Try again.” next to the green “Ready to close”. The CLI names the real causes: untracked Specification files, then “requires explicit git.integrationTargetBranch configuration”. Neither appears in the UI.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-desktop-17-close-confirmed, real-empty-*-18-close-retry-clean-checkout`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-17-close-confirmed.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-17-close-confirmed.png?raw=true" width="320" alt="real-empty-desktop-17-close-confirmed"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-desktop-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-tablet-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-tablet-land-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-phone-18-close-retry-clean-checkout"></a>
</p>

### 2. High · S01 · all

The empty-list state only offers “New specification”; with no archetype definitions installed the form it leads to cannot create anything (see S02). The list does not mention the missing definitions.

Scenario: [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md). Screenshots: `real-empty-*-01-specs-list-no-definitions`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-01-specs-list-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-01-specs-list-no-definitions.png?raw=true" width="320" alt="real-empty-desktop-01-specs-list-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-01-specs-list-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-01-specs-list-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-01-specs-list-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-01-specs-list-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-01-specs-list-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-land-01-specs-list-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-01-specs-list-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-01-specs-list-no-definitions.png?raw=true" width="320" alt="real-empty-phone-01-specs-list-no-definitions"></a>
</p>

### 3. High · S02 · all

With no definitions installed the footer only says “Enter a specification name. Go to the field”; the real blocker (no archetypes, a CLI command to run) sits mid-form as a small info line.

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-*-01-form-no-definitions / 02-go-to-field-no-definitions`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-01-form-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-01-form-no-definitions.png?raw=true" width="320" alt="real-empty-desktop-01-form-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-01-form-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-01-form-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-01-form-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-01-form-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-01-form-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-land-01-form-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-01-form-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-01-form-no-definitions.png?raw=true" width="320" alt="real-empty-phone-01-form-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-02-go-to-field-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-02-go-to-field-no-definitions.png?raw=true" width="320" alt="real-empty-desktop-02-go-to-field-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-02-go-to-field-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-02-go-to-field-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-02-go-to-field-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-02-go-to-field-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-02-go-to-field-no-definitions.png?raw=true" width="320" alt="real-empty-tablet-land-02-go-to-field-no-definitions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-02-go-to-field-no-definitions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-02-go-to-field-no-definitions.png?raw=true" width="320" alt="real-empty-phone-02-go-to-field-no-definitions"></a>
</p>

### 4. High · S02 · all

“New workspace — Disabled in the project configuration.” gives no hint which setting enables it; with the example config this is the default for every new project.

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-*-03-form-with-archetypes`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-03-form-with-archetypes.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-03-form-with-archetypes.png?raw=true" width="320" alt="real-empty-desktop-03-form-with-archetypes"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-03-form-with-archetypes.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-03-form-with-archetypes.png?raw=true" width="320" alt="real-empty-tablet-03-form-with-archetypes"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-03-form-with-archetypes.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-03-form-with-archetypes.png?raw=true" width="320" alt="real-empty-tablet-land-03-form-with-archetypes"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-03-form-with-archetypes.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-03-form-with-archetypes.png?raw=true" width="320" alt="real-empty-phone-03-form-with-archetypes"></a>
</p>

### 5. High · S02 · desktop

Create in the current folder leaves the new files untracked in git (`?? specs/`), but the progress page reports plain success. Storybook has a “Created but not committed” design that the real flow did not show. This later blocks Close (S07).

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-desktop-09-after-create-02`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true" width="320" alt="real-empty-desktop-09-after-create-02"></a>
</p>

### 6. High · S03 · all

The overview.md template sentence “Describe the intended outcome of this specification.” is shown as the Specification’s description under the title in every state, including Completed and Abandoned.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-01-not-started … 18-finished`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true" width="320" alt="real-empty-desktop-01-not-started"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-01-not-started.png?raw=true" width="320" alt="real-empty-tablet-01-not-started"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-01-not-started.png?raw=true" width="320" alt="real-empty-tablet-land-01-not-started"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-01-not-started.png?raw=true" width="320" alt="real-empty-phone-01-not-started"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-18-finished.png?raw=true" width="320" alt="real-empty-desktop-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-18-finished.png?raw=true" width="320" alt="real-empty-tablet-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-18-finished.png?raw=true" width="320" alt="real-empty-tablet-land-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-18-finished.png?raw=true" width="320" alt="real-empty-phone-18-finished"></a>
</p>

### 7. High · S03 · all

A Task put on hold (with a reason) does not appear under “Requires attention”; the Overview only lists it under an “On hold” group and the reason is not visible there.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-13-blocked-held-task`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-desktop-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-tablet-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-tablet-land-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-phone-13-blocked-held-task"></a>
</p>

### 8. High · S04 · all

The demo Task detail (State/Flow facts, “NEXT WORK — NOT STARTED”, “Related resources 14”) and the project-mode Task detail (NOW card, Documents, Context, Depends on) are two different screens for the same object.

Scenario: [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md). Screenshots: `real-demo-phone-04-task-detail vs real-empty-phone-18-task-detail-in-progress`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-demo-phone-04-task-detail.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-demo-phone-04-task-detail.png?raw=true" width="320" alt="real-demo-phone-04-task-detail"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-phone-18-task-detail-in-progress"></a>
</p>

### 9. High · S07 · all

On a retry the “Close specification” confirm stays disabled for 8+ seconds with no explanation, then the same error appears without a click.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-*-18-close-retry-clean-checkout`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-desktop-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-tablet-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-tablet-land-18-close-retry-clean-checkout"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-18-close-retry-clean-checkout.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-18-close-retry-clean-checkout.png?raw=true" width="320" alt="real-empty-phone-18-close-retry-clean-checkout"></a>
</p>

### 10. High · S07 · all

Closing an abandoned Specification: the dialog shows a disabled “Close specification” and an empty gap where the check result should be, with no reason given.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-*-22-close-dialog-abandoned`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-22-close-dialog-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-22-close-dialog-abandoned.png?raw=true" width="320" alt="real-empty-desktop-22-close-dialog-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-22-close-dialog-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-22-close-dialog-abandoned.png?raw=true" width="320" alt="real-empty-tablet-22-close-dialog-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-22-close-dialog-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-22-close-dialog-abandoned.png?raw=true" width="320" alt="real-empty-tablet-land-22-close-dialog-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-22-close-dialog-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-22-close-dialog-abandoned.png?raw=true" width="320" alt="real-empty-phone-22-close-dialog-abandoned"></a>
</p>

### 11. High · S09 · all

Plain Markdown files are all skipped (“missing frontmatter”); the required fields and allowed types are only revealed one error at a time, so a person fixes the same files several times before anything shows.

Scenario: [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md). Screenshots: `real-empty-*-04-docs-all-skipped-expanded`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-desktop-04-docs-all-skipped-expanded.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-desktop-04-docs-all-skipped-expanded.png?raw=true" width="320" alt="real-empty-desktop-04-docs-all-skipped-expanded"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-tablet-04-docs-all-skipped-expanded.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-tablet-04-docs-all-skipped-expanded.png?raw=true" width="320" alt="real-empty-tablet-04-docs-all-skipped-expanded"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-tablet-land-04-docs-all-skipped-expanded.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-tablet-land-04-docs-all-skipped-expanded.png?raw=true" width="320" alt="real-empty-tablet-land-04-docs-all-skipped-expanded"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-04-docs-all-skipped-expanded.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-04-docs-all-skipped-expanded.png?raw=true" width="320" alt="real-empty-phone-04-docs-all-skipped-expanded"></a>
</p>

### 12. Medium · S01 · all

The Documentation home of a project without a `docs/` folder explains the setting in config terms (“the folder set as docs.root in .nevo/config.yaml”), with no action in the UI.

Scenario: [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md). Screenshots: `real-empty-*-03-docs-home-no-docs-folder`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-03-docs-home-no-docs-folder.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-03-docs-home-no-docs-folder.png?raw=true" width="320" alt="real-empty-desktop-03-docs-home-no-docs-folder"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-03-docs-home-no-docs-folder.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-03-docs-home-no-docs-folder.png?raw=true" width="320" alt="real-empty-tablet-03-docs-home-no-docs-folder"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-03-docs-home-no-docs-folder.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-03-docs-home-no-docs-folder.png?raw=true" width="320" alt="real-empty-tablet-land-03-docs-home-no-docs-folder"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-03-docs-home-no-docs-folder.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-03-docs-home-no-docs-folder.png?raw=true" width="320" alt="real-empty-phone-03-docs-home-no-docs-folder"></a>
</p>

### 13. Medium · S02 · desktop

Progress step reads “Name and branch reserved” although “Current folder” creates no branch.

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-desktop-09-after-create-02`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true" width="320" alt="real-empty-desktop-09-after-create-02"></a>
</p>

### 14. Medium · S03 · all

Design vs real, not started: layout and wording match the “Overview early states / Not started” story. The story always has a written goal under the title and a Sessions section with “New session”; the real project without a goal and with Sessions disabled has neither, and that case has no story.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `storybook-desktop-specification-overview-early-states__not-started vs real-empty-desktop-01-not-started`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/storybook-desktop-specification-overview-early-states__not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/storybook-desktop-specification-overview-early-states__not-started.png?raw=true" width="320" alt="storybook-desktop-specification-overview-early-states__not-started"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true" width="320" alt="real-empty-desktop-01-not-started"></a>
</p>

### 15. Medium · S03 · all

Overview: “Tasks appear when the workflow reaches Break the solution down (step 4 of 7).” Tasks page at step 4: “Tasks appear when … (step 4 of 7) finishes. Create tasks with New task, also before the workflow starts.” The two texts disagree, and the Overview offers no “New task”.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-10-step4-breakdown-no-tasks vs S04 03-tasks-empty-breakdown`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-10-step4-breakdown-no-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-10-step4-breakdown-no-tasks.png?raw=true" width="320" alt="real-empty-desktop-10-step4-breakdown-no-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-10-step4-breakdown-no-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-10-step4-breakdown-no-tasks.png?raw=true" width="320" alt="real-empty-tablet-10-step4-breakdown-no-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-10-step4-breakdown-no-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-10-step4-breakdown-no-tasks.png?raw=true" width="320" alt="real-empty-tablet-land-10-step4-breakdown-no-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-10-step4-breakdown-no-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-10-step4-breakdown-no-tasks.png?raw=true" width="320" alt="real-empty-phone-10-step4-breakdown-no-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-03-tasks-empty-breakdown.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-03-tasks-empty-breakdown.png?raw=true" width="320" alt="real-empty-desktop-03-tasks-empty-breakdown"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-03-tasks-empty-breakdown.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-03-tasks-empty-breakdown.png?raw=true" width="320" alt="real-empty-tablet-03-tasks-empty-breakdown"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-03-tasks-empty-breakdown.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-03-tasks-empty-breakdown.png?raw=true" width="320" alt="real-empty-tablet-land-03-tasks-empty-breakdown"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-03-tasks-empty-breakdown.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-03-tasks-empty-breakdown.png?raw=true" width="320" alt="real-empty-phone-03-tasks-empty-breakdown"></a>
</p>

### 16. Medium · S03 · desktop

After “Start …” the page kept showing “Ready to start” with a dimmed button for at least 2.5 s; no progress text.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-desktop-08-step2-started`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-08-step2-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-08-step2-started.png?raw=true" width="320" alt="real-empty-desktop-08-step2-started"></a>
</p>

### 17. Medium · S03 · all

Same person shown as “started by you” for UI actions and “started by domin” (OS user) for CLI actions.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-13-blocked-held-task`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-desktop-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-tablet-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-tablet-land-13-blocked-held-task"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-phone-13-blocked-held-task"></a>
</p>

### 18. Medium · S03 · all

All documents stay “Template only” through Completed; nothing on the NOW card links the empty documents to the step that should fill them.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-18-finished`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-18-finished.png?raw=true" width="320" alt="real-empty-desktop-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-18-finished.png?raw=true" width="320" alt="real-empty-tablet-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-18-finished.png?raw=true" width="320" alt="real-empty-tablet-land-18-finished"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-18-finished.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-18-finished.png?raw=true" width="320" alt="real-empty-phone-18-finished"></a>
</p>

### 19. Medium · S03 · all

Demo Overview has no NOW/workflow card at all, while the project-mode Overview leads with it; the demo is not representative of the real screen.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-demo-*-04-attention-agent-input vs real-empty-*-05-step1-requirements`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-desktop-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-tablet-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-land-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-land-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-tablet-land-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-phone-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-05-step1-requirements.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-05-step1-requirements.png?raw=true" width="320" alt="real-empty-desktop-05-step1-requirements"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-05-step1-requirements.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-05-step1-requirements.png?raw=true" width="320" alt="real-empty-tablet-05-step1-requirements"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-05-step1-requirements.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-05-step1-requirements.png?raw=true" width="320" alt="real-empty-tablet-land-05-step1-requirements"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-05-step1-requirements.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-05-step1-requirements.png?raw=true" width="320" alt="real-empty-phone-05-step1-requirements"></a>
</p>

### 20. Medium · S03 · all

Task summary rows: demo shows the id twice (“TASK-07 TASK-07 · Uprawnienia…”); project mode shows “sign-in-screen Sign-in screen…” with no separator. On phone the line is cut with a trailing “...”.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-demo-phone-04-attention-agent-input, real-empty-phone-13-blocked-held-task`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-phone-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-13-blocked-held-task.png?raw=true" width="320" alt="real-empty-phone-13-blocked-held-task"></a>
</p>

### 21. Medium · S04 · all

Task detail shows internal tokens: step id in monospace (“· implement ·”), workflow name and “rev 1”.

Scenario: [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md). Screenshots: `real-empty-*-18-task-detail-in-progress`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-desktop-18-task-detail-in-progress"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-tablet-18-task-detail-in-progress"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-tablet-land-18-task-detail-in-progress"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-phone-18-task-detail-in-progress"></a>
</p>

### 22. Medium · S04 · tablet, phone

On tablet/phone the Task detail collapses Documents and Context into closed disclosures with “+” buttons, leaving most of the screen empty.

Scenario: [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md). Screenshots: `real-empty-phone-18-task-detail-in-progress`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-18-task-detail-in-progress.png?raw=true" width="320" alt="real-empty-phone-18-task-detail-in-progress"></a>
</p>

### 23. Medium · S05 · tablet, phone

On phone the Documents entry opens straight into overview.md; the file tree is only reachable through the header file switcher, and “Filter by type” could not be reached at tablet/phone widths.

Scenario: [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md). Screenshots: `real-demo-phone-01-documents-tree-and-reader, real-demo-*-07-tree-filter`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-phone-01-documents-tree-and-reader.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-phone-01-documents-tree-and-reader.png?raw=true" width="320" alt="real-demo-phone-01-documents-tree-and-reader"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-desktop-07-tree-filter.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-desktop-07-tree-filter.png?raw=true" width="320" alt="real-demo-desktop-07-tree-filter"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-07-tree-filter.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-07-tree-filter.png?raw=true" width="320" alt="real-demo-tablet-07-tree-filter"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-land-07-tree-filter.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-land-07-tree-filter.png?raw=true" width="320" alt="real-demo-tablet-land-07-tree-filter"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-phone-07-tree-filter.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-phone-07-tree-filter.png?raw=true" width="320" alt="real-demo-phone-07-tree-filter"></a>
</p>

### 24. Medium · S05 · tablet, phone

The side panel opened from the Overview is 50/50 on desktop but becomes a full-screen page on tablet and phone, with the document title shown twice (header and H1).

Scenario: [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md). Screenshots: `real-demo-tablet-02-side-panel-from-overview`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-02-side-panel-from-overview.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-demo-tablet-02-side-panel-from-overview.png?raw=true" width="320" alt="real-demo-tablet-02-side-panel-from-overview"></a>
</p>

### 25. Medium · S06 · all

“Sessions are turned off in this project.” is the whole page: no reason, no pointer to the setting, while the nav item stays visible.

Scenario: [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md). Screenshots: `real-empty-*-01-sessions-disabled`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-desktop-01-sessions-disabled.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-desktop-01-sessions-disabled.png?raw=true" width="320" alt="real-empty-desktop-01-sessions-disabled"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-tablet-01-sessions-disabled.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-tablet-01-sessions-disabled.png?raw=true" width="320" alt="real-empty-tablet-01-sessions-disabled"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-tablet-land-01-sessions-disabled.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-tablet-land-01-sessions-disabled.png?raw=true" width="320" alt="real-empty-tablet-land-01-sessions-disabled"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-phone-01-sessions-disabled.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-empty-phone-01-sessions-disabled.png?raw=true" width="320" alt="real-empty-phone-01-sessions-disabled"></a>
</p>

### 26. Medium · S06 · all

Demo session page contradicts itself: header “Response required”, body “This session has no messages.”, footer “You can only view this session.” The page also never reaches network idle.

Scenario: [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md). Screenshots: `real-demo-phone-03-session-detail-demo`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-demo-phone-03-session-detail-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-demo-phone-03-session-detail-demo.png?raw=true" width="320" alt="real-demo-phone-03-session-detail-demo"></a>
</p>

### 27. Medium · S06 · phone

Storybook Full Session on phone: the floating round menu and “…” buttons sit on top of the conversation text at the top edge (text runs underneath them). The story renders in Polish (“Nie powiodło się: 1 uruchomienie testów”), unlike the English app.

Scenario: [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md). Screenshots: `storybook-phone-managed-session__default`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/storybook-phone-managed-session__default.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/storybook-phone-managed-session__default.png?raw=true" width="320" alt="storybook-phone-managed-session__default"></a>
</p>

### 28. Medium · S07 · all

The Close blockers dialog lists the workflow and unfinished Tasks well, but does not check uncommitted files, so it shows no blocker while files are still untracked.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-*-06-close-dialog-with-tasks vs 16-close-dialog-ready`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-06-close-dialog-with-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-06-close-dialog-with-tasks.png?raw=true" width="320" alt="real-empty-desktop-06-close-dialog-with-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-06-close-dialog-with-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-06-close-dialog-with-tasks.png?raw=true" width="320" alt="real-empty-tablet-06-close-dialog-with-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-06-close-dialog-with-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-06-close-dialog-with-tasks.png?raw=true" width="320" alt="real-empty-tablet-land-06-close-dialog-with-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-06-close-dialog-with-tasks.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-06-close-dialog-with-tasks.png?raw=true" width="320" alt="real-empty-phone-06-close-dialog-with-tasks"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-16-close-dialog-ready.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-16-close-dialog-ready.png?raw=true" width="320" alt="real-empty-desktop-16-close-dialog-ready"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-16-close-dialog-ready.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-16-close-dialog-ready.png?raw=true" width="320" alt="real-empty-tablet-16-close-dialog-ready"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-16-close-dialog-ready.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-16-close-dialog-ready.png?raw=true" width="320" alt="real-empty-tablet-land-16-close-dialog-ready"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-16-close-dialog-ready.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-16-close-dialog-ready.png?raw=true" width="320" alt="real-empty-phone-16-close-dialog-ready"></a>
</p>

### 29. Medium · S07 · all

Design vs real: the “Specification close blocked” story renders the Overview without the Close dialog open, and its fixture shows “Tasks 1 of 5 done” on the NOW card next to “No tasks yet” in the Tasks section. No story covers the “Close cannot start now” error seen in the real app.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `storybook-desktop-manual-workflow-execution__specification-close-blocked`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/storybook-desktop-manual-workflow-execution__specification-close-blocked.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/storybook-desktop-manual-workflow-execution__specification-close-blocked.png?raw=true" width="320" alt="storybook-desktop-manual-workflow-execution__specification-close-blocked"></a>
</p>

### 30. Medium · S08 · all

Switching Specification from the Tasks page opens the other Specification’s Overview, so the person loses the page they were on.

Scenario: [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md). Screenshots: `real-demo-*-04-switch-to-other-spec`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-desktop-04-switch-to-other-spec.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-desktop-04-switch-to-other-spec.png?raw=true" width="320" alt="real-demo-desktop-04-switch-to-other-spec"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-tablet-04-switch-to-other-spec.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-tablet-04-switch-to-other-spec.png?raw=true" width="320" alt="real-demo-tablet-04-switch-to-other-spec"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-tablet-land-04-switch-to-other-spec.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-tablet-land-04-switch-to-other-spec.png?raw=true" width="320" alt="real-demo-tablet-land-04-switch-to-other-spec"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-04-switch-to-other-spec.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-04-switch-to-other-spec.png?raw=true" width="320" alt="real-demo-phone-04-switch-to-other-spec"></a>
</p>

### 31. Medium · S09 · all

Demo Documentation says “cannot be read right now … Try again in a moment” with Retry, although in demo it can never load.

Scenario: [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md). Screenshots: `real-demo-*-01-docs-home-demo`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-desktop-01-docs-home-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-desktop-01-docs-home-demo.png?raw=true" width="320" alt="real-demo-desktop-01-docs-home-demo"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-tablet-01-docs-home-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-tablet-01-docs-home-demo.png?raw=true" width="320" alt="real-demo-tablet-01-docs-home-demo"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-tablet-land-01-docs-home-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-tablet-land-01-docs-home-demo.png?raw=true" width="320" alt="real-demo-tablet-land-01-docs-home-demo"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-phone-01-docs-home-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-demo-phone-01-docs-home-demo.png?raw=true" width="320" alt="real-demo-phone-01-docs-home-demo"></a>
</p>

### 32. Low · S01 · all

With exactly one Specification the list still renders full section headers with collapse chevrons (one row per section).

Scenario: [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md). Screenshots: `real-empty-*-06-specs-list-one-draft`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-06-specs-list-one-draft.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-desktop-06-specs-list-one-draft.png?raw=true" width="320" alt="real-empty-desktop-06-specs-list-one-draft"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-06-specs-list-one-draft.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-06-specs-list-one-draft.png?raw=true" width="320" alt="real-empty-tablet-06-specs-list-one-draft"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-06-specs-list-one-draft.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-tablet-land-06-specs-list-one-draft.png?raw=true" width="320" alt="real-empty-tablet-land-06-specs-list-one-draft"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-06-specs-list-one-draft.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-empty-phone-06-specs-list-one-draft.png?raw=true" width="320" alt="real-empty-phone-06-specs-list-one-draft"></a>
</p>

### 33. Low · S01 · desktop

Demo list shows a “Sample data” label at the right of the tabs; nothing equivalent marks the real list.

Scenario: [S01-first-run](2026-11-16-ui-ux-audit/S01-first-run.md). Screenshots: `real-demo-desktop-01-specs-list-populated`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-demo-desktop-01-specs-list-populated.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S01-first-run/real-demo-desktop-01-specs-list-populated.png?raw=true" width="320" alt="real-demo-desktop-01-specs-list-populated"></a>
</p>

### 34. Low · S02 · desktop

“Done. Opening the specification...” ends in a trailing ellipsis; a toast “Specification created” repeats the page heading.

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-desktop-09-after-create-02`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-02.png?raw=true" width="320" alt="real-empty-desktop-09-after-create-02"></a>
</p>

### 35. Low · S02 · desktop

The new Specification URL uses a UUID (`/specs/f497511d-…`) while demo URLs use slugs (`/specs/admission`).

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-desktop-09-after-create-03`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-03.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-09-after-create-03.png?raw=true" width="320" alt="real-empty-desktop-09-after-create-03"></a>
</p>

### 36. Low · S02 · all

Archetype radios have no default; the documents list only appears after a choice (“Choose an archetype to see the documents Create makes.”).

Scenario: [S02-create](2026-11-16-ui-ux-audit/S02-create.md). Screenshots: `real-empty-*-05-name-filled-no-archetype`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-05-name-filled-no-archetype.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-desktop-05-name-filled-no-archetype.png?raw=true" width="320" alt="real-empty-desktop-05-name-filled-no-archetype"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-05-name-filled-no-archetype.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-05-name-filled-no-archetype.png?raw=true" width="320" alt="real-empty-tablet-05-name-filled-no-archetype"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-05-name-filled-no-archetype.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-tablet-land-05-name-filled-no-archetype.png?raw=true" width="320" alt="real-empty-tablet-land-05-name-filled-no-archetype"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-05-name-filled-no-archetype.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S02-create/real-empty-phone-05-name-filled-no-archetype.png?raw=true" width="320" alt="real-empty-phone-05-name-filled-no-archetype"></a>
</p>

### 37. Low · S03 · all

Two “…” menus on the page (header “More actions” and NOW card “Workflow operations”) with different contents.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-empty-*-02-not-started-more-actions / 03-not-started-workflow-operations`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-02-not-started-more-actions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-02-not-started-more-actions.png?raw=true" width="320" alt="real-empty-desktop-02-not-started-more-actions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-02-not-started-more-actions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-02-not-started-more-actions.png?raw=true" width="320" alt="real-empty-tablet-02-not-started-more-actions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-02-not-started-more-actions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-02-not-started-more-actions.png?raw=true" width="320" alt="real-empty-tablet-land-02-not-started-more-actions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-02-not-started-more-actions.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-02-not-started-more-actions.png?raw=true" width="320" alt="real-empty-phone-02-not-started-more-actions"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-03-not-started-workflow-operations.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-03-not-started-workflow-operations.png?raw=true" width="320" alt="real-empty-desktop-03-not-started-workflow-operations"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-03-not-started-workflow-operations.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-03-not-started-workflow-operations.png?raw=true" width="320" alt="real-empty-tablet-03-not-started-workflow-operations"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-03-not-started-workflow-operations.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-03-not-started-workflow-operations.png?raw=true" width="320" alt="real-empty-tablet-land-03-not-started-workflow-operations"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-03-not-started-workflow-operations.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-03-not-started-workflow-operations.png?raw=true" width="320" alt="real-empty-phone-03-not-started-workflow-operations"></a>
</p>

### 38. Low · S03 · desktop/tablet

Breadcrumb middle item is the key in demo (“UI-1234”) and the title in project mode (“SSO sign-in”). Tablet portrait and phone drop the breadcrumb and show only “Overview”.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-demo-desktop-04 vs real-empty-desktop-01`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-desktop-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true" width="320" alt="real-empty-desktop-01-not-started"></a>
</p>

### 39. Low · S03 · all

Demo group labels are Polish (“Implementacja”, “Ukończone 5”) inside the English UI.

Scenario: [S03-overview](2026-11-16-ui-ux-audit/S03-overview.md). Screenshots: `real-demo-*-04-attention-agent-input`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-desktop-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-desktop-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-tablet-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-land-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-tablet-land-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-tablet-land-04-attention-agent-input"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-demo-phone-04-attention-agent-input.png?raw=true" width="320" alt="real-demo-phone-04-attention-agent-input"></a>
</p>

### 40. Low · S04 · all

New task dialog validation is inline and specific (“Use lowercase letters, digits and dashes…”).

Scenario: [S04-tasks](2026-11-16-ui-ux-audit/S04-tasks.md). Screenshots: `real-empty-*-06-new-task-bad-id`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-06-new-task-bad-id.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-desktop-06-new-task-bad-id.png?raw=true" width="320" alt="real-empty-desktop-06-new-task-bad-id"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-06-new-task-bad-id.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-06-new-task-bad-id.png?raw=true" width="320" alt="real-empty-tablet-06-new-task-bad-id"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-06-new-task-bad-id.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-tablet-land-06-new-task-bad-id.png?raw=true" width="320" alt="real-empty-tablet-land-06-new-task-bad-id"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-06-new-task-bad-id.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S04-tasks/real-empty-phone-06-new-task-bad-id.png?raw=true" width="320" alt="real-empty-phone-06-new-task-bad-id"></a>
</p>

### 41. Low · S05 · all

Tree order is alphabetical (overview, backend, behaviour, ux) while the Overview lists the same documents in archetype order (overview, behaviour, ux, backend).

Scenario: [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md). Screenshots: `real-empty-desktop-04-editor-template-doc vs S03 real-empty-desktop-01-not-started`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-desktop-04-editor-template-doc.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-desktop-04-editor-template-doc.png?raw=true" width="320" alt="real-empty-desktop-04-editor-template-doc"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-01-not-started.png?raw=true" width="320" alt="real-empty-desktop-01-not-started"></a>
</p>

### 42. Low · S05 · all

Editor mode shows the YAML frontmatter as the first lines of every document.

Scenario: [S05-documents](2026-11-16-ui-ux-audit/S05-documents.md). Screenshots: `real-empty-*-04-editor-template-doc`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-desktop-04-editor-template-doc.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-desktop-04-editor-template-doc.png?raw=true" width="320" alt="real-empty-desktop-04-editor-template-doc"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-tablet-04-editor-template-doc.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-tablet-04-editor-template-doc.png?raw=true" width="320" alt="real-empty-tablet-04-editor-template-doc"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-tablet-land-04-editor-template-doc.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-tablet-land-04-editor-template-doc.png?raw=true" width="320" alt="real-empty-tablet-land-04-editor-template-doc"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-phone-04-editor-template-doc.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S05-documents/real-empty-phone-04-editor-template-doc.png?raw=true" width="320" alt="real-empty-phone-04-editor-template-doc"></a>
</p>

### 43. Low · S06 · desktop

New session (demo): “Local adapter” card text is Polish (“Niedostępny w tym środowisku demonstracyjnym.”); the composer placeholder says “Choose the agent and start the session” while an agent is already selected.

Scenario: [S06-sessions](2026-11-16-ui-ux-audit/S06-sessions.md). Screenshots: `real-demo-desktop-04-new-session-demo`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-demo-desktop-04-new-session-demo.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S06-sessions/real-demo-desktop-04-new-session-demo.png?raw=true" width="320" alt="real-demo-desktop-04-new-session-demo"></a>
</p>

### 44. Low · S07 · all

Finish-step dialogs explain results and required feedback clearly; the confirm stays disabled and an inline error appears when feedback is missing.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-*-11-finish-review-fail-no-feedback`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-11-finish-review-fail-no-feedback.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-11-finish-review-fail-no-feedback.png?raw=true" width="320" alt="real-empty-desktop-11-finish-review-fail-no-feedback"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-11-finish-review-fail-no-feedback.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-11-finish-review-fail-no-feedback.png?raw=true" width="320" alt="real-empty-tablet-11-finish-review-fail-no-feedback"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-11-finish-review-fail-no-feedback.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-11-finish-review-fail-no-feedback.png?raw=true" width="320" alt="real-empty-tablet-land-11-finish-review-fail-no-feedback"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-11-finish-review-fail-no-feedback.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-11-finish-review-fail-no-feedback.png?raw=true" width="320" alt="real-empty-phone-11-finish-review-fail-no-feedback"></a>
</p>

### 45. Low · S07 · all

Abandon requires a reason (confirm disabled until filled); after confirming, the NOW card shows “Abandoned”, the reason and “Close specification”.

Scenario: [S07-workflow-actions](2026-11-16-ui-ux-audit/S07-workflow-actions.md). Screenshots: `real-empty-*-20-abandon-empty-reason, 20-abandoned (S03)`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-20-abandon-empty-reason.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-desktop-20-abandon-empty-reason.png?raw=true" width="320" alt="real-empty-desktop-20-abandon-empty-reason"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-20-abandon-empty-reason.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-20-abandon-empty-reason.png?raw=true" width="320" alt="real-empty-tablet-20-abandon-empty-reason"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-20-abandon-empty-reason.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-tablet-land-20-abandon-empty-reason.png?raw=true" width="320" alt="real-empty-tablet-land-20-abandon-empty-reason"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-20-abandon-empty-reason.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S07-workflow-actions/real-empty-phone-20-abandon-empty-reason.png?raw=true" width="320" alt="real-empty-phone-20-abandon-empty-reason"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-20-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-desktop-20-abandoned.png?raw=true" width="320" alt="real-empty-desktop-20-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-20-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-20-abandoned.png?raw=true" width="320" alt="real-empty-tablet-20-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-20-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-tablet-land-20-abandoned.png?raw=true" width="320" alt="real-empty-tablet-land-20-abandoned"></a>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-20-abandoned.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S03-overview/real-empty-phone-20-abandoned.png?raw=true" width="320" alt="real-empty-phone-20-abandoned"></a>
</p>

### 46. Low · S08 · all

In the drawer the current Specification title is cut with a trailing “…” on every width (“Deterministic admission an…”).

Scenario: [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md). Screenshots: `real-demo-phone-03-spec-switcher`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-03-spec-switcher.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-03-spec-switcher.png?raw=true" width="320" alt="real-demo-phone-03-spec-switcher"></a>
</p>

### 47. Low · S08 · tablet, phone

Phone/tablet headers show a back arrow on Task and Document pages but a hamburger on Overview; tablet portrait drops the breadcrumb entirely.

Scenario: [S08-navigation](2026-11-16-ui-ux-audit/S08-navigation.md). Screenshots: `real-demo-phone-06-task-header-back`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-06-task-header-back.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S08-navigation/real-demo-phone-06-task-header-back.png?raw=true" width="320" alt="real-demo-phone-06-task-header-back"></a>
</p>

### 48. Low · S09 · all

Search snippets show raw Mermaid source (“U->>W: Open sign-in”).

Scenario: [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md). Screenshots: `real-empty-phone-07-docs-search-results`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-07-docs-search-results.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-07-docs-search-results.png?raw=true" width="320" alt="real-empty-phone-07-docs-search-results"></a>
</p>

### 49. Low · S09 · phone

The skipped-files warning stays at the top above the search field on phone, pushing results down.

Scenario: [S09-docs-reader](2026-11-16-ui-ux-audit/S09-docs-reader.md). Screenshots: `real-empty-phone-07-docs-search-results`.

<p>
<a href="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-07-docs-search-results.png?raw=true"><img src="https://github.com/dczerwinskipl/nevo-specflow/blob/9ddf64212175007ac4a2e3fc02fb3fda9646db9b/ux-audit/shots/S09-docs-reader/real-empty-phone-07-docs-search-results.png?raw=true" width="320" alt="real-empty-phone-07-docs-search-results"></a>
</p>
