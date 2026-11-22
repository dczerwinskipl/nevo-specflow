---
id: reference.configuration.specification-definitions
type: reference
title: Project document types and Specification archetypes
status: current
scope: specflow
areas: [runtime, docs]
tags: [definitions, document-type, specification-archetype, yaml, templates]
read_when:
  - defining a new document type for a project
  - creating a Specification archetype with required and optional documents
  - validating YAML definition files or template paths
summary: >
  Project-scoped YAML definitions of document types and Specification archetypes,
  including validated examples, external template content and CLI validation.
related:
  - architecture.runtime.specification-documents
  - reference.api.specflow-specification-operations
  - reference.api.specification-documents
---

# Project document types and Specification archetypes

Specification archetypes and document types are project data stored in the Project
Home checkout under `.nevo/definitions/`. The Engine reads definitions from that
checkout, including when a Specification is created in a linked worktree.

A document type defines how a document is presented and authored. An archetype
declares required document types and the templates offered during Create.
Each definition uses a separate YAML file whose `kind`, file name and `id` agree.

## Document type

```yaml
# .nevo/definitions/document-type/runbook.yaml
kind: document-type
schemaVersion: 1
id: runbook
title: Runbook
description: Operational steps for running or recovering a system.
useWhen: The change affects how a system is operated.
instructions: List preconditions, numbered steps and expected outcomes.
defaultFilename: runbook.md
icon: list-ordered
```

The `icon` is optional. It names a kebab-case Design System icon; when the
name is not known to the UI, the default icon is displayed.

## Specification archetype

The `overview` document type must exist. Each archetype requires at least
one `overview` document and exactly one `always` template with id `overview`,
type `overview` and filename `overview.md`.

```yaml
# .nevo/definitions/specification-archetype/operations-change.yaml
kind: specification-archetype
schemaVersion: 1
id: operations-change
version: 1
title: Operations change
description: A change with operational impact.
useWhen: The work changes how a system is deployed or operated.
requirements:
  - documentType: overview
    minCount: 1
templates:
  - id: overview
    documentType: overview
    filename: overview.md
    include: always
    contentFile: templates/overview.md
  - id: runbook
    documentType: runbook
    filename: runbook.md
    include: optional
    preselected: true
    content: "# Runbook\n"
```

The `contentFile` above refers to
`.nevo/definitions/specification-archetype/templates/overview.md`, for example:

```markdown
# Overview

## Goal

Describe the operational change and expected result.
```

An archetype may use an inline `content` or `contentFile` for each template,
but not both. `contentFile` is relative to the definition-kind directory,
starts with `templates/` and must identify an existing regular UTF-8 file.
Only an `optional` template may set `preselected`.
`version` is a positive integer; `schemaVersion` is `1` for these definitions.

A `runbook` requirement can also be added when the document must be present
before the Specification is complete; an optional template alone does not
make a document mandatory.

## Validation

```bash
nevo-specflow definitions validate
nevo-specflow definitions list
nevo-specflow definitions show specification-archetype/operations-change
```

The loader rejects unknown YAML fields, unsafe paths, mismatched file names,
missing referenced document types and invalid templates. It reports errors
as definition problems instead of silently repairing files. Changes to the
Project Home's definitions affect new Specifications; existing Specifications
retain their persisted archetype snapshots.

The published schemas are
`packages/specflow-contracts/schema/definitions/document-type.v1.schema.json`
and
`packages/specflow-contracts/schema/definitions/specification-archetype.v1.schema.json`.
For loading, catalogue revisions and validation guarantees, see
[Definitions as project data](../../architecture/runtime/specification-documents.md#definitions-as-project-data).
