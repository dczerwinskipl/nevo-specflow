---
id: product.specflow.ui.documents-archetypes
type: product
title: Documents, archetypes and Create UI
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - locating Documents tree, archetype selection or editor UI rules
  - reviewing cross-screen state and accessibility requirements
summary: >-
  Entry point for Documents tree, archetype Create, document tab states and cross-screen interaction contracts.
related:
  - product.specflow.ui.documents-tree
  - product.specflow.ui.create-archetypes
  - product.specflow.ui.documents-cross-screen
  - product.specflow.ui.documents-editor-mode
---

# Documents and archetype UI

The Documents area exposes the Engine registry and file state without reclassifying documents in the UI. Create presents archetypes from the catalogue. Runtime and Engine own availability, document admission and refusal.

| Question                                     | Current behavior owner                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Document tree, requirements and registration | [Documents tree](documents-tree.md)                                                             |
| Archetypes, defaults and Create entry        | [Create archetypes](create-archetypes.md)                                                       |
| Read-only/editable documents, save and tabs  | [Editor mode and tab states](documents-editor-mode.md#document-tab-behavior-and-refusal-states) |
| Shared screen states and accessibility       | [Cross-screen states](documents-cross-screen-states.md)                                         |

## UI boundaries

The Documents tree presents registered, unclassified and missing files alongside unmet document requirements and Close blockers. Creation, classification and removal actions use the Engine's rules.

The Create form displays the catalogue's archetypes and document choices. Its progress screen summarizes the selected archetype and the documents created. Document tabs handle editable and read-only content, save acknowledgement and refusal states, and non-text files.

Catalogue authoring, importing files, document history and changing the archetype of an existing Specification are separate concerns; this page does not define their behavior.
