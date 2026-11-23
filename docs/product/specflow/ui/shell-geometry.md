---
id: product.specflow.ui.shell-geometry
type: product
title: SpecFlow screen geometry contract map
status: current
read_when:
  - locating the geometry owner for Specifications, Create, Overview or Full Session
  - changing the Focused frame or a screen's workspace sizing
summary: >-
  Current geometry owners for the Focused frame, Create, Specification Overview, document
  workspaces and Session inspectors; historical alternatives are separate audit evidence.
related:
  - design-system.principles.layout-and-containment
  - design-system.implementation.react.secondary-navigation
  - product.specflow.specification-creation
  - product.specflow.ui.interaction-model
  - product.specflow.ui.specification-overview
  - product.specflow.ui.specs-overview
  - product.specflow.ui.full-session
---

# SpecFlow screen geometry contract map

Read the owning contract for the surface being changed. This map defines no alternative sizing
policy and does not reproduce screen or design-system rules.

| Concern                                           | Current owner                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Focused frame and bounded workspace               | [Layout and containment](../../../design-system/principles/layout-and-containment.md#bounded-workspace-rule) |
| Shared fit, split, scroll and inspector mechanics | [Secondary navigation](../../../design-system/implementation/react/secondary-navigation.md)                  |
| Specifications collection tracks                  | [Specifications list](specs-overview.md)                                                                     |
| Create form and workspace choices                 | [Specification creation](../specification-creation.md)                                                       |
| Create progress-page frame                        | [Create progress](../specification-create-progress.md#the-progress-page)                                     |
| Overview columns and Activity history             | [Specification Overview](specification-overview.md)                                                          |
| Session conversation and inspectors               | [Full Session](full-session.md)                                                                              |
| Route and Specification context                   | [Interaction model](interaction-model.md)                                                                    |

## Historical alternatives

The [November 2026 geometry record](../../../ideas/audits/2026-11-shell-geometry.md) preserves
rejected alternatives and observations as draft audit evidence, not current behavior or an
up-to-date backlog. Session context now comes from the association read; absence of an association
means standalone, not a missing ownership mechanism.
