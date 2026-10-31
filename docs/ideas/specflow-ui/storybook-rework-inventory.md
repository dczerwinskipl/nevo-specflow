---
id: ideas.specflow-ui.storybook-rework-inventory
type: engineering
title: Storybook Rework — baseline inventory and migration map
status: draft
scope: specflow
areas: [ui, docs, testing, tooling]
tags: [storybook, inventory, migration, testing, design-system]
read_when:
  - auditing Storybook source and deciding what to consolidate or preserve
  - planning a Storybook cleanup for an explicitly chosen UI scope
  - reviewing incoming PRs that introduce UI components, stories, or fixture infrastructure
summary: >
  Dated, non-authoritative inventory of SpecFlow/Nevo UI Storybook groups,
  component-story gaps, problematic screen scenario families, and a repeatable
  method for refreshing the inventory as concurrent PRs arrive.
related:
  - ideas.readme
  - ideas.specflow-ui.storybook-rework
  - design-system.implementation.storybook.guidelines
  - engineering.shared.testing
---

# Storybook Rework: baseline inventory and migration map

> **Evidence snapshot, not a stable requirement or future inventory.**
> Examined GitHub default branch \`main\` on 2026-10-31 using repository code search and
> individual .stories.tsx files. New or changed stories on open PRs are excluded from the
> counts below. This was *not* a built \`index.json\`/Storybook runtime inventory.
> Counts are source-level, explicitly typed \`export const …: Story =\` declarations and
> can miss aliases, nonstandard exports or dynamic indexing. Before any cleanup, rebuild
> a complete runtime story index at the selected working branch/revision.

## 1. Verified source baseline

| Owner | Story files found | Exported typed stories | Interpretation |
| --- | ---: | ---: | --- |
| \`packages/specflow-ui\` | 46 | 650 | Product screens, contracts, features, mocks and relatively few component stories |
| \`packages/nevo-ui\` | 96 | 526 | DS components and app mechanics, including hidden contracts and Figma captures |
| \`examples/crm\` | 1 | 6 | Independent consumer example |
| **Total** | **143** | **1,182** | Source-level count; includes tests, captures, mocks and showcase stories |

The navigation problem cannot be measured by total count alone:
hidden contract stories are valid and may need to grow. The relevant numbers are
**default-visible navigation entries, number of independent component playgrounds,
and how many screen-level stories are redundant parameter combinations**.

### SpecFlow by title area

| Title area | Files | Stories | Assessment |
| --- | ---: | ---: | --- |
| Brand | 2 | 15 | Reasonable product-brand showcase, inspect redundant presets |
| Screens | 13 | 305 | Biggest visible scenario-combination source |
| Contracts | 14 | 164 | Mostly legitimate, but some duplicate connected screen infrastructure |
| Components | 2 | 18 | Strikingly small product component catalog |
| Features | 9 | 104 | Some real feature units, some test-only UI assemblies |
| Shared | 2 | 20 | Operational primitives need clearer ownership/visibility |
| Navigation | 1 | 1 | Not an owner category in current target hierarchy |
| Review | 2 | 21 | Historical review artefacts should be explicitly profiled |
| Sessions | 1 | 1 | Managed Session screen does not compensate for a component catalog gap |
| **Total** | **46** | **650** | Categories reflect current source titles, not proposed tree |

Key signal: **13 Screen files expose 305 stories while only two files live under
\`SpecFlow/Components\` (18 stories).** This does not prove the product has only two
reusable components. It proves the Storybook *catalog* under-represents them.
Some real product components are under Features/Shared/Sessions; review owner boundaries
rather than mechanically moving directories.

### High-impact SpecFlow families

| Existing story group | Stories | Principal problem | Migration recommendation |
| --- | ---: | --- | --- |
| Features / Specification Creation / Workspace Section | 66 | Many browser assertions presented as feature variations | Keep 66 validations where needed, classify Contract/Integration, add meaningful Workspace Selection feature playground |
| Screens / Task Workbench | 63 | Many combinations of scenario, state, presentation, stress and width | Central controlled Playground, small explicit visual set, hidden contracts |
| Contracts / Creation Demo | 52 | Large interaction suite; not inherently bad | Preserve automated coverage; review shared fixtures and overlaps |
| Screens / Specs Overview | 44 | State/list/status/locale and responsive permutations | Controlled overview and smaller row/attention components; retain routing contracts |
| Screens / Application Shell | 39 | Auth/nav/refresh/regression mixed with showcase | One composed shell playground; hidden routes/auth interactions |
| Screens / Specification Workspace | 28 | Navigation and pending-state sequences as exports | Screen playground + feature-owned component stories + integration contracts |
| Contracts / Document edit-preview and position | 27 | Complex editor behavior contracts | Keep hidden; preserve real editor lifecycle integration |
| Screens / Documents archetypes (mock) | 26 | Wide/compact/mobile variants for historical mock | Tag as design/review fixture; consolidate controls and retire only if obsolete |
| Screens / Task Workspace | 23 | State names and long/preview/narrow permutations | Feature or screen playground with real component stories below |
| Screens / Editor mode (mock) | 23 | Width and mode combinations in navigation | Use controlled mock/preset and viewport; keep geometry checks |
| Review / Owner V5 after | 17 | Mixed Contract/Integration/Visual tags at meta level | Split responsibilities, preserve only meaningful accepted baselines |
| Screens / Login | 16 | Mostly state variants, some interactions | Playground + hidden login/auth behavior contracts |
| Shared / Operations Panel | 16 | Tests expressed as named stories | Focused operation item/panel showcase + hidden behavior |
| Components / Loading presentation | 13 | Dense variants | Keep component focus; assess Controls and test separation |
| Screens / Managed Session | 8 | Full session tests rather than smaller session building blocks | Component stories for message/turn/interaction/composer; composed screen remains |
| Features / Tasks / Hints | 3 | Good real component owner, but limited editing Controls | Improve to interactive Playground; keep focused copy/focus contract |

### Specific technical findings in source

- \`FullTaskWorkspace.stories.tsx\`: 63 exports; root \`tags: ['visual']\`,
  \`args\` for scenario/stress/preview/narrowPanel, no explicit \`argTypes\` for them.
  It already has a suitable adapter seam. Do not replace production Task data with
  a new framework.
- \`SpecsOverview.stories.tsx\`: 44 exports. Many differ by presentation/collection
  state, locale, or content density; fixture includes real shell/router/query
  infrastructure. Separate suitable presentational subparts before reducing screens.
- \`WorkspacePlaceSection.stories.tsx\`: 66 exports and many \`play\` tests.
  Not all tests should become Controls. Keep deterministic contract coverage while
  offering a useful controlled feature playground.
- \`ManagedSession.stories.tsx\`: at baseline 8 stories exercising the connected
  session surface and interaction functions, not an adequate catalog for discrete
  Session UI elements. Review incoming branch work before deciding new owner structure.
- \`TaskHints.stories.tsx\`: real \`TaskHints\` component, controlled \`hints\` input,
  and a browser test for long references/copy/focus. A good seed for component-first.
- \`OperationalRow.stories.tsx\`: renders a 30-row combined collection and checks
  geometry/selection. The owned \`OperationalRow\` would benefit from a smaller
  interactive showcase; keep the dense composition as contract evidence.
- \`ConsistencyBaseline.stories.tsx\` and \`OwnerV5After.stories.tsx\`: import fixtures
  or registration artifacts from neighboring \`.stories.tsx\` files. Evaluate moving
  reusable test presentation hosts into owner-local story-support modules.
- \`tools/storybook/.storybook/main.ts\`: \`capture\`, \`contract\`, \`integration\`
  default to excluded in the tag filter; the mechanism already exists.
- \`tools/storybook/.storybook/preview.ts\`: global \`chromatic.disableSnapshot = true\`;
  \`visual\` must explicitly opt in to create an actual baseline.
- \`Nevo UI/Actions/Button\`: good example of Playground, explicit \`argTypes\`,
  a separate capture matrix, and a contract. Reuse the approach, not a copy of UI.

## 2. Full identified SpecFlow ownership list

A working audit can start from this exact baseline, but must refresh it against the
target branch before acting.

| Source location relative to \`packages/specflow-ui/src/\` | Stories | Current title family |
| --- | ---: | --- |
| \`brand/nevo/NevoMark.stories.tsx\` | 9 | Brand / Nevo Mark |
| \`brand/nevo/NevoBrandLogo.stories.tsx\` | 6 | Brand / Nevo Logo |
| \`app/errors/ErrorViews.stories.tsx\` | 5 | Screens / Error Views |
| \`app/useCachedQueryState.stories.tsx\` | 1 | Contracts / Cache observer |
| \`auth/RuntimeUnavailableScreen.stories.tsx\` | 4 | Screens / Runtime Unavailable |
| \`app/loading/LoadingPresentation.stories.tsx\` | 13 | Components / Loading presentation |
| \`features/tasks/pages/FullTaskView.stories.tsx\` | 2 | Contracts / Standalone full task navigation |
| \`app/contracts/ConsistencyBaseline.stories.tsx\` | 3 | Contracts / Creation consistency baseline |
| \`app/navigation/useSessionDisclosure.stories.tsx\` | 1 | Contracts / Session navigation disclosure |
| \`auth/LoginScreen.stories.tsx\` | 16 | Screens / Login |
| \`features/tasks/detail/hints/TaskHints.stories.tsx\` | 3 | Features / Tasks / Hints |
| \`shared/operations/panel/OperationsPanel.stories.tsx\` | 16 | Shared / Operations Panel |
| \`app/navigation/WorkspaceRouteLeaveGuard.stories.tsx\` | 1 | Navigation / Workspace route leave guard |
| \`features/specs/overview/rows/SpecListRow.stories.tsx\` | 2 | Features / Specification Row |
| \`app/contracts/OwnerV5Review.stories.tsx\` | 4 | Review / Owner V5 independent responsive review |
| \`features/tasks/workspace/TaskSessionDemo.stories.tsx\` | 2 | Screens / Task Session Demo |
| \`features/sessions/shared/SessionProviderIcon.stories.tsx\` | 1 | Sessions / Provider Identity |
| \`shared/operations/progress/OperationProgress.stories.tsx\` | 4 | Shared / Operation Progress |
| \`mocks/editor-mode/EditorMode.stories.tsx\` | 23 | Screens / Editor mode (mock) |
| \`mocks/documents-archetypes/DocumentsArchetypes.stories.tsx\` | 26 | Screens / Documents archetypes (mock) |
| \`features/documents/editor/MarkdownSourceEditor.stories.tsx\` | 1 | Contracts / Markdown source editor |
| \`features/specs/workspace/SpecificationWorkspace.stories.tsx\` | 2 | Features / Specification / Overview after Create |
| \`features/tasks/detail/history/TaskHistoryDetails.stories.tsx\` | 2 | Features / Tasks / Historical details |
| \`app/SpecFlowShell.stories.tsx\` | 39 | Screens / Application Shell |
| \`features/documents/description/restoreScrollPosition.stories.tsx\` | 1 | Contracts / Restore Scroll Position |
| \`features/specs/workspace/specificationSecondaryStack.stories.tsx\` | 2 | Features / Specification / Pending Task Preview |
| \`features/specs/SpecificationStandaloneNavigation.stories.tsx\` | 5 | Contracts / Standalone specification navigation |
| \`features/specs/workspace/SpecificationWorkSectionOutlet.stories.tsx\` | 1 | Features / Work Section Recovery |
| \`features/documents/content/DocumentContent.stories.tsx\` | 5 | Features / Documents / Content lifecycle |
| \`shared/operational-list/OperationalRow.stories.tsx\` | 5 | Components / Operational List |
| \`features/sessions/managed/ManagedSession.stories.tsx\` | 8 | Screens / Managed Session |
| \`features/specs/creation/options/ArchetypeSection.stories.tsx\` | 5 | Contracts / Create archetype selection |
| \`features/specs/overview/SpecsOverview.stories.tsx\` | 44 | Screens / Specs Overview |
| \`features/documents/editor/DocumentEditor.stories.tsx\` | 12 | Contracts / Demo Markdown editor V4 |
| \`app/contracts/ConnectedConsistency.stories.tsx\` | 26 | Contracts / Connected creation consistency |
| \`app/contracts/OwnerV5After.stories.tsx\` | 17 | Review / Owner V5 after |
| \`features/tasks/workspace/TaskWorkspace.stories.tsx\` | 23 | Screens / Task Workspace |
| \`features/specs/creation/progress/CreateOperationPage.stories.tsx\` | 18 | Features / Specification Creation / Progress Page |
| \`features/tasks/pages/FullTaskWorkspace.stories.tsx\` | 63 | Screens / Task Workbench |
| \`features/specs/SpecificationSurface.stories.tsx\` | 28 | Screens / Specification Workspace |
| \`features/documents/workspace/DocumentsArchetypes.stories.tsx\` | 24 | Screens / Documents / Archetype states |
| \`features/documents/explorer/DocumentsExplorer.stories.tsx\` | 14 | Contracts / Documents owner V4 |
| \`features/documents/editor/DocumentScroll.contract.stories.tsx\` | 27 | Contracts / Document edit-preview and position |
| \`features/specs/creation/CreateSpecificationScreen.stories.tsx\` | 52 | Contracts / Creation Demo |
| \`features/documents/explorer/DocumentsExplorer.contract.stories.tsx\` | 18 | Contracts / Document tree explorer |
| \`features/specs/creation/workspace/WorkspacePlaceSection.stories.tsx\` | 66 | Features / Specification Creation / Workspace Section |

This list represents **story file paths**, not a proposed navigation tree. Existing
title paths sometimes disagree with code ownership; that is part of the cleanup.

## 3. What is missing from the *SpecFlow component catalog*

A separate **production-component ownership scan** is required. Candidates below
are ownership questions, **not claims that each named component already exists**:

| Product area | Components/compositions to search for | Why a screen story is insufficient |
| --- | --- | --- |
| Tasks | Requirement item, gate/status, resource reference, task header, historical attempt row, step details, action menu | Layout and behavior of one element are obscured inside dozens of full-task variants |
| Sessions | Message/event item, markdown body, tool/work presentation, context item, interaction/question, composer controls, pending status | Screen-wide Session fixtures conflate provider/UI state, focus and composition |
| Documents | Explorer tree row, document identity/actions, editor status, read-only/unavailable content | Need to inspect one item with long name, type/icon, selection and context menu |
| Specifications | Overview/list row, attention indicator, task preview, item navigation | List/screen stories repeat whole application state instead of inspecting one row |
| Creation | Workspace choice, base/branch selector, archetype choice, validation/status explanation, progress item | Full create flow is too heavy for tuning local states and controls |
| Operations | Operation row, progress state, action affordance, panel header | Existing fixtures are largely composed lists and test interactions |

For every candidate:
1. locate actual production subview/model and existing DS dependencies;
2. determine the correct existing owner (component, feature, screen);
3. decide whether a component story is useful at that boundary;
4. document props/Controls, representative variants, and required contract/integration coverage;
5. avoid creating public production exports solely for Storybook discoverability.

## 4. Nevo UI inventory boundaries

The 96 identified Nevo UI files distribute across:

| Title area | Source files |
| --- | ---: |
| Foundations | 7 |
| Layout | 8 |
| Workspace | 6 |
| Design System | 1 |
| Forms | 22 |
| Actions | 4 |
| Surfaces | 3 |
| Feedback | 11 |
| Overlays | 8 |
| Navigation | 12 |
| Internal | 3 |
| Content | 7 |
| Data | 3 |
| Patterns | 1 |

Nevo UI is **not equally broken**. Many genuine component showcases and
Controls already exist. Audit its large families (Workspace/Fit 24 stories,
DataTable 21, TreeGuide 19, Drawer 18, Workspace Header 14,
Select 13) for genuinely redundant visible variants, but do not flatten
legitimate design-system docs and tests into a single generic playground.

The CRM example has 6 exports and should remain independent, not absorb
SpecFlow-owned test requirements.

## 5. Concurrency: known incoming PRs

At inventory time, **PR #112** (Full Session screen redesign) was open and
introduced/changed multiple Storybook files, including:

- \`ManagedSession.interactions.stories.tsx\`
- \`ManagedSession.states.stories.tsx\`
- \`MessageText.stories.tsx\`
- \`ModelEffortPicker.stories.tsx\`
- \`WorkInspector.stories.tsx\`
- \`ManagedSession.stories.tsx\`
- Nevo UI Workspace and ItemTabs stories.

This may **improve the product component coverage** cited above. Do not
uncritically duplicate or refactor these components based on the main snapshot.
Inspect the exact PR HEAD and merged state, reconcile any new component stories
with the proposed profiles and Controls, then rebuild the inventory.

Other branches will continue to arrive. Never assume this file remains
accurate after merge, rebase, branch-switch, or a new UI PR.

## 6. Repeatable inventory procedure for future agents

**Task trigger:** an ordinary implementation request such as
"posprzątaj Storybooka", "Storybook cleanup/rework", "uporządkuj stories",
"odchudź sidebar", "zrób playgroundy", with an optional scope, is enough.
Use the **existing UI implementer/general implementer**. Do not require
selection/installation of a new special agent.

**Required autonomous flow:**

1. Resolve requested scope from the user message (package, feature, component,
   story group, all Storybook); avoid gratuitous clarification when the scope
   is evident or can be safely bounded.
2. Load **current authoritative Storybook guidelines** and applicable design
   system/testing/architecture docs. Load the Storybook Rework idea/inventory
   **only if still active and deliberately chosen for migration**; after
   acceptance, use its promoted canonical rules instead.
3. Discover actual default branch and chosen work branch HEAD. Inspect relevant
   open PRs for changed story paths and likely incoming conflicts.
4. Enumerate \`*.stories.*\` from repository source and generate the actual
   Storybook index for the current working tree. Distinguish:
   - file count, story export count, runtime indexed story count;
   - owner/title/story ID, tags, visibility, play, Chromatic snapshot inclusion;
   - screenshot/Chromatic/CI references, Figma capture dependencies;
   - links to existing component APIs and fixture support.
5. Group by owner and profile, not just filenames. Find Screen/Feature-heavy
   clusters and real component story gaps. Sample actual rendering and Controls
   for each materially impacted family.
6. Propose an evidence-based **keep / hide / consolidate / extract component
   story / archive** decision per affected group; justify retained exceptions.
7. Implement in dependency-complete slices, preserving behavior and IDs where
   possible. Verify build, relevant browser/a11y contracts and visual baselines;
   for Storybook rework, check the actual rendered sidebar/Controls, not only
   TypeScript and unit tests.
8. Report scope, before/after default-visible surface, number and type of
   contracts preserved, unresolved conflicts, and verification actually run.
   Do not present an incomplete source grep as the runtime inventory.

A future agent must **perform this analysis itself**, not treat the dated table
above as implementation instructions. It should only request missing product
decisions when repository evidence does not resolve a material ambiguity.

## 7. Conditional trigger for ordinary UI review

A UI Reviewer must consult the **current Storybook authoring policy** when the
reviewed diff:
- adds, removes, renames or changes a \`.stories.*\` file or related fixtures;
- changes Storybook host config, docs guidance, test runner, a11y, Chromatic,
  Figma capture, story metadata/IDs, or story filtering;
- changes a UI component/feature in a way that changes the expected owner
  showcase/interaction/visual coverage, even if a story file is missing.

The reviewer should first **scan the diff and applicable UI ownership** to decide
whether this condition holds. For unrelated backend/infrastructure-only changes,
there is no Storybook-specific checklist and no mandatory Storybook policy load.
For a purely local UI adjustment, inspect the existing relevant story and its
coverage proportionally; do not force a catalog-wide inventory.

When triggered, reviewer checks:
- Is a **component-level inspectable surface** missing while only full-screen
  combinations were added?
- Are new visible stories duplicates of controllable args/presets?
- Are profile tags, default visibility, play, Chromatic and Figma capture
  semantics appropriate?
- Are fixtures deterministic and are shared test helpers correctly owned?
- Was functional coverage preserved across renames/hiding/consolidation?
- Did the author verify actually rendered behavior at relevant widths?

The reviewer **does not need to regenerate a complete repository inventory**
for each small story change. Full inventory is required for a Storybook rework,
broad catalog refactoring or when the reviewed change materially alters
the story index/visibility. This conditional distinction is intentional.

## 8. How this becomes policy, not only an idea

Do not create a dedicated Storybook agent. When this proposal is accepted:

1. Promote approved authoring/visibility/profile and component-first rules to
   \`docs/design-system/implementation/storybook/guidelines.md\` (single source of truth).
2. Add a **short routing trigger** in the canonical UI Implementer profile:
   "Storybook cleanup/rework" means autonomous discovery + fresh inventory +
   component-first migration. The role already loads Storybook guidelines.
3. Add a **conditional Storybook review trigger** in the canonical Reviewer profile
   (or common reviewer source). It loads the Storybook policy **only when relevant**,
   then applies the focused checklist, not a universal gate on unrelated reviews.
4. Adjust general Implementer routing only if it can receive Storybook cleanup
   without delegation to UI Implementer.
5. Regenerate agent skill outputs for \`.agents\` and \`.claude\` using the
   repository's canonical agent build. Do not hand-edit generated SKILL.md copies.
6. Add tests for the trigger/routing contract and a changed-files incremental
   policy checker; avoid false positives from unrelated changes and legacy debt.
7. Keep this idea and inventory as non-authoritative historical evidence after
   migration; avoid a second parallel rulebook.

## 9. Scope-based migration order

**First**: root tag/profile correctness, Task Workbench, Specs Overview,
WorkspacePlaceSection and Session stories arriving from #112.

**Second**: feature-owned component playgrounds in Tasks, Sessions,
Operations, Documents, Specifications and Creation; keep complex
full-app integration tests.

**Third**: Application Shell, editor/document mocks, remaining Screen families,
and Nevo UI's large story groups only where review shows real clutter.

**Finally**: agent triggers, checks/ratchet, accepted reviewer guidance,
obsolete fixture cleanup, and a generated/re-runnable inventory command.

The trigger and review rules can be promoted earlier than the wholesale migration
to prevent new technical debt while existing branches are landing.

## 10. Evidence links

- [Current Storybook guideline](../../design-system/implementation/storybook/guidelines.md)
- [Storybook Rework proposal](storybook-rework.md)
- [Docs inventory guidance](../README.md)
- [PR #112](https://github.com/dczerwinskipl/nevo-specflow/pull/112)
- \`tools/storybook/.storybook/main.ts\`, \`preview.ts\`
- \`packages/specflow-ui/src/features/tasks/pages/FullTaskWorkspace.stories.tsx\`
- \`packages/specflow-ui/src/features/specs/overview/SpecsOverview.stories.tsx\`
- \`packages/specflow-ui/src/features/specs/creation/workspace/WorkspacePlaceSection.stories.tsx\`
