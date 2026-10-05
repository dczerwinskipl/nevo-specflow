---
id: ideas.specflow-ui.design-system-component-composition-gaps
type: product
title: SpecFlow UI design-system and composition gaps
status: draft
scope: specflow
areas:
  - ui
tags:
  - components
  - compositions
  - design-system
  - specification
  - task
  - session
  - migration
read_when:
  - planning implementation after the Spec/Task and Full Session screen-structure passes
  - deciding whether a missing UI concept belongs in Nevo UI or SpecFlow feature code
  - prioritizing reusable component work before visual mockups
summary: >
  Maps the current Specification/Task and Full Session screen structures onto the migrated Nevo UI
  foundation, distinguishing existing primitives, product-owned compositions, reusable design-system
  gaps, and product capability gaps.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.spec-task-screen-structure
  - ideas.specflow-ui.full-session-screen-structure
  - design-system.principles.system-boundary
  - design-system.implementation.react.component-guidelines
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - ideas.developer-workspace.code-inspection-and-editing
---

# SpecFlow UI design-system and composition gaps

## 1. Purpose and inspected baseline

This pass answers:

> Given the agreed Spec/Task and Full Session structures, what can we build from the current Nevo UI,
> what should remain product-owned composition, and what reusable capability is actually missing?

Product behavior is taken from the current UI idea/product documents on
`docs/mvp-hardening-ideas`.

Implementation evidence was inspected from the current UI migration branch:

```text
feature/poc-to-specflow
```

That branch currently contains `packages/specflow-ui` and `packages/nevo-ui`; the documentation branch
does not yet contain those migrated UI sources. Treat file/API observations below as migration-branch
evidence until that UI branch is merged or rebased.

Use these classifications:

- **Covered** — current Nevo UI primitive/behavior can support the need without semantic distortion.
- **Product composition** — build feature-local in SpecFlow UI from existing primitives; do not add
  a generic design-system component yet.
- **Nevo UI extension** — an existing reusable primitive/behavior needs a small generic capability.
- **Product capability gap** — missing product functionality/data surface, not a design-system
  primitive problem.
- **Deferred** — not required to start composing the agreed screens.

The system-boundary rule remains: a public component whose meaning requires Specification, Task,
Agent, Session, Repository, or workflow semantics belongs in the product unless real reusable
behavior emerges.

---

# 2. Existing foundation that should be reused

## 2.1 Application shell and navigation — Covered

Current migrated UI already provides:

- `AppShell`;
- persistent navigation vs Drawer navigation;
- `SideNavigation`;
- `Drawer`;
- `WorkspaceHeader`;
- header primary action + overflow action behavior;
- `AppContent`, `AppWorkspaceBody`, and `AppContentContainer`;
- app/workspace environment surfaces.

This is enough for the agreed top-level IA:

```text
Project
├── Specs
└── Project settings
```

No new SpecFlow-specific shell component is justified.

## 2.2 Primary / Secondary workspace mechanics — Mostly covered

Current `AppWorkspace` provides:

- Primary;
- optional static/default Secondary;
- runtime Secondary;
- runtime `setSecondary`, `pushSecondary`, `popSecondary`, `closeSecondary`;
- local Secondary stack;
- focus restoration;
- Back/Close chrome;
- stacked narrow presentation;
- split emphasis modes: `primary | balanced | secondary`.

This already fits most of:

- Specification Primary -> Task Secondary;
- Full Session Primary -> default Context / user-selected detail Secondary;
- Context -> Task/Handover/artifact detail;
- compact Work burst -> expanded Work -> ToolAction detail;
- one Secondary only, never a third workspace pane.

There are two important foundation gaps in section 5.

## 2.3 Scrolling and long content — Covered

Current primitives provide:

- independent workspace body scrolling;
- `ScrollArea` with edge indicators;
- horizontal overflow support;
- content-width containers.

Use those before inventing screen-specific scroll wrappers.

## 2.4 Basic actions and semantic feedback — Covered

Available primitives include:

- `Button`;
- `IconButton`;
- `Menu`;
- `AlertDialog`;
- `Dialog`;
- `Popover`;
- `Tooltip`;
- `Alert`;
- `Badge`;
- `StatusIndicator`;
- `Progress`;
- `Spinner`;
- `Skeleton`;
- `EmptyState`;
- `Toast`.

This is enough to compose:

- requires-attention summaries;
- ready actions;
- issue/remediation summaries;
- destructive/irreversible confirmation;
- loading/empty/error states;
- compact status metadata.

