---
id: docs.readme
type: hub
title: Nevo SpecFlow documentation
status: current
summary: >
  Top-level map of architecture, engineering, design-system, product, reference, and
  instruction documentation.
---

# Nevo SpecFlow documentation

Documentation is organized by responsibility.

Requirements in authoritative docs use [normative language and document authority](architecture/principles/normative-language.md). Current documents are authoritative for the scope they own; drafts MUST NOT override them.

- [Architecture](architecture/) — durable boundaries, invariants, repository structure, ADRs.
- [Engineering](engineering/) — implementation and repository engineering guidance.
- [Design system](design-system/) — reusable Nevo UI principles and implementation guidance.
- [Product](product/) — SpecFlow product behavior and user-facing interaction models.
- [Reference](reference/) — exact contracts and factual lookup material.
- [Instructions](instructions/) — task-oriented routing to authoritative documentation.

For the generated flat index, see [`index.generated.md`](index.generated.md).

## Finding a document

```bash
pnpm docs:list
pnpm docs:find git react testing
pnpm docs:get engineering.repository.git-workflow engineering.shared.testing
pnpm docs:context "react tailwind"
```

`docs:find` accepts multiple terms with OR semantics and returns every matching document unless `--limit` is supplied. Use it for discovery. Use `docs:get` when stable document IDs are already known.

## Authoring

Every authored document carries YAML frontmatter. Generated files and [`templates/`](templates/)
are exempt. Run `pnpm docs:check` to validate the corpus and generated index.
