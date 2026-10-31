---
id: ideas.specflow-ui.storybook-rework
type: engineering
title: Storybook Rework — component-first catalog and sustainable story authoring
status: draft
scope: specflow
areas: [ui, docs, testing, tooling]
tags: [storybook, design-system, components, testing, developer-experience, agents]
read_when:
  - evaluating or planning a Storybook catalog rework for a selected package or feature
  - reducing screen scenario clutter and increasing component-level playground coverage
  - deciding which stories need Controls, contract tags, visual snapshots, or integration tests
  - designing long-term Storybook authoring and review safeguards for incoming UI changes
summary: >
  Non-authoritative proposal to rework SpecFlow Storybook from a screen-scenario dump into a
  component-first interactive workbench, while retaining automated contracts and introducing
  incremental CI and agent-level authoring safeguards.
related:
  - ideas.readme
  - ideas.specflow-ui
  - ideas.specflow-ui.storybook-rework-inventory
  - design-system.implementation.storybook.guidelines
  - engineering.shared.testing
  - design-system.implementation.react.component-guidelines
---

# Storybook Rework

> **Proposal, not a current engineering standard or a delivery authorization.** The existing
> Storybook guidelines remain authoritative until this idea is accepted and promoted into them.
> This document describes the desired end state, not a demand to rewrite all stories at once.

## 1. Why this is needed

Storybook currently exposes too many full-screen scenarios as first-class navigation entries.
A single Task Workbench collection has 63 stories. The same UI is recreated across many Task,
Specification, Shell, Editor and responsive variants. Many entries are useful regression
fixtures, but they are poor interfaces for investigating or designing one component.

The more serious gap is **component ownership**: the SpecFlow product catalog largely documents
Screens, Contracts and large composed fixtures; comparatively few SpecFlow-owned parts of those
screens have a focused, interactive story. A developer fixing a Task requirement row, Session
message, operation item, menu, tree entry or header must often open an entire screen, find one
specific variant and navigate real application machinery just to inspect the element.

The requested direction is **component-first authoring and discovery, not screen-only testing**.
Keep real composed screens as integration evidence. Stop making them the default unit for every
visual tweak and state dimension.

See [the dated inventory](storybook-rework-inventory.md) for source evidence, candidate owners
and migration order. It is a snapshot. New branches and PRs must be inventoried again.

## 2. Outcomes and non-goals

Desired:
1. A person can find a **product component** by feature and modify its meaningful inputs using
   Storybook Controls, without routing through a whole Specification or Session.
2. Every substantial visible SpecFlow screen has a small, curated **Screen playground** to inspect
   integration, navigation and responsive composition.
3. Tests for rare errors, layout geometry, focus, routing and recovery remain runnable and
   discoverable through tags/filters, but are not the default navigation tree.
4. Nevo UI remains the reusable Design System's owner. SpecFlow stories document genuine product
   composition and feature-specific elements; they do not duplicate Button, Menu or Tabs variants.
5. Rules for new PRs are enforceable and durable, including work performed by AI agents.

Not proposed:
- Replacing Storybook 10, creating another Storybook host or installing a bespoke UI catalog.
- Deleting coverage merely to make the left navigation shorter.
- Refactoring production code solely to fit a story count, arbitrary component depth or file limit.
- Migrating browser/application flows into isolated component tests when the flow actually needs
  a router, Query Client, real layout host or other integration seam.
- Turning Storybook into a second product application, configuration framework or runtime simulator.
- Editing normative documentation in this idea-only PR.

## 3. Target ownership and navigation

Use a catalog organized by **what someone wants to inspect**, not by which test case was added.

    Nevo UI
      Foundations / Layout / Actions / Forms / Navigation / Data / ...
        Button / Playground
        Menu / Playground
        ...
    SpecFlow
      Brand
      Components
        Operations / Operational Row
        Tasks / Requirement Row
        Tasks / Task Hints
        Sessions / Message Item
        Sessions / Question Interaction
        Documents / Document Tree Item
      Features
        Tasks / Task Details
        Sessions / Conversation
        Specifications / Overview
        Documents / Explorer
        Creation / Workspace Selection
      Screens
        Task Workbench / Playground
        Specification Workspace / Playground
        Managed Session / Playground
        Specs Overview / Playground
        Create Specification / Playground
    Examples
      CRM / Playground

