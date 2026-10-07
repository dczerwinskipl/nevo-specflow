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
  - typography
  - scanning
  - interaction
read_when:
  - designing or implementing repeated informational or operational rows
  - deciding whether a repeated item needs a Card or a new visual treatment
  - reviewing consistency between lists of different entity types
summary: >
  Semantic hierarchy for repeated information rows: primary and secondary information, optional
  semantic supporting information, utility/trailing affordance roles, consistent interaction
  language, and the rule that different entity semantics do not justify visual reinvention by default.
related:
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
  - design-system.principles.system-boundary
---

# Information row hierarchy

## Purpose

Repeated informational and operational items should look like parts of one design system even when
they represent different product entities.

The default rule is:

> **Semantic specialization does not imply visual reinvention.**

A Task, Session, Specification, file, integration, setting, search result, or another entity may need
different fields and actions. That difference does not by itself justify a different information
hierarchy or interaction language.

When two repeated items serve a comparable scan/select/navigate responsibility, start from the same
information-row semantics and specialize only the information and actions that actually differ.

Concrete row/list geometry, scan columns, utility gutters, track sizing, dividers/containment, and
responsive column collapse are owned by `design-system.principles.layout-and-containment`.

## Default anatomy

A normal information row is composed from these semantic roles:

- optional utility;
- primary information;
- secondary information;
- optional semantic supporting information;
- optional trailing affordance.

These are information/interaction roles, not a geometry contract. A row does not need every role.
Their concrete placement and responsive layout are governed by
`design-system.principles.layout-and-containment`.

### Primary information

Primary information answers **what is this?**

Typical examples are a title, name, or stable human-facing identity.

It owns the strongest normal text hierarchy in the row. Use the design system's semantic typography
roles rather than introducing entity-specific font sizing.

### Secondary information

Secondary information answers **what is the concise context I need after identifying it?**

Typical examples are:

- stable key or short identifier;
- progress/count;
- time or owner metadata;
- compact lifecycle/state summary;
- relationship metadata.

It is visually quieter than the primary information.

Do not promote ordinary metadata to badge/card/heading treatment merely because space is available.
The owning layout contract decides whether secondary information is inline, on another line, or in a
stable comparison track.

### Semantic supporting information

A row MAY expose one additional supporting fact when it materially changes how the user interprets or
acts on the item.

Examples include:

- warning/attention reason;
- current activity;
- blocked/unavailable reason;
- meaningful external/source indicator.

Use restrained semantic treatment. An icon MAY support recognition when the design system already has
a stable icon meaning, but icon + colour should not become decorative noise or duplicate text that is
already obvious.

Supporting information is not a license for a new Card, nested panel, or unrelated micro-layout.

### Utility and trailing affordances

Utility roles include affordances such as selection, disclosure, drag handles, or a semantic marker
when the collection owns one.

Trailing roles include bounded actions or compact metadata that are secondary to the row's primary
information.

This document owns the semantic role and relative hierarchy of those affordances. Their concrete
gutters, tracks, alignment, and responsive movement are governed by
`design-system.principles.layout-and-containment`.

## Surface and separation

Whether repeated information renders as a flat row/list, uses dividers, or earns stronger Card/
surface containment is governed by `design-system.principles.layout-and-containment`.

This hierarchy document contributes only the semantic constraint: stronger containment must not be
introduced merely because one entity type or one row feels more important. Prominence should first be
expressed through information hierarchy or semantic supporting information unless the shared
containment rules justify a different surface.

## Interaction treatment

Interactive sibling rows should use one coherent interaction language unless their actual interaction
semantics differ.

Selection, navigation, disclosure, and contextual actions should remain recognizable across comparable
collections. A different entity type is not a reason to redefine what hover/focus/selection means.

Concrete radius, focus geometry, state surfaces, and row containment are owned by
`design-system.principles.layout-and-containment` and component implementation guidance.

The primary row target and nested actions still follow valid interactive-DOM rules. A visually unified
row does not justify invalid nested links/buttons.

## Collection consistency

Comparable collections should preserve one recognizable information hierarchy across their items and
states:

- the same semantic role should keep the same typographic/emphasis level;
- primary information remains primary;
- secondary information remains quieter;
- semantic supporting information appears only when it materially helps interpretation/action;
- utility and trailing affordances keep the same role even when the concrete control differs;
- state changes alter content and semantic emphasis without inventing a new information hierarchy.

Different entity types MAY share this hierarchy without sharing one generic implementation component.
Reuse of semantic grammar does not require a `GenericRow<T>` abstraction.

Product components remain free to own their semantics and bounded presentation models. Collection
geometry/rhythm remains owned by `design-system.principles.layout-and-containment`.

## Responsive semantics

Responsive layout is owned by `design-system.principles.layout-and-containment`.

This document only constrains semantic priority during collapse: primary information must remain the
first answer; secondary/supporting information must not accidentally outrank it because of layout
pressure; tertiary information may disappear only when the owning product contract allows it.

## When to introduce a different row grammar

A materially different visual grammar is justified only by a user-facing semantic or interaction
difference, for example:

- the object is truly independently contained and operated on as a unit;
- the item contains heterogeneous media/structure that cannot be scanned as a normal row;
- the interaction model is materially different from select/navigate/inspect;
- the product contract intentionally promotes the object to an exceptional summary/attention surface.

Entity identity, implementation ownership, different DTO shape, or different feature folder are not
reasons.

When a new grammar is required, the owning UX/design-system contract should state the user-facing
reason rather than leaving the deviation as incidental CSS.

## Review checklist

Before accepting a new repeated item treatment, verify:

1. Is primary information obvious and typographically consistent with neighboring patterns?
2. Is secondary information visibly quieter?
3. Is semantic supporting information restrained and actually useful?
4. Do utility/trailing affordances keep recognizable semantic roles?
5. Does a different entity type preserve the established information/interaction language by default?
6. If the semantic hierarchy or interaction language differs materially, is the user-facing reason
   documented?
7. Are geometry, containment, divider, track, and responsive decisions delegated to
   `design-system.principles.layout-and-containment` rather than redefined here?