Do not add a generic `TaskStatus`, `SpecStatus`, or `AgentStatus` component to Nevo UI.

## 2.5 Content and disclosure — Covered

Available:

- semantic `Typography`;
- `MarkdownDocument`;
- `Collapsible`;
- `Timeline`;
- `Separator`;
- `Link`.

These cover basic task intent, acceptance criteria, review prose, workflow history, and progressive
disclosure.

`MarkdownDocument` needs one extension for product-aware links; see section 5.

## 2.6 View switching — Covered

Both `Tabs` and `SegmentedControl` exist.

Potential consumers:

- Active / Archive if the final screen chooses tabs;
- local view/filter modes where semantics fit;
- local view/filter modes where semantics fit.

Do not add a new mode-switch primitive before choosing the actual composition.

## 2.7 Session composer — Covered as a primitive

`MessageComposer` already supports:

- controlled editor content;
- submit vs newline keyboard behavior;
- read-only/disabled state;
- integrated vs standalone presentation;
- generic toolbar composition.

Product code should own:

- Session readiness;
- whether normal composer is available;
- attachment/file actions;
- execution options;
- submit orchestration.

## 2.8 Human interaction controls — Covered as primitives

Existing form/action primitives can compose canonical interactions:

- single-choice question -> `RadioGroup`;
- multi-choice question -> `Checkbox`;
- confirmation -> buttons / confirmation composition;
- permission -> product-specific interaction content + actions.

The product needs a `SessionInteraction` composition, not a generic design-system "AI Question"
component.

## 2.9 Floating windows — Covered for current wide-shell implementation

`FloatingWindowHost` / `FloatingWindow` already provide:

- multiple floating surfaces;
- expand/minimize;
- close;
- overflow handling;
- notification cue;
- custom title/actions/content.

This is a strong base for wide-screen Floating Session.

Its responsive availability is currently narrower than the product model; see section 6.

## 2.10 Tables — Covered, but not the default Specs/Tasks answer

`DataTable` already has:

- sorting;
- row click/keyboard activation;
- row selection;
- loading/error/empty states;
- column sizing/visibility;
- horizontal narrow overflow.

Use it when the information is genuinely tabular.

The current Specs overview and Task collection are human-steering lists with asymmetric status,
attention, and action content. Do not force them into `DataTable` only because it exists.

---

# 3. Spec / Task: product-owned compositions

These should initially live under the SpecFlow feature boundary.

## 3.1 Specs overview / work queue

Candidate feature-local concepts:

```text
SpecsOverview
SpecQueue
SpecSummaryItem
SpecSignalSummary
SpecAttentionAggregate
```

Responsibilities:

- show one dominant attention/ready/current-work group while preserving materially important
  concurrent meaning through a bounded aggregate qualifier;
- keep the whole Spec row as the stable navigation target to Specification;
- keep ordinary row status/reason prose non-interactive;
- expose concrete Task/evidence/action context after entering the Specification rather than
  deep-linking from dynamic overview state.

Build from Typography, StatusIndicator/Badge, Button/Link, Alert where appropriate, and normal
semantic list/button markup.

### Do not add a generic design-system ListItem yet

There is no current reusable row contract that clearly spans Specs, Tasks, Session Context, and Work
without semantic compromise.

Implement the first product rows locally. If two or more features converge on the same selection,
metadata, action, keyboard, and density behavior, extract the shared behavior later.

## 3.2 Specification composition

Candidate feature-local concepts:

```text
SpecificationWorkspace
SpecificationSummary
SpecificationAttention
TaskCollection
TaskSummaryItem
SpecificationWorkflowSummary
SpecificationEvidenceSummary
```

The high-priority state is product semantics, not a generic Alert variant.

`Alert` may be used visually, but do not encode workflow logic inside Nevo UI.

## 3.3 Task Secondary

Candidate feature-local concepts:

```text
TaskDetail
TaskDecisionState
TaskIntent
TaskEvidence
ReviewSummary
HandoverSummary
ChangeSummary
VerificationSummary
RelatedSessionSummary
```

Use:

- `WorkspaceHeader` for surface identity/actions;
- `Collapsible` for optional/deeper sections;
- `MarkdownDocument` for authored prose where suitable;
- `Timeline` for workflow/history evidence;
- `Alert` / StatusIndicator / Typography for decision state;
- Button/Menu for deterministic actions.

The Task action remains product-owned because readiness and legal operations come from workflow
application contracts.