The names above are **illustrative ownership candidates**, not assertions that each component
exists as an independent production API. Inspect real component boundaries before extracting one.

**Owner hierarchy:**
- **Nevo UI / Component**: reusable, product-agnostic primitive or pattern, with real
  component props, variants and accessible behavior.
- **SpecFlow / Component**: reusable *within the product*, an identifiable visual/interaction
  boundary (e.g., Task requirement, Session event, document row, status/action composition).
  A component may remain feature-private.
- **SpecFlow / Feature**: coherent product subsection with owned data/model and several
  cooperating components, often more stateful than a single component.
- **SpecFlow / Screen**: composed route/page with app shell, navigation, responsive topology and
  API seams. It exists to inspect composition, not enumerate the Cartesian product of all states.
- **Contract / Integration / Capture**: **profiles**, not primary product categories. Keep
  colocated with owners in the source; use filtering and metadata to keep them out of the
  human-facing default tree. Historical test-only title paths can remain temporarily stable.

A component story can mock the **presentational boundary** even when its actual product owner
uses routing/query providers. Reuse typed production view-models or adapters at the appropriate
seam. Do not import production components from Storybook or let a production component pick a
test fixture as a fallback.

The presence of a design-system primitive does **not** mean the SpecFlow composition is redundant:
a real Task Requirement Row can have its own story, but a SpecFlow-specific copy of every Button
size should not.

## 4. Story types: distinct purpose, distinct maintenance rules

The existing five-profile model is a good basis. Keep its semantics, strengthen classification:

| Profile               | Primary job                                      | Normal visibility             | Interaction assertions                              | Chromatic       |
| --------------------- | ------------------------------------------------ | ----------------------------- | --------------------------------------------------- | --------------- |
| Showcase / Playground | Human inspection, Controls, component states     | Visible                       | Optional demonstration, not a hidden contract suite | Off             |
| Visual                | Curated stable appearance baseline               | Visible when genuinely useful | No assertion-bearing play                           | Explicit opt-in |
| Contract              | Behavior, a11y, focus, geometry, edge conditions | Hidden by default             | Yes where relevant                                  | Off             |
| Integration           | Router, provider, connected feature cooperation  | Hidden by default             | Yes where relevant                                  | Off             |
| Capture               | Design-system/Figma fixture                      | Hidden by default             | No assertion-bearing play                           | Off             |

**Review inherited tags.** The Task Workbench meta currently declares Visual for its entire
family and overrides a subset with Contract. A new export can accidentally inherit Visual.
Prefer an explicit, intentionally small visual allow-list; contract stories must not inherit
visual tagging or snapshots. The global host disables Chromatic snapshots by default, so
a Visual tag alone is not a live snapshot baseline.

**Do not infer profile from filename alone.** A .contract.stories file is a useful convention
but must carry correct tags. A visible story named Error can be a perfectly valid showcase;
an interaction-heavy Screen story can be an integration test that should be hidden.

**No absolute numerical caps.** Hundreds of tests may be appropriate; ten nearly identical
visible menu entries may already be too many. Judge independent purpose, clarity, coverage,
and ability to inspect an important product boundary.

## 5. Interactive fixtures: args first, meaningful state axes

For product component stories:
- Default to one **Playground** with typed args for the real component's useful inputs, plus
  small representative examples where they genuinely explain a distinct shape.
- Prefer selects, toggles, numeric controls and text inputs over an export per value.
- Express coherent scenario presets with typed factories. An enum-like scenario is fine
  when data and behavior must change together; it must not hide unrelated test switches
  behind unmaintainable conditionals.
- Keep **independent axes independent**: scenario, loading/error state, density, mode, readonly,
  number of items, content length, locale and responsive viewport as applicable.
- Avoid invalid combinations: expose only supported choices or describe a deliberate error
  scenario; do not silently render impossible domain states.
- Provide a deterministic reset when args change; do not retain stale Query Client, form state
  or mocks across unrelated scenarios. Do not share mutable module-level fixture state.
- Use Storybook's viewport globals for real responsive validation; a narrow container/control
  is an additional *component width* case, not a substitute for browser viewport.
- Explicitly control non-serializable/unsafe props. Controls need not map 1:1 to every internal
  production callback, transport object or session API.
- Use real DS components, themes, CSS tokens and production localization rather than
  test-only visual imitations.

