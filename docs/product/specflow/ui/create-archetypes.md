---
id: product.specflow.ui.create-archetypes
type: product
title: Create Specification archetype selection
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - changing Create archetype selection or catalogue presentation
  - implementing Create method and progress interactions
summary: >-
  Archetype selector behavior, catalogue text, selection/defaults, Create submit and creation progress navigation.
related:
  - product.specflow.ui.documents-archetypes
  - product.specflow.ui.documents-tree
  - product.specflow.specification-creation
---

# Create archetype selection

## Create Specification

### Archetype selection

The Archetype section presents each work type with its `useWhen` guidance. Selecting one reveals the documents it creates and preselected checkboxes for optional documents. Instructions are available behind a disclosure.

### Layout

Placed after Name and Goal and before **Where do you want to work?**, separated by the form's existing
`Separator`s (project form: between the name/goal group and the workspace section; demo form:
`ArchetypeSection` after `CreateBasicsSection`). Below a 992 px form
column the form keeps its reading width (`content-form`, left-aligned in the Focused frame); from it the
section is the last one of the left column, beside the workspace section (see
[Specification creation](../specification-creation.md#user-choices)).

```text
Archetype                                                    h2 title-md
The shape of the work: which documents the specification starts with and which are expected.
You can add, remove or classify documents later.             body-md secondary
( ) Minimal        The work is small, well understood, or exploratory, ...
(•) Feature        One change spans what the product does, how it looks and ...
( ) Architecture   The work reshapes modules, ownership or dependencies, ...
│ > How to work with a Feature specification                 Collapsible, closed
│ Documents to create                                        legend, title-sm
│ ✓ Overview (overview.md) is always created.                InlineNote, icon check
│ [x] Behaviour   behaviour.md · The change alters what the product does ...
│ [x] UX          ux.md · The change has a user-facing interface ...
│ [x] Backend     backend.md · ...
│ [ ] User story  ...
```

- The details of the selected archetype are indented under a single subtle left rule (the lightest
  grouping that ties them to the selection); no surface, no border box.
- One row per `include: always` template as an InlineNote; `optional` templates are `CheckboxField`s
  (label = template title, description = `filename · <type useWhen>`), ticked when `preselected`.
- When unticking a suggestion leaves a requirement of the archetype unmet (only owner-configured
  archetypes do this), the row adds a secondary line: "<archetype> expects a <type> document. Without it
  the specification lists it as missing until you add one." It never blocks Create.
- Changing the archetype restores that archetype's default ticks (ticks are per archetype within the
  visit; switching back restores the user's ticks for it).
- **Wide / Compact:** single column; radio descriptions wrap. **Narrow (390):** same order, no
  horizontal overflow (verified); the radio list is ~170 px for three archetypes.
- Catalogue loading: the section shows the existing options-loading line; Create's prerequisite reads
  "Archetypes are loading". Catalogue failure: Alert (attention) "The archetypes could not be loaded" with
  **Retry**; the rest of the form stays usable and the draft is kept.

### Defaults and submission

- Initial selection: the catalogue's `defaultArchetypeId` when present (demo), else the only archetype
  of a catalogue with one, else none. With nothing selected the radio list has no checked option (its
  first radio is the Tab stop), the documents area shows the quiet prompt "Choose an archetype to see
  the documents Create makes." and Create stays unavailable with the reason "Choose an archetype."
  The same rule applies to a restored draft whose archetype no longer exists and after
  `ARCHETYPE_UNKNOWN`; a stored or chosen archetype that still exists is kept. (Decision Q1.)
- Submit adds `archetypeId`, `archetypeVersion`, `catalogueRevision` and `optionalDocumentIds` (the
  ticked optional template ids) to the Create request. The draft saved for "Back to form" stores the
  archetype id and the ticks.
- `CATALOGUE_STALE`: failure Alert "The archetypes changed while you were filling the form" with
  **Refresh archetypes**; refresh keeps the selected id when it still exists and resets its ticks to the
  new defaults, announcing the change. `ARCHETYPE_UNKNOWN`: same Alert text, the selection falls back to
  the initial rule above (the default, the only archetype, or none).

### Method choice and progress

- The manual method card reads "Create the documents of an archetype and edit them yourself." Other method choices remain available.
- The progress page **Configuration** list shows two rows after the name: **Archetype** (title, primary
  emphasis like other user choices) and **Documents** (the file names that will be created, comma
  separated, wrapping). Both come from the retained request/draft; a row whose value is unknown is not
  shown (today's rule). The steps, status tile, technical details, notes and actions follow the usual Create progress behavior.

## Catalogue copy and terminology

The UI displays archetype titles, descriptions and `useWhen` text as delivered by the catalogue. Built-in catalogue content is English and is not translated through the UI's `en.json` or `pl.json` keys.

The user-facing label is **Archetype / Archetyp**, not **Workflow**. It describes a kind of work and its document expectations, not a workflow state machine. Agent `archetype/role` metadata is a separate concept.