---

# 4. Full Session: product-owned compositions

## 4.1 Session workspace

Candidate feature-local structure:

```text
FullSessionWorkspace
├── SessionStream
├── SessionCurrentActivity
├── SessionInteraction
├── MessageComposer
└── SessionInspector
    ├── SessionContext
    └── SessionWork
```

Do not create a generic Nevo UI `Chat` component yet.

The current Session semantics — Commentary, Turn, Work, interaction, execution scope, readiness —
are product/runtime concepts.

## 4.2 Conversation stream

Candidate feature-local presentation pieces:

```text
UserMessage
AgentFinalAnswer
CommentaryEntry
WorkSummaryEntry
InteractionEntry
TurnOutcome
```

These may share internal presentation helpers, but that is feature-local reuse first.

The normal stream should not use `Timeline` merely to make everything look uniform. Conversation
and Work inspection have different information hierarchy.

## 4.3 Current activity

`SessionCurrentActivity` is a product composition over:

- canonical Runtime currentActivity;
- Typography;
- StatusIndicator/Spinner where semantically useful;
- optional capability-driven action such as Cancel.

It must not derive state from rendered Work items.

## 4.4 Session Context

Candidate feature-local concepts:

```text
SessionContext
ExecutionScopeSummary
CurrentExecutionTasks
RelatedTasks
SessionAttentionSummary
SessionEvidenceSummary
ExecutionConfigurationSummary
```

Current execution and related historical Tasks must remain distinct.

For Task-specific owner decisions, Context routes to Task detail rather than becoming a duplicate
mutation surface.

## 4.5 Session Work

Candidate feature-local concepts:

```text
WorkInspector
WorkTimeline
WorkItemSummary
ToolGroupSummary
ToolDetail
ToolActionDetail
```

The generic `Timeline` can provide the visual chronological skeleton.

Grouping completed tools, preserving exceptional boundaries, canonical Work selection, raw output,
and tool/action semantics remain product-owned.

## 4.6 Pending interactions

Candidate feature-local:

```text
SessionInteraction
├── PermissionInteraction
├── QuestionInteraction
└── ConfirmationInteraction
```

Use existing form/action primitives.

Do not create separate reusable components until another product use case proves shared interaction
behavior beyond canonical Session semantics.

---

# 5. Nevo UI extensions required by the agreed screen structures

## 5.1 P0 — runtime Compact split does not match the product contract

**Implementation status:** implemented on `feature/poc-to-specflow` after this analysis; repository
quality-gate validation is still required before merge.

The runtime split decision now follows workspace width independently from navigation mode. Compact
split also assigns workspace material to the runtime split root while narrow stacked mode keeps
material on the active panel. Story contracts cover 960px split and 839px stacked behavior.

### Desired product behavior

Current UI product docs define:

```text
Wide      persistent navigation + split workspace
Compact   Drawer navigation     + split workspace
Narrow    Drawer navigation     + stacked workspace
```

The intended workspace split threshold is independent from navigation collapse.

### Current migration implementation

`workspaceSizing.ts` defines:

```text
WORKSPACE_SPLIT_MIN_WIDTH = 840
WIDE_SHELL_MIN_WIDTH = 1108
```

but runtime `AppWorkspace` calls `supportsRuntimeWorkspaceSplit`, which currently requires:

```text
navigationMode === 'persistent'
&& availableWidth >= WORKSPACE_SPLIT_MIN_WIDTH
```

Because persistent navigation starts only at `WIDE_SHELL_MIN_WIDTH`, a runtime workspace under
Drawer navigation is always stacked.

The existing Storybook `MediumSurfaceContract` also explicitly expects a 960px shell to use stacked
runtime workspace.

### Required change

Make runtime split capability depend on workspace width, not persistent-navigation mode.

Navigation and workspace breakpoints must remain independent.

This is reusable layout behavior and belongs in Nevo UI.

### Validation needed

Add/adjust stories/tests for:

- below 840 -> Drawer + stacked;
- 840–1107 -> Drawer + split;
- 1108+ -> persistent navigation + split;
- runtime Secondary stack/back behavior in all three;
- no regression to mobile workspace material/animation.

---

## 5.2 P0 — default Context Secondary cannot currently be dismissed persistently

**Implementation status:** implemented on `feature/poc-to-specflow` after this analysis; repository
quality-gate validation is still required before merge.

Declarative `AppWorkspace.Secondary` now supports controlled `open` / `onOpenChange`. A runtime
detail can use the default Secondary as its inspector base: Back reveals the default Context, and the
default Context itself owns the Close action. Explicit product state can restore Context later.