For a feature or screen, an adapter may expose **story-level args** without distorting
the production API. Example (illustrative TypeScript):

    type TaskWorkbenchScenario = {
      task: 'human-gates' | 'agent' | 'recovery' | 'terminal';
      page: 'ready' | 'loading' | 'error';
      surface: 'primary' | 'preview';
      dense: boolean;
    };

    const meta = {
      title: 'SpecFlow/Screens/Task Workbench',
      component: TaskWorkbenchStoryHost,
      args: { task: 'human-gates', page: 'ready', surface: 'primary', dense: false },
      argTypes: {
        task: { control: 'select', options: ['human-gates', 'agent', 'recovery', 'terminal'] },
        page: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
        surface: { control: 'inline-radio', options: ['primary', 'preview'] },
      },
    } satisfies Meta<typeof TaskWorkbenchStoryHost>;

    export default meta;
    export const Playground: Story = {};
    export const HumanReviewVisual: Story = {
      args: { task: 'human-gates' },
      tags: ['visual'],
      parameters: { chromatic: { disableSnapshot: false } },
    };

A separate contract story can use the same fixture and assert keyboard/return behavior.
The example is a shape of the target; it is **not** drop-in code or a recommendation to copy
these exact enum values into production.

## 6. Good SpecFlow examples to preserve or build

**Good example A: Task Hints component.**
The existing Tasks/Hints story owns a real TaskHints component and typed hints data.
It has MixedReferences, Empty, and a ReferenceAndCopy interaction contract. Improve it by
making the default Playground obvious and controlling content/density without forcing
every edge case into its sidebar. Keep the copy/focus test under Contract.

**Good example B: Operation row.**
The existing Operational List fixture exercises difficult long content and selectable rows.
It is useful evidence, but the primary component discovery unit should be the actual
OperationalRow, not always a 30-row composed collection. Add a controlled row showcase;
retain the large collection as composition/geometry contract.

**Good example C: shared Button.**
Nevo UI/Actions/Button already shows a good direction: an explicit Playground, argTypes for
variants/sizes/icons, and a separate capture matrix. Use the same *interaction model* for
SpecFlow-owned components, without copying its implementation.

**Good example D: Session conversation components (target, not confirmed current).**
When working on Managed Session, Chat, Composer or Turn/Work events, inspect/create the smallest
real product-owned presentation units worth testing: event/message item, status, tool/work
disclosure, question interaction, composer capability state. Put their real props and
scenario factories in component stories. Keep one composed full Session showcase and separate
route/session lifecycle integration tests. Do not create a new public component purely to
improve the sidebar if the actual owner already offers a testable subview.

**Good example E: Create Specification.**
Allow an interactive Workspace Selection feature fixture to vary real selection options,
default refs, branch naming and validation. Keep long-lived workflow/recovery/keyboard
tests as separate hidden contracts; do not expose one named sidebar entry per backend
validation combination.

## 7. SpecFlow counterexamples / anti-patterns

**Bad: Screen as Cartesian product.**
Task Workbench currently exposes 63 stories; task kind, preview, narrow panel, content density,
error/loading and history are represented by many exports. The user has to search for the
right story before touching Controls. **Better:** one functional playground, a few curated
visual states, hidden behavior contracts, reusable fixture builders.

**Bad: A screen is used to test a small component.**
A menu grouping, tree row, long label or requirement badge is exercised only through an
entire App Shell/Specification route. **Better:** a focused component story for the actual
subview, and an integration test for its connection to the screen.

**Bad: one export per width.**
WideMarkdownEdit, Compact900 and Narrow390 variants in mock screens can be useful as explicit
review checkpoints, but should not be the main navigation surface for exploratory work.
**Better:** viewport toolbar + component width control; retain explicit width contracts
where screenshot IDs or precise geometry are required.

**Bad: tests pretend to be showcase.**
WorkspacePlaceSection has 66 stories, most with play assertions. SpecsOverview and
Application Shell mix presentation with browser contracts. **Better:** classify hidden
Contract/Integration with explicit tags, create a real controlled Playground for humans.

**Bad: broad Visual inheritance.**
A root Visual tag for an entire Screen family treats every future export as a candidate
visual baseline, even if it is a contract. **Better:** opt in individually and verify
Chromatic parameters.

**Bad: cross-story imports as a test helper API.**
Consistency/Owner V5 stories import fixtures or metadata from other .stories.tsx modules.
**Better:** move shared fixture functions and typed scenario definitions to owner-local
.story-support/test-support modules. Story modules remain registration entrypoints.

