---
id: product.specflow.ui.interaction-model
type: product
title: UI interaction model
status: draft
read_when:
  - designing a UI screen, its navigation, or its back behavior
  - choosing between an inline surface, an inspector, a sheet, and a page
  - defining what state is preserved across navigation
summary: >
  Responsive shell (wide with contextual inspector / narrow), the product navigation
  hierarchy, context-preserving drill-down, and when to use a tooltip vs. inspector vs.
  sheet vs. full page.
related:
  - product.specflow.ui.personas
  - product.specflow.ui.ai-session-ux
  - design-system.principles.ui-ux-guidelines
---

# UI interaction model

`status: draft` — working guidance, expanded as the code it governs lands. Screen-by-screen
contracts are filled in with the implementation.

## Interaction principles

- **Preserve context.** Drilling down keeps the user oriented; going back returns them
  to where they were, with scroll and selection intact.
- **Drill-down increases specificity**, not just volume — each level answers a more
  precise question.
- **Back follows the product hierarchy**, not raw browser history.
- **Do not expose the internal model as navigation.** Users navigate product concepts,
  not database entities or provider payloads.
- **A route is not automatically global navigation.** A Session or file can have a deep-linkable
  route without earning a persistent sidebar item.
- **Preserve the current work context when possible.** Use Secondary or floating interaction for
  contextual exploration; use a main workspace route when the user explicitly promotes that context
  into their primary task.

## Responsive shell

| Shell               | Layout                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wide / desktop**  | Persistent primary navigation, a main workspace, and a **contextual inspector** on the right for details that shouldn't replace the workspace. |
| **Narrow / mobile** | Single-column. The inspector's content becomes a sheet or a pushed sub-page. Navigation collapses.                                             |

The hierarchy is identical across breakpoints; only density and whether a level is
inline vs. behind a tap changes.

## Product hierarchy

For the current spec-driven MVP, global product navigation stays deliberately small:

```text
Project
├── Specs
│   ├── Active / Archive
│   └── Specification
│       ├── Task details                  contextual Secondary
│       └── Session                       floating conversation
│           └── Open full session         main workspace/route
│
└── Project settings
    ├── Configuration
    ├── AI / agents
    ├── Workflows
    ├── Repository / Git
    └── Integrations
```

A Full Session is a first-class workspace and may have its own URL, but Sessions are not a global
sidebar area while they remain owned by/spec-driven from Specifications.

Changes, pull requests, documentation, files, Work details, and similar concepts are contextual
surfaces until a proven independent human task justifies promoting them into global navigation.

Within a Full Session:

```text
Session stream
├── Context inspector
├── Work inspector
└── File inspector
```

Opening a Session from Task/Specification first uses a floating conversation so the user can inspect
or interact without abandoning current work. "Open full session" is the explicit promotion to the
main Session workspace.

## Surface choice

| Surface                    | Use for                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Info / tooltip / popover   | A short clarification; no navigation, no actions of substance.                     |
| Floating surface           | Quick interaction with related context, especially a Session, without abandoning the current workspace. |
| Right inspector / Secondary| Details about the current selection that support the workspace without leaving it. |
| Sheet / pushed detail      | Narrow/mobile representation of contextual Secondary/detail.                       |
| Main page / workspace      | A distinct product surface the user explicitly navigated/promoted to.              |

## State preservation

Selection, expansion state, scroll position, and in-progress composer text survive
navigation away and back, and survive a reload where the URL can express the state.
Deep links address product concepts, never internal ids.