### Desired Full Session behavior

On split entry:

```text
Conversation | Context
```

Context is default-open, but after the user closes Secondary it must remain closed until explicitly
reopened.

### Current migration implementation

A static `AppWorkspace.Secondary` is treated as `defaultSecondary`:

- it correctly does not stack on narrow;
- runtime detail can temporarily replace it;
- after runtime detail closes, default Secondary naturally reappears.

However, static/default Secondary has no `onClose` presentation and therefore no close action/state.
Only runtime Secondary has `closeSecondary`.

### Required change

Add a generic way for a default/static Secondary to be dismissible while preserving these semantics:

- default-visible on split entry;
- absent on stacked entry;
- closing it keeps it closed;
- opening Context explicitly restores it;
- pushing a runtime detail and navigating Back can return to Context;
- live product updates do not reopen a dismissed default Secondary.

The API shape is intentionally not frozen here.

Possible implementations include controlled default-Secondary visibility or a generic default
Secondary close contract. Do not solve it with Full-Session-specific state inside Nevo UI.

---

## 5.3 P1 — MarkdownDocument needs composable link/reference handling

**Implementation status:** implemented on `feature/poc-to-specflow` after this analysis; repository
quality-gate validation is still required before merge.

`MarkdownDocument` now exposes a product-supplied `renderLink` hook. A product renderer can claim
workspace-relative references while returning null/undefined for links that should retain the shared
default external-link rendering.

### Need

Session final answers, Commentary, review artifacts, and task prose may contain:

- normal external links;
- workspace-relative file references;
- future product routes/references.

A file reference should be able to open File detail in Secondary rather than always navigate away.

### Current migration implementation

`MarkdownDocument` owns its React Markdown component map internally and currently renders links as
external `Link` elements with `target="_blank"`.

### Required change

Allow product code to customize/resolve links or selected Markdown renderers while retaining the
shared Nevo UI Markdown styling.

The generic primitive should not learn what a Task or FileReference means. It should expose a
composition/override point; SpecFlow supplies the product-aware resolver.

---

# 6. Product/foundation decisions exposed by the current components

## 6.1 Resolved — Floating Session is Wide-only

Current `AppShell` enables `AppFloatingProvider` only in `wide` shell mode.

That now matches the product contract:

- Wide conversation access may open Floating Session;
- Compact/Narrow conversation access opens Full Session directly;
- no alternate compact floating/modal/sheet presentation is required.

This is no longer a design-system gap. Do not broaden generic floating-window support merely for
SpecFlow parity.

## 6.2 P2 — Secondary presentation/sizing by detail kind

Current `AppWorkspace` supports root-level split modes:

- primary;
- balanced;
- secondary.

That is enough to prototype:

- Context -> primary-emphasis;
- Work -> balanced/primary-emphasis;
- File -> balanced/secondary-emphasis.

A runtime Secondary entry does not currently carry its own presentation/sizing hint.

Do not extend the API yet. Let the Full Session composition control `split` from selected inspector
state first. Add a generic Secondary presentation hint only if multiple consumers demonstrate the
same behavior and the root-controlled approach becomes awkward.

---

# 7. Product capability gaps, not design-system gaps

## 7.1 Compact file preview / editing

There is no migrated file/code viewer/editor in `packages/nevo-ui`.

The existing Developer Workspace idea already defines the intended direction:

- compact code surface;
- workspace-relative file reference;
- project-aware language support;
- separate Open in IDE escalation.

Treat this as a product/platform capability track, not a reason to add a generic Card or Drawer
variant.

It does not block information-architecture planning, but current product fixtures should not render a
fake File-detail surface or Open-in-IDE control. Keep file references as future-capability targets
until the developer-workspace implementation actually lands.

## 7.2 Diff / changes inspection

No dedicated migrated Diff/Changes viewer is present.

`Changes` must be source-neutral and plural. A Task/Session/Specification may eventually expose
several relevant change sources at once, for example:

```text
Changes

Worktree changes
Diff to main
Pull request #123
Pull request #124
Merge request / another integration source
```

The exact sources are application data, not design-system semantics. GitHub/GitLab/provider-specific
behavior must not leak into a generic Nevo UI primitive.

For initial product composition, it is enough to expose a concise count/summary and explicit source
references when the backend supplies them. The actual diff/file inspection surface is a future product
capability to design alongside file/code inspection and available Git provenance.