**Bad: hiding everything.**
Changing all stories to Contract or putting everything under Internal makes navigation short
but destroys usability. **Better:** migrate representative visible component and screen
playgrounds *before* hiding a family of redundant showcases.

**Bad: create a giant universal fixture engine.**
A registry that can set every state of every page makes a second application with little
relation to production ownership. **Better:** small feature-owned fixture factories and
only genuinely shared decorators/providers.

## 8. Hardening: agent instructions, review and CI

**This is a first-class deliverable, not an optional follow-up.** Without a guardrail,
concurrent branches and implementation agents will immediately repopulate the catalog.

### 8.1 Discover relevant documentation by responsibility

This is **documentation discovery, not a keyword trigger or a role-selection rule**.
Do not tie this proposal to a particular request phrase or to UI Implementer.
Whichever existing agent or contributor owns a Storybook-related task should identify
the affected subsystem and consult the applicable current rules. An ordinary code
review should load them when its changes affect Storybook authoring or coverage,
but unrelated changes should not incur a Storybook-specific review.

The repository already indexes authored documentation with `read_when`, `summary`,
`related`, `scope`, `areas`, and `tags`. Use those fields to make it discoverable:

- **Authoritative rules:** extend the `read_when` metadata of
  `design-system.implementation.storybook.guidelines` to include catalog restructuring,
  component/feature story coverage, fixtures and Controls, and review of Storybook-related
  changes. This document owns the approved authoring and verification policy.
- **Rework proposal:** keep `ideas.specflow-ui.storybook-rework` discoverable when
  evaluating migration direction, catalog organization and hardening.
- **Evidence inventory:** keep `ideas.specflow-ui.storybook-rework-inventory` discoverable
  for a scoped audit, branch comparison and migration planning.

A normal authoring/review task resolves current guidance using the repository's
existing `pnpm docs:find` discovery or exact `pnpm docs:get` IDs. The rework
proposal and dated inventory live under `docs/ideas/**`: default
`pnpm docs:context` **excludes ideas**. They must be loaded deliberately when
evaluating or undertaking the rework, and **must not override the current guideline**.

No extra agent, new role, command classifier, hardcoded phrase list, or duplicate
rules copied into skill files is proposed. If an agent fails to discover relevant
documentation, diagnose the existing knowledge-discovery process rather than adding
a Storybook-specific activation mechanism.

### 8.2 Autonomous inventory for Storybook restructuring

When the **actual scope** calls for substantial Storybook cleanup, reorganization
or migration, the responsible agent should independently:

1. Identify the owner boundaries and selected working branch. Read the applicable
   current guideline and, if relevant, this proposal and its inventory evidence.
2. Produce a **fresh** scoped inventory from current sources and the built Storybook
   index: owners, existing component playgrounds, visible stories, tags, Controls,
   tests, snapshots and IDs.
3. Check relevant incoming branches and PRs. The dated baseline in the companion
   inventory is only a starting point.
4. Decide which cases to keep, hide, consolidate, expose through Controls, move to
   component-level presentation fixtures or retire, while preserving contracts.
5. Apply the decisions proportionally, verify the resulting sidebar and interactions
   in the browser, and report coverage/ID changes and unresolved issues.

This behavior follows from the **nature and scope of the task**, not from how
someone words the request or which agent profile receives it. A local story edit
does not require a full repository-wide audit.

### 8.3 Checks when implementing Storybook-related UI work

When the assigned work affects Storybook stories, fixtures or their component-level coverage, the responsible implementer should:
1. Find the affected owner, existing Nevo UI pattern and current relevant component/feature/
   screen story **before creating new stories**.
2. State what changed in component API/presentation, and whether the current Storybook surface
   supports inspecting it through Controls; if not, improve the closest owner story.
3. Prefer adding args/presets to a coherent owner fixture over adding new nearly identical
   visible exports. New independent visible stories require a stated inspection purpose.
4. Choose Showcase, Visual, Contract, Integration or Capture intentionally and configure tags,
   Chromatic and play tests accordingly. Do not inherit incompatible profiles.
5. Verify rendered responsive behavior and real DS usage, including dense content, focus,
   accessibility and any affected AppWorkspace composition. Record which environments were
   actually run; never claim screenshot validation from JSX inspection.
