# First step per archetype in the archetype catalogue

## Goal

Each archetype in `GET /api/specs/archetypes` carries the first step of its bound workflow and
whether an agent can execute it, so the Create form can offer With an agent (D8, C6, architecture.md
S7).

## Scope

- Contracts `documents/catalogue.ts`: `ArchetypeInfoSchema.firstStep?: { id, title, agent }`.
- Engine `specs/archetypes/projection.ts`: `toArchetypeCatalogue` fills it from the archetype's
  execution binding. `agent` is true when the first step is a work step whose executors include
  `agent`. It is absent without a valid binding. `revision` stays the Create admission token.
- Runtime `features/specs/create/catalogue-etag.ts`: the ETag folds in a digest of the `firstStep`
  facts.
- `create-options` does not change.
- Docs: the archetype catalogue's reference or `architecture.runtime.specification-create-options`,
  wherever the catalogue shape is documented.

## Verification

- Unit (Engine): an agent first step (`agent: true`), a human-only first step (`agent: false`), no
  binding and an invalid binding (both absent).
- Runtime route test: changing only the bound workflow's first step changes the ETag, and an
  unchanged catalogue still answers `304`.

## Planning notes

Work kind: backend. Recommended profile: `nevo-agents:implementer`.