Do not invent a generic `DiffCard` in Nevo UI yet.

## 7.3 Handover / artifact details

The canonical new-model contracts are still open.

Mock the structural slot and navigation relationship, but do not build reusable components around a
made-up persistent schema.

## 7.4 Read-model projections

UI still depends on application/runtime projections for:

- human attention;
- per-action readiness;
- current single/batch execution scope;
- continue/resume vs recovery;
- artifact references;
- relevant changes.

Missing projections are backend/read-model gaps, not visual component gaps.

---

# 8. Existing components that are intentionally not the answer

## DataTable

Good for real tables. Do not use as a shortcut for the Specs work queue or Task collection unless the
final content proves genuinely tabular.

## Card

Available, but the product direction already prefers hierarchy/whitespace over turning every region
into a card. Use selectively.

## Alert

Useful for an important state summary. Do not represent every workflow state as a persistent Alert.

## Badge

Useful for compact metadata. Do not repeat a workflow badge on every Task when grouping already
communicates the same status.

## Tabs

Available, but do not turn every information category into a tab. Full Session no longer requires a
permanent Context/Work switcher: Context is the default inspector and Work/details open from explicit
user actions. Task evidence should remain decision-ordered rather than artifact-type tabs unless real
screen testing says otherwise.

---

# 9. Implementation order before polished mockups

## P0 — foundation alignment

1. Runtime Compact split — **implemented on the UI migration branch; validation pending**.
2. Dismissible/restorable default Secondary — **implemented on the UI migration branch; validation
   pending**.
3. Storybook contract coverage for compact split, narrow stacking, default-Context Back/Close and
   restore — **implemented; execution pending**.

These affect the geometry/navigation model of both screen families.

## P1 — minimal reusable content extension

4. `MarkdownDocument` product-supplied link/reference rendering — **implemented; validation
   pending**.

## P1 — product compositions

5. Compose a Spec/Task structural Storybook fixture using real Nevo UI primitives.
6. Compose a Full Session structural Storybook fixture with default Context.
7. Add state fixtures for the acceptance scenarios already documented.

These fixtures should use product-owned mock view models, not backend/provider payloads.

## P2 — capability tracks

8. Continue future file/code surface work without faking preview before it exists.
9. Define initial multi-source change/diff inspection.
10. Wire canonical Handover/artifact references when the Runtime contract is concrete.
11. Validate Narrow browser/system Back integration with the local Secondary stack.

---

# 10. Storybook fixtures required before visual polish

Create composed product stories/screens rather than only primitive stories.

Minimum Spec/Task fixtures:

- Specs overview with concurrent attention + working signals;
- Specification with Task ready to start;
- Specification with active single-Task execution;
- Specification with active batch execution;
- Task requiring human review;
- Specification-level human decision;
- remediation;
- resumable continuation;
- recovery-required;
- narrow Task pushed detail.

Minimum Full Session fixtures:

- generic/spec-level Turn;
- single-Task execution;
- Task-batch execution;
- pending permission/question/confirmation;
- waiting without attention;
- terminal failure/interruption;
- continue/resume;
- recovery-required;
- unavailable/unknown;
- Context -> Task drill-down;
- Work -> ToolAction drill-down;
- file reference without fake preview controls; add File detail fixture only when the capability lands;
- default Context closed by user;
- narrow Conversation -> Context / user-selected detail pushed stack.

These stories are the point where visual hierarchy should be judged. Primitive stories alone cannot
validate the product screen.

---

# 11. Exit criteria for this gap pass

The product is ready for polished visual mockups when:

1. Compact runtime split matches the documented shell contract. **Implementation landed; automated
   validation pending.**
2. Full Session default Context can be closed, used as the base of inspector drill-down, and remain
   closed after dismissal. **Implementation landed; automated validation pending.**
3. product-aware Markdown/file links can be represented without duplicating normal Markdown link
   styling. **Implementation landed; automated validation pending.**
4. Spec/Task and Full Session compositions exist as product-level Storybook fixtures.
5. attention/ready/current-work states remain visually distinct without status-badge overload.
6. batch execution is visibly batch-shaped.
7. narrow fixtures preserve the same information hierarchy.
8. Compact/Narrow Session entry goes directly to Full Session; Floating remains Wide-only.
9. known File/Diff/Handover capability gaps are represented as such rather than hidden behind fake
   finished components.

At that point, remaining work is predominantly visual composition and product implementation rather
than discovering missing foundation contracts.
