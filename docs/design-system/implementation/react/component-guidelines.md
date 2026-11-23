---
id: design-system.implementation.react.component-guidelines
type: engineering
title: React component guidelines
status: current
read_when:
  - creating or restructuring a React component or module
  - deciding whether a helper component gets its own file
  - placing state or writing a hook
  - reviewing a React change
summary: >
  Small focused components, composition over configuration, split by responsibility not
  ceremony, feature-local vertical ownership, hooks by behavior, and where state lives.
related:
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.ui-ux-guidelines
  - design-system.implementation.tailwind.styling-guidelines
  - design-system.principles.system-boundary
  - engineering.shared.testing
  - design-system.implementation.react.component-feedback-and-content
  - design-system.implementation.react.component-input-and-overlay-patterns
  - design-system.implementation.react.component-tree-and-scrolling
---

# React component guidelines

These rules govern reusable components in `packages/nevo-ui/` and product UI composition in
`packages/specflow-ui/`. They describe responsibilities, not a mandatory directory tree.

## Core principles

- **Prefer small, focused components.** One primary concept per module.
- **Composition over configuration.** A component with a dozen boolean props that
  reshape it is usually two or three components.
- **Split by responsibility, not architectural ceremony.** Don't add `-Container`,
  `-View`, `-Wrapper` layers that only forward props.

## Module organization

- **Default:** one primary concept per file.
- A small helper component **may stay in the parent file** when it is only used there,
  has no independent state/lifecycle, and is short.
- A component **gets its own module** when it is reused, has meaningful state or
  effects, or is independently testable.
- **Feature-local vertical ownership:** keep a feature's components, hooks, view-models
  and tests together under `features/<domain>/`. Promote code upward to a shared
  location only when reuse is real, not anticipated.