6. Keep test helpers/fixtures owned by the feature, preserve existing tests and report any
   story-ID/Chromatic baseline changes.

Small CSS changes need proportional discovery; they do not require rebuilding a whole catalog.
Agents must not use "smallest change" as a justification to skip relevant test coverage.

### 8.4 Relevant documentation during code review

Reviewers first inspect the changed files, behavior and relevant UI ownership.
Load `design-system.implementation.storybook.guidelines` when the review involves:

- new or changed `.stories.*` files, story fixtures, scenario builders, Controls,
  decorators, story metadata/IDs or test-only presentation adapters;
- Storybook host configuration, runner, accessibility checks, Chromatic baseline,
  Figma capture or story navigation/filtering;
- substantive product UI component/feature changes whose corresponding
  Storybook showcase or verification coverage needs to be evaluated, even when
  the author did not change a story file.

Do **not** require this additional subject-specific reading for an unrelated
backend/infrastructure diff. For a narrowly scoped UI adjustment, apply only
relevant story checks; a complete catalog inventory belongs to actual catalog
rework and similarly broad changes.

This is an application of existing **document discovery and proportional review**.
It does not depend on adding `storybook` to every reviewer's global required
knowledge list or installing a special instruction trigger. Agents may resolve
the guideline through `docs:find` or an exact known document ID; the proposal
itself is optional and non-authoritative until explicitly evaluated.

### 8.5 Reviewer responsibility

Review agents should explicitly ask:
- Was a reusable SpecFlow presentation boundary created/changed, but only a giant screen story
  added or modified?
- Are there unnecessary new sidebar entries instead of controls or a typed fixture preset?
- Did any Contract/Integration story become visible by accident?
- Can new Visual stories really take Chromatic snapshots? Are tag inheritance and play rules sane?
- Does this duplicate an existing Nevo UI component/pattern?
- Are test-only imports leaking into production or other story modules?
- Were fixtures deterministic and are args changes isolated?
- Were snapshots, story IDs and tests preserved or migrated deliberately?
- Which claims are verified by an actual rendered pass, and which are proposals?

A reviewer should provide concrete file/story findings, not a numeric quota or generic
"Storybook cleanup needed" comment. Reviewers should challenge concrete violations when the reviewed scope makes
Storybook guidance relevant, even when the request concerns only one screenshot.

### 8.6 Lightweight automated guardrail (proposed)

Build a Storybook policy check that runs on changed story files and compares generated
Storybook metadata with the current baseline. Start as a report, then promote reliable
checks to errors. Suggested deterministic checks:

**Candidates for blocking errors once validated:**
- Invalid/missing owner path or ambiguous duplicate title/story IDs on newly changed stories.
- Invalid tag combinations (especially Contract/Integration/Capture inheriting live Visual).
- Capture with assertion-bearing play; Visual with assertion-bearing play.
- Visual story without explicit snapshot configuration, or accidental visual inheritance.
- Cross-story source imports when a separate shared fixture/support module is required.
- Explicit Storybook-only dependency leaking into a production import path.
- Broken story registration/build or missing test coverage after migration.

**Initially advisory, human-reviewed:**
- New Screen family with many visible scenario variants but no meaningful playground.
- A changed product component with no focused component story.
- Many new exports differing only in args/viewport/text length.
- A complex playground with no useful controls or impossible state combinations.
- Unusually large story file/fixture or repeated helpers.

Do not hard-fail based merely on file length, export count, lack of argTypes, a filename,
or "one story per component". Runtime-connected screens and non-serializable APIs need
legitimate exceptions. Keep a **baseline/ratchet**: legacy violations are enumerated,
new violations are reported in the PR, accepted exceptions have a short reason, and
no unrelated PR is blocked because main has existing debt. New branches that started
before the policy landed need a migration window rather than surprise mass breakage.

Prefer AST/Storybook metadata over regex-only heuristics. Verify the tag semantics and
actual built index first; use a deterministic report with path, story ID and diagnostic.
Connect the check to existing quality workflows without adding a slow full-browser pass
to every small PR. Keep browser, a11y and visual regression in their established lanes.

### 8.7 Agent/CI acceptance criteria

- A new UI feature PR must demonstrate the *appropriate inspection surface*, not just
  that a giant screen fixture renders.
