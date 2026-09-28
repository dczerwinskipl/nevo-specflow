---
id: design-system.figma.code-to-figma-projection
type: architecture
title: Code-to-Figma projection boundary
status: current
read_when:
  - changing how Nevo UI components are exported to Figma
  - deciding whether Figma or runtime code owns a design property
  - adding capture metadata, importer behavior, stable IDs, or a new representation capability
summary: >
  Runtime React/CSS is the visual source of truth. Figma is a downstream projection
  through typed capture metadata and canonical IR. Import/export infrastructure stays
  generic, stable IDs are durable migration identities, and component-specific cases do
  not leak into the importer.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.storybook.guidelines
  - architecture.principles.normative-language
---

# Code-to-Figma projection boundary

Nevo UI is authored in runtime code. Figma is a synchronized downstream representation, not a
second independent design-system source of truth.

## Source of truth

React component APIs, variant recipes, semantic tokens, and computed runtime layout/paint own the
normal visual contract.

The Figma adapter captures and projects that contract. It MUST NOT require authors to duplicate
ordinary variant lists, default values, spacing, radii, or token bindings in a second model.

## Explicit metadata is for semantics the browser cannot infer

Author capture metadata only when DOM/CSS cannot communicate intent unambiguously, for example:

- public slot identity and meaning;
- a Figma property name;
- parent-property to nested-property mapping;
- stable component/variant identity;
- canonical capture viewport;
- an intentional simplified projection of dynamic runtime layout;
- a genuinely additional Figma-only representation axis.

Ordinary appearance and geometry MUST come from rendered DOM/computed CSS unless an explicit
capture/projection contract declares the part that cannot be inferred safely.

## Capture must not infect the public component API

Capture support is infrastructure.

Technical capture attributes MAY exist in a controlled capture environment, but consumers MUST NOT
need Figma-specific props or wrappers to use a normal component.

Runtime product code MUST NOT import project-specific exporter/importer registries.

## Canonical IR separates capture from Figma mutation

The boundary is:

```text
runtime component + computed CSS + typed capture metadata
        ↓
canonical, validated IR
        ↓
generic Figma importer
```

The importer consumes representation semantics, not product/component names.

A new normal component using already-supported primitives MUST NOT require a component-specific
branch in extractor or importer code.

Extend the adapter only when a genuinely new representation capability is required, such as a new
asset kind, paint/effect model, responsive representation, or layout primitive.

## Generic importer, project-owned declarations

Project declarations may identify the project's components, resources, slots, variants, and
intentional projection overrides.

Generic importer/exporter code MUST NOT know that a specific component is Button, AppShell,
SpecFlow, or another named product component.

## Stable identity is durable

Stable IDs for components, variants, resources, slots, and managed nested layers are migration
identities.

Durable identity MUST NOT be derived from display text, story order, or incidental child indexes
when a semantic key exists.

Changing an ID scheme MUST be treated as a migration decision because existing Figma
instances/overrides MAY depend on it.

## Reconciliation ownership

The importer manages only content explicitly owned by the integration.

Repeated synchronization reconciles managed content by stable ID:

- create missing managed items;
- update existing managed items;
- remove stale managed items when the contract says full reconciliation;
- preserve unmanaged/manual Figma content.

The importer MUST NOT adopt or delete arbitrary manual content merely because its display name
matches.

## Preserve instance intent

A repeated import MUST preserve consumer instance overrides where the canonical component identity
and property identity remain valid.

Changing component definitions MUST NOT recreate instances in a way that erases valid
label/icon/property overrides.

## Diagnose unsupported projection

Browser CSS is broader than Figma Auto Layout/paint semantics.

Unsupported transforms, stacking behavior, complex grid, effects, or responsive behavior MUST
produce explicit projection diagnostics or require an authored projection override. Do not silently claim
pixel fidelity the adapter cannot represent.

## Storybook and capture have different jobs

Storybook is the human documentation/review surface.

Technical capture stories/fixtures MAY exist for deterministic extraction, but they MUST NOT
pollute the normal Storybook navigation. Human-readable stories remain independently named and
reviewable.
