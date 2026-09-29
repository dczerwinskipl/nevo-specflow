---
id: design-system.principles.system-boundary
type: architecture
title: Nevo UI system boundary
status: current
read_when:
  - deciding whether a component belongs to Nevo UI or Nevo SpecFlow UI
  - extracting shared UI behavior from a product feature
  - designing a reusable interaction primitive or headless behavior
summary: >
  Nevo UI owns reusable visual primitives, interaction behavior, accessibility and
  generic layout mechanics. Product routing, domain concepts, permissions and
  workflow-specific behavior remain in product applications. Reuse follows shared
  behavior, not merely similar markup.
related:
  - design-system.principles.ui-ux-guidelines
  - design-system.implementation.react.component-guidelines
  - product.specflow.ui.interaction-model
  - architecture.principles.normative-language
---

# Nevo UI system boundary

Nevo UI is a reusable design system/component platform. Nevo SpecFlow UI is one product
application that consumes it.

## What belongs in Nevo UI

Nevo UI owns reusable:

- visual primitives;
- interaction patterns;
- accessibility behavior;
- generic state handling;
- layout mechanics;
- headless behavior whose visual representation may vary by application.

## What stays in the product

Product applications own:

- routing and route definitions;
- domain concepts and business data;
- permissions and authorization decisions;
- feature-specific copy;
- workflow/session/task/repository semantics;
- product-specific information architecture.

A useful test: if a component's public meaning requires terms such as Specification, Task, Agent,
Repository, Model, or Execution Mode, it is probably a product component rather than a design-system
primitive.

## Composition over configuration explosion

Do not make one generic component absorb every product variation through many boolean/config props.

Reusable design-system abstractions SHOULD use behavior plus composition instead of configuration
explosion. A shared component SHOULD represent a real common interaction/state/layout contract,
not merely similar JSX.

## Headless behavior when representation varies

When applications can share behavior but need different visuals, extract the behavior/state model
rather than forcing one visual implementation.

A visual component may support a narrower subset than the underlying behavior model. That
limitation is part of the visual component's contract, not a hidden degradation mode.

## No silent degradation

If a visual implementation cannot faithfully represent supplied data, it MUST NOT silently flatten,
drop, or reinterpret it.

Fail or warn explicitly in development, or require the caller to choose a supported representation.

## Accessibility belongs to the interaction owner

A reusable component that owns an interaction pattern also owns its accessibility contract:
semantics, keyboard behavior, focus behavior, and relevant assistive-technology expectations.

Accessibility is not delegated to every consumer independently.

## Consumer-driven growth

Add reusable components because real consumers demonstrate shared behavior/API needs, not because a
component might be useful someday.