- A new story's purpose, owner, profile and whether it is visible are inspectable in review.
- The canonical Storybook guideline and related rework ideas have discoverable `read_when` metadata; the responsible agent performs a fresh inventory when the work requires catalog restructuring, and reviewers consult the same guideline for relevant Storybook/coverage changes. No role-specific or phrase-specific trigger is required.
- A regression fixture needed by Chromium or Chromatic stays runnable after being hidden
  or moved; story ID changes are explicit.
- New PRs cannot silently introduce a family of visually indistinguishable visible
  Screen entries without reviewer-visible diagnostics.
- The policy checker has tests for both valid exceptions and real violations.

## 9. Migration plan in independent steps

**Phase 0: Inventory and baseline.**
Generate the complete Storybook story index (not only source-file regex counts) and record
owner, title/ID, profile, visibility, play, Chromatic and current test references.
Capture branch/commit, inventory timestamp and existing accepted snapshot IDs.
Repeat after merging parallel PRs.

**Phase 1: Classification without coverage loss.**
Repair metadata and inherited tags, mark tests as Contract/Integration, keep deterministic
fixture behavior, and check Chromium/Chromatic before renaming exported stories or titles.
This phase should make the default tree materially more usable without pretending that
components already have good playgrounds.

**Phase 2: SpecFlow component-first catalog.**
Start with Tasks (requirements/hints/history/resource rows), Sessions (message/turn/tool/
question/composer), Operations, Documents and Specification lists. Inventory real owners
and build/update focused component stories, not synthetic design-system clones.
Add typing and Controls where appropriate; reuse existing feature-owned fixtures.

**Phase 3: Screen playground consolidation.**
Task Workbench, Specs Overview, Specification Workspace, Application Shell, Managed Session,
Create Specification, Editor/Document mocks. Maintain a small set of representative
composed screens and explicitly justify remaining visible variants. Keep separate
integration/contract stories for focus, route, recovery and responsive behavior.

**Phase 4: Durable hardening.**
Promote approved rules to authoritative guidelines, update agent routing/checklists,
ship a tested incremental policy checker, document exceptions and review incoming UI PRs.

**Phase 5: Clean obsolete fixtures.**
Only after owners and regression coverage are proven: remove genuine duplicates, retire
stale mocks, simplify old support layers, and remove obsolete story-specific compatibility.
Never delete solely for a target story count.

Each phase can be shipped independently. Do not wait for every old branch to merge to improve
new authoring discipline, but compare its incoming stories against the new model.

## 10. Definition of done

The rework is successful when:
- SpecFlow's default sidebar is a usable **component and feature catalog** with selected
  screen playgrounds; it is not primarily a list of task/screen permutations.
- Core product-specific visual parts have focused inspectable stories; new features follow
  the same ownership model.
- Key screen playgrounds offer meaningful typed Controls and deterministic presets.
- Contract/Integration/Capture stories remain runnable and filterable without cluttering
  default navigation.
- Full existing meaningful behavior/visual coverage is accounted for, including any
  necessary story ID and Chromatic baseline migration.
- Storybook builds, relevant browser/a11y tests and quality checks pass.
- Agents and reviewers use one approved source of truth, and incoming PRs receive
  actionable, proportional enforcement.

Do **not** define success as "reduce 1,182 stories to N". The baseline number counts both
useful tests and redundant showcase exports; the right measure is inspectability and
preserved behavioral confidence.

## 11. Decisions still to make

1. Which SpecFlow presentation boundaries genuinely deserve component stories, given
   current feature ownership? Begin with Task, Session, Operations and Documents.
2. Which expensive connected stories remain as intentionally visible screen playgrounds?
3. Which accepted Chromatic baselines depend on existing story IDs and cannot be renamed
   in the first migration wave?
4. Which legacy violations will get immediate blocking checks versus a ratcheted warning?
5. Should outdated product mocks remain accessible only through a hidden Mock/Capture
   profile or be retired once the production screen is verified?
6. Should the inventory be a generated artifact in CI, an on-demand report, or both?
   Avoid committing noisy generated changes on unrelated UI PRs.

## References

- [Current Storybook guidelines](../../design-system/implementation/storybook/guidelines.md)
- [Shared testing guidelines](../../engineering/shared/testing.md)
- [Companion inventory](storybook-rework-inventory.md)
- Storybook host: tools/storybook/.storybook/main.ts and preview.ts
- Relevant areas: packages/specflow-ui/src and packages/nevo-ui/src
