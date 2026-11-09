---
id: ideas.semantic-docs.execution-plan.task-b04
type: engineering
title: 'B04 — Documentation capability package (@nevo/specflow-docs) and nevo-specflow docs'
status: draft
scope: specflow
areas: [docs, cli, configuration, testing]
tags: [execution-task, temporary, implementation, documentation]
read_when:
  - implementing B04 of the semantic documentation search plan
summary: >
  Create @nevo/specflow-docs with the product frontmatter contract, project-configured taxonomy and
  deterministic list/find/get/context/check, expose its Commander adapter at ./cli and mount it in
  the product shell as nevo-specflow docs, with behavioral parity to today's tools/docs.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b01
  - ideas.semantic-docs.docs-capability
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0007-documentation-architecture-and-taxonomy
  - adr.0012-product-package-topology-and-dependency-direction
---

# B04 — Documentation capability package

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

`nevo-specflow docs list|find|get|context|check` works in any project, reading the taxonomy from the
project configuration, and produces exactly what `tools/docs` produces for this repository today.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: new `packages/specflow-docs/**` (manifest with `./` and `./cli` exports, Node package
  profile, `eslint.config.mjs`, `src/**` with co-located tests, a package `test/` tree for
  cross-boundary parity tests); `tools/eslint/boundaries.mjs` (a new `specflowDocsBoundaries`
  entry); `packages/specflow/src/program.ts` (mount `docs`; sole owner in this plan);
  `packages/specflow/package.json`; `pnpm-lock.yaml`; `docs/reference/cli/` (a docs command
  reference for these five commands).
- Prerequisites: B01 (product ADR, B-D3 vocabulary decision). May run in parallel with B02/B03.
- Minimal context: the product ADR from B01, `ideas.semantic-docs.docs-capability`, ADR 0007,
  `tools/docs/src/domain/**`, `tools/docs/src/app/**`, `tools/docs/src/cli/**`,
  `packages/specflow/src/program.ts`, `engineering.cli.architecture`.

## Scope

- Promote the frontmatter contract (types, required fields per type, statuses, inactive statuses,
  `related`/`supersedes`/`superseded_by` resolution), corpus scan, lexical `find`, `get` failing
  closed on inactive documents, `context`, `check` with the generated index (`--write`) from
  `tools/docs`. This is a deliberate promotion: the product code is written for the product
  contract, not copied with repository assumptions.
- Taxonomy from configuration (B-D3, planning assumption): `docs.root` (default `docs`),
  `docs.taxonomy.scopes` and `docs.taxonomy.areas` validated when declared and unrestricted when
  absent, and a project-owned list of non-authoritative path prefixes replacing the hard-coded
  `docs/ideas/**` exclusion. `docs.*` is project-only: a `docs` section in `.nevo/local/config.yaml`
  is rejected at load with a clear message.
- The product shell resolves project root and config paths and passes them to the adapter;
  `@nevo/specflow-docs` does not depend on Engine, Runtime, UI or the shell (lint-enforced). A
  directory without `.nevo/config.yaml` uses the defaults.
- `./cli` exports a `createDocsCommand(context)` factory following the shell's output, error and
  exit-code conventions; `program.ts` mounts it. The command set is designed so B05 adds `search`
  and `semantic` inside the package without touching `program.ts`.
- ADR authoring and repository-only rules are not ported; `tools/docs` is rewired onto the package
  in B08, not here.

## Acceptance

- Parity test on a fixture corpus and on this repository's `docs/` with this repository's taxonomy
  supplied as fixture configuration: `find`, `get`, `context`, `check` output and
  `index.generated.json`/`.md` are identical to today's `tools/docs` results (the generated index
  must not churn when B08 switches).
- Undeclared taxonomy accepts any scope/area; declared taxonomy rejects unknown values with the
  same message shape as today; non-authoritative prefixes are configurable.
- `nevo-specflow docs --help` lists the commands; CLI tests cover exit codes and fail-closed `get`.
- Boundary lint rejects imports of `@nevo/specflow-engine`, `@nevo/specflow-runtime`,
  `@nevo/specflow-ui` and `@nevo/specflow` from the package.

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/specflow-docs exec vitest run test/<parity test> src/<frontmatter test> src/<config test>
pnpm --filter @nevo/specflow exec vitest run test/cli.test.ts
pnpm --filter @nevo/specflow-docs typecheck
pnpm --filter @nevo/specflow-docs lint
pnpm --filter @nevo/specflow-docs build
```

Full suites and the packaged-product smoke on Linux/CI.

## Review focus (heightened gate)

Behavioral parity (agents and `tools/agents` depend on `docs:get`/`docs:find` output); correct
package direction; taxonomy configuration validated at the boundary; no repository vocabulary
hard-coded in the product package.

## Out of scope

Semantic search, `ai.embeddings` and `docs.search` (B05); root scripts and `tools/docs` rewiring,
this repository's `.nevo/config.yaml` (B08); init contribution (B06).
