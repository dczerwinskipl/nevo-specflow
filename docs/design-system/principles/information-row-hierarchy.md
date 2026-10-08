---
id: design-system.principles.information-row-hierarchy
type: engineering
title: Information row hierarchy
status: current
scope: nevo-ui
areas:
  - ui
tags:
  - list
  - rows
  - hierarchy
  - scanning
  - interaction
read_when:
  - designing or implementing repeated informational or operational rows
  - deciding whether a repeated item needs a different row treatment
  - reviewing consistency between repeated items of different entity types
summary: >
  Row-specific semantic and interaction rules for repeated information: apply the canonical
  information roles consistently, keep utility/trailing affordances recognizable, and do not invent
  a new row grammar solely because the entity type changes.
related:
  - design-system.principles.information-hierarchy
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
  - design-system.principles.system-boundary
---

# Information row hierarchy

## Purpose

Repeated informational and operational items should preserve the design system's semantic information
roles and interaction language even when they represent different product entities.

This document is **row-specific**. Canonical typography/emphasis roles are owned by
`design-system.principles.information-hierarchy`. Concrete row/list geometry, scan columns, utility
gutters, track sizing, spacing, separators/containment, and responsive collapse are owned by
`design-system.principles.layout-and-containment`.

The row-specific rule is:

> **Semantic specialization does not imply a new row grammar.**

A Task, Session, Specification, file, integration, setting, or search result may expose different
facts and actions. That difference does not by itself justify different information roles or a
different interaction language.

## Row roles

A repeated row may contain:

- optional utility affordance;
- product facts mapped to the canonical primary/secondary/supporting roles;
- optional semantic supporting information;
- optional trailing affordance.

Do not invent row-local typography roles. Product facts use the canonical information hierarchy.

### Utility affordance

Utility affordances include selection, disclosure, drag handles, or another collection-owned control.

This document owns only the semantic responsibility of that slot. Concrete gutter width, alignment,
and whether the collection reserves the track are layout concerns.

### Trailing affordance

Trailing affordances are bounded actions or compact controls secondary to the row's primary
information.

They use established action/navigation components and remain distinguishable from ordinary
information text.

## Interaction language

Interactive sibling rows should use one coherent interaction language unless their actual interaction
semantics differ.

Selection, navigation, disclosure, and contextual actions should remain recognizable across
comparable collections. A different entity type is not a reason to redefine clickability,
hover/focus/selection meaning, or nested-action behavior.

Concrete radius, focus geometry, cursor/surface treatment, hit areas, and row containment are owned by
layout/component implementation guidance.

The primary row target and nested actions still follow valid interactive-DOM rules. A visually unified
row does not justify invalid nested links/buttons.

## Collection consistency

Comparable collections should preserve one recognizable semantic grammar:

- product facts keep the information roles defined by
  `design-system.principles.information-hierarchy`;
- utility/trailing affordances keep recognizable responsibilities;
- state changes alter content and semantic emphasis without inventing a new information hierarchy;
- missing optional facts disappear rather than causing unrelated facts to change semantic role;
- a different entity type does not create a new row treatment by default.

Different entity types MAY share this row grammar without sharing one generic implementation
component. Reuse of semantic grammar does not require a `GenericRow<T>` abstraction.

## Surface and responsive behavior

Containment, divider ownership, scan geometry, row rhythm, optional track reservation, and responsive
column collapse are governed by `design-system.principles.layout-and-containment`.

This document adds one semantic constraint: stronger containment or a different responsive
presentation must not silently change which information is primary, secondary, supporting, or an
action.

## When a different row grammar is justified

A materially different row grammar is justified only by a user-facing semantic or interaction
difference, for example:

- the object is operated on as a truly independent contained unit;
- heterogeneous media/structure means the user is no longer scanning a normal information row;
- the interaction model is materially different from select/navigate/inspect;
- the owning UX contract intentionally promotes the object to an exceptional summary/attention
  surface.

Entity identity, implementation ownership, different DTO shape, or different feature folder are not
reasons.

When a new grammar is required, the owning UX/design-system contract states the user-facing reason
rather than leaving the deviation as incidental JSX/CSS.

## Review checklist

Before accepting a repeated item treatment, verify:

1. Are product facts mapped to canonical information roles rather than row-local typography?
2. Do comparable entities preserve the same information and interaction language?
3. Are utility/trailing affordances semantically consistent with sibling collections?
4. Does state change meaning without inventing a new row hierarchy?
5. If the row grammar differs materially, is the user-facing reason documented?
6. Are geometry, tracks, spacing, containment, separators, and responsive behavior delegated to
   `design-system.principles.layout-and-containment`?