- **Folders follow the shape of the code**. A component with its own
  sub-components, hooks and pure model is a folder package: the root component file that composes
  it, plus sub-folders named after real sub-concerns (for example `conversation/`, `composer/`,
  `model/`, or a component's private `parts/`). A folder never becomes a flat list of dozens of
  files; see [UI feature folders](../../../engineering/shared/code-organization.md#ui-feature-folders).
  Feature-level technical buckets (`hooks/`, `components/`, `utils/`) that separate code changing
  together are still not used.
- **One pattern, one implementation (DRY).** A structure that repeats with the same shape (JSX
  frames, state machines, query/command plumbing, paging, helpers) is extracted once into its
  owning slice, or into `shared/` when a second feature needs it, instead of being copied.

## Ownership boundary

- `packages/nevo-ui/` owns domain-agnostic components, design tokens, app-shell mechanics, and
  workspace/floating behavior that can be reused by another application.
- `packages/specflow-ui/` owns SpecFlow brand composition, routing, product screens, copy, and
  product-specific interaction decisions.
- `examples/` owns independent consumers. Examples MAY use Nevo UI but MUST NOT depend on
  SpecFlow UI.
- Routing libraries and product data models MUST NOT leak into Nevo UI component APIs.

## File size

Target: a component or hook file stays within about **200-300 lines**. Above
300 lines the file is split along its real sub-concerns, unless it is one cohesive unit: a single
state machine, a pure policy or projection module, or a parser. That exception is stated in the
file's header comment. Comments do not count as a way out: review history and breadcrumbs are
removed (see [Comments](../../../engineering/shared/code-organization.md#comments-document-why-and-invariants)),
not kept to explain a long file. Stories and tests are scenario catalogues; split them only where
one file mixes unrelated scenario groups.

A split keeps cohesion. Split a component into sub-components that own their own markup and state,
pure model/helper modules, and hooks that pass the [Hooks](#hooks) rule. Moving half of a
component's body into a hook used only by that component is relocation, not decomposition, and is
not an acceptable way to meet the target.

## Visual vs orchestration

- **Visual components** take props and render. No data fetching, no routing knowledge.
- **Container components / feature hooks** own data access and orchestration, and keep
  it visible — don't bury a fetch three hooks deep.
- Presentation consumes authoritative UI-facing facts and callbacks. It does not manufacture
  domain/application state when input is missing or infer workflow, permission, readiness, or
  attention semantics from identifiers, localized labels, or arbitrary display strings.

## Hooks

Extract hooks **by behavior ownership** (`useSessionStream`, `useWorkTimeline`), not as
a `useEverything` catch-all. A hook that does five unrelated things is five hooks.

Each hook lives in its own file. A hook is extracted when it is reused, or when it owns one
behaviour (its effects and invariants) behind a **narrow interface**: a few inputs and a few
outputs. A single-consumer `useComponentXYZ` that takes the component's state and returns most of
its values and handlers is relocation: keep that code in the component, or split the component
itself.

## View models

Transform raw/protocol data into a UI-facing model at a boundary that follows the
feature's change boundary. Stories and components consume the canonical UI model, never
raw provider payloads.

Fixture data and production data should converge on that same presentation model/boundary where
practical. A production component must not silently manufacture or import fixture data as a fallback
for a missing application dependency.

## State and effects

- Place state at the lowest common owner of the components that need it; lift only when
  genuinely shared.
- Effects are for **synchronization with external systems**, not for deriving values
  that could be computed during render.

## Accessibility & responsive

Semantic elements and roles; keyboard operable; interactive targets meet the
[target size](#target-size) policy; layout holds at mobile and desktop widths.

When a row exposes a primary navigation or activation target together with independent controls,
do not create invalid nested interactive elements. Keep those controls as separate focusable targets,
and activating one must not also trigger the row's primary action. A non-interactive structural row
with sibling navigation/control targets is the normal composition; an equivalent implementation is
acceptable only when DOM semantics, focus behavior, and independent activation remain valid.

**Width-dependent structure.** Restyle for the available space with a CSS container query. When the
DOM structure or order itself has to change with the width (for example one reading column versus
two independent columns, each read in its own order), CSS cannot express it: use
`useContainerMinWidth(minWidth, { hysteresis })` from Nevo UI and render the arrangement from its
`matches`. It reads the width before the first paint and commits a crossing before the browser
paints it, so no frame shows the other arrangement, and it renders only on a crossing.

- Observe a zero-height, full-width sentinel, not the content whose height the arrangement changes
  (that raises "ResizeObserver loop completed with undelivered notifications").
- Give it an exit `hysteresis` (16 px covers a classic scrollbar) when the change could move the
  width back across the breakpoint.
- Hold back the parts whose place depends on `matches` until `measured`, so a wide screen does
  not mount them in the narrow arrangement first.
- Parts that stay keyed children of the same parent in both arrangements are moved, not
  remounted, and keep their state (a selection). Parts that change parent remount: their local
  state resets, and focus inside them is lost unless the product restores it. Keep their view state
  (an expanded list) outside them, give opener rows a stable `data-focus-key`, and restore focus to
  the same control only when that change removed it, never after the user moved focus away. The
  Secondary's own focus return uses the same key, within the opener's layer.

Never use the viewport width for this, and never use CSS `order` to make the visual order differ
from the reading order.

## Testing

Follow the [shared testing guidance](../../../engineering/shared/testing.md): focused unit,
hook, and component tests are co-located with their owner; Storybook stories sit beside the
component; only cross-module/integration/package-boundary tests belong in a package-level `test/`
tree. Use fast unit tests for pure view-model/hook logic, Storybook interaction tests for component
behavior and accessibility, and inspect computed styles when exact visuals matter.

## Review checklist

- [ ] One primary concept per module?
- [ ] Composition instead of a configuration-heavy component?
- [ ] Feature-local ownership, not premature sharing?
- [ ] Files within ~200-300 lines, or a stated cohesive exception?
- [ ] Repeated patterns implemented once (DRY)?
- [ ] Folder shape matches the code (sub-concern folders, no flat lists of dozens of files)?
- [ ] Visual components free of data/routing concerns?
- [ ] Hooks split by behavior, each in its own file, with a narrow interface; no relocation-only
      `useComponentXYZ`?
- [ ] State at the right owner; effects only for synchronization?
- [ ] Accessible and responsive?

## Shell footer

Every bar pinned to the bottom of the shell (the navigation's account row, a page's sticky footer
such as Create's) is one default control high plus `--spacing-shell-footer-padding` (10 px) above and
below: `--spacing-shell-footer` (56 px), under one `Separator`, so the bars of the navigation and the
workspace meet on one line. Use `h-shell-footer` / `min-h-shell-footer` with `py-shell-footer-padding`;
do not add local paddings. Keep the content on one line (a short hint, then the action); it may grow
only when a long hint wraps. The safe area is added below it, never inside.

## Target size

Every interactive target is at least `--spacing-target-min` (24px) on every pointer and at least
`--spacing-target-touch` (44px) on coarse pointers (`@media (pointer: coarse)`). The runtime value is
`--target-size` on `:root`. The floor is reached by **expanding the hit area, not the visual**:
control heights (`control-height-inline/compact/default`), icons and spacing are never enlarged for
touch. WCAG 2.2 AA 2.5.8 (24px) is the hard floor; 44px is the platform touch standard. The documented
exception is a link inside a sentence or paragraph.

| Recipe (`interactionRecipes`) | Use                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `hitAreaClassName`            | any control smaller than the floor: a `::after` of `max(100%, var(--target-size))` on both axes |
| `hitAreaBlockClassName`       | text-width labels: expands only the block axis (the label already spans the row)                |

Rules:

- The pseudo-element belongs to the control, so a click on it activates the control; layout and the
  visual size do not change. The recipe makes the element `relative`; do not add `absolute`/`fixed`
  to the same element (`cn` does not merge Tailwind conflicts).
- Already applied: `Checkbox`, `RadioGroupItem`, `Switch`, every `IconButton` size, the label of
  `SwitchField`/`CheckboxField`/`RadioGroupOption` (`SwitchField` label also spans the row), and
  `Link layout="standalone"`. `Link` defaults to `layout="inline"` (exempt, unchanged).
- An unavailable `SwitchField` (nothing to switch to) is `aria-disabled`, not `disabled`: it stays
  reachable, the label and the control are muted, and the description holds the reason at normal
  strength. Never fade the whole field with an opacity class; that also fades the reason. The owner
  ignores the toggle (`onCheckedChange`) while the switch is unavailable.
- Hit areas of neighbours can overlap when controls are closer than the target size; the later DOM
  sibling wins. Keep at least the 24px spacing between small targets or rely on the `::after` size
  staying within the row.
- Do not re-implement link-like controls with local classes; use `Link layout="standalone"`.
- Pseudo-elements are not projected to Figma (see the Figma projection guide); the hit area is a
  code-only affordance.

## Button label overflow

`Button` takes `labelOverflow?: 'wrap' | 'truncate' | 'nowrap'` (default `'wrap'`). One line is always
exactly the control height (md 36px, sm 32px), so single-line buttons are pixel-identical to before.

| Mode       | Behaviour                                                                                           | Use                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `wrap`     | label wraps, the button grows taller (`min-h` + derived vertical padding), `max-w-full`, icons stay | default; any user-visible or translated action label                   |
| `truncate` | one line, ellipsis, `min-w-0`                                                                       | dense rows only where the full text exists elsewhere (no auto tooltip) |
| `nowrap`   | one line that never shrinks (the previous behaviour)                                                | fixed-height toolbars where the caller guarantees width                |

There is no `loading` prop: swap the label and set `disabled` (the story keeps the height).
Icons beside a wrapping label are vertically centred and never shrink. `DialogFooter` and
`AlertDialogFooter` give their buttons `min-w-0` so a long label wraps inside the footer.

## Component pattern owners

| Pattern family                                                                                                                            | Owner                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Initial content appearance, status glyphs, progress position, notices, empty states and Markdown document rendering                       | [Feedback and document content components](component-feedback-and-content.md)   |
| Choice surfaces, Select and Combobox, option pickers, context switchers, menu notes, Dialog footers, keyboard avoidance and Drawer sheets | [Input selection and overlay patterns](component-input-and-overlay-patterns.md) |
| Tree recipes, shared document-tree panes, docked search, empty search results and scrolling-region semantics                              | [Tree panes and scrolling regions](component-tree-and-scrolling.md)             |
