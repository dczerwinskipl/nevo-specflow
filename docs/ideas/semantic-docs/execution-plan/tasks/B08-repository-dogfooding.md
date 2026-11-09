---
id: ideas.semantic-docs.execution-plan.task-b08
type: engineering
title: 'B08 — Repository dogfooding, agent routing and local embeddings compose'
status: draft
scope: repo
areas: [docs, cli, configuration, ai, testing]
tags: [execution-task, temporary, implementation, dogfooding, agents]
read_when:
  - implementing B08 of the semantic documentation search plan
summary: >
  Switch this repository's pnpm docs scripts to the product documentation capability through a thin
  tools/docs launcher, declare the repository taxonomy in .nevo/config.yaml, add the search versus
  find routing rule to agent instructions, and ship compose.yaml for a local Ollama embedding model.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b04
  - ideas.semantic-docs.execution-plan.task-b05
  - ideas.semantic-docs.docs-capability
  - ideas.semantic-docs.local-embeddings-playground
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - engineering.repository.dogfooding
---

# B08 — Repository dogfooding and agent routing

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

This repository uses the product documentation capability for every `pnpm docs:*` call, agents know
when to use `docs search` versus `docs find`, and the owner can run a local embedding model with one
command.

- Kind/profile: general / `nevo-agents:implementer`.
- Owner paths: root `package.json` (`docs:*` scripts, new `docs:search`/`docs:semantic`,
  `quality:build-prerequisites`); `tools/docs/**` (rewired onto `@nevo/specflow-docs`: launcher
  mounting `createDocsCommand` plus the retained `adr` command and repository-only checks;
  duplicated domain/app code removed; golden set file for `semantic eval`, B-D11);
  `.nevo/config.yaml` (new, B-D1); `.nevo/agents/instructions/repository-knowledge.md`,
  `.nevo/agent-instructions.md` and the generated provider skills (regenerated with
  `pnpm agents:build`, never hand-edited); `compose.yaml` (new); `packages/specflow/test/packaging.smoke.test.ts`
  (installed `nevo-specflow docs --help` and one `docs get`); `.github/workflows/*.yml` only if a
  build filter or path list names `nevo-repo-docs`; `docs/engineering/repository/local-setup.md` and
  `docs/engineering/repository/dogfooding.md`.
- Prerequisites: B04 (package, CLI adapter, parity), B05 (`search`, `semantic`).
- Minimal context: B01 ADRs, `engineering.repository.dogfooding`, `engineering.repository.ci`,
  `.nevo/agents/instructions/repository-knowledge.md`, `tools/agents/src/render.ts` (renders
  `pnpm docs:get`), root `package.json`, `tools/docs/src/**`.

## Scope

- B-D2 (planning assumption): root scripts build `@nevo/specflow-docs` and its dependencies only
  (`turbo run build --filter`), not the bundled product; script names stay `docs:list|find|get|
context|check|adr` so agent projections and CI keep working. `check:quality` and its build
  prerequisites keep building only what the launcher needs.
- B-D1 (planning assumption): commit a complete project `.nevo/config.yaml` for this repository —
  trusted local loopback `runtime`, `git` settings matching current repository practice, and `docs`
  with root, this repository's scopes and areas and `docs/ideas/` as non-authoritative. If the owner
  chose the docs-only fallback, `start`/`init` refusal messages are part of this task instead.
  Verify that `nevo-specflow start` from the repository root either works or fails with a clear
  message (no half-initialized project home), and that no existing test reads the repository root
  as a SpecFlow project by accident.
- The repository-knowledge instruction gains one routing rule: natural-language question or unknown
  vocabulary → `docs search`; known terms or taxonomy filters → `docs find`; always read selected
  documents in full with `docs get`. Results state their `mode`, so agents need not know whether
  semantic mode is on.
- `compose.yaml`: Ollama service with a persistent volume and a one-shot model pull of
  `qwen3-embedding:0.6b`, CPU by default; the local setup doc explains enabling it through
  `.nevo/local/config.yaml` and checking `pnpm docs:semantic status`.

## Acceptance

- `pnpm docs:check` and `pnpm docs:check --write` produce no diff in `docs/index.generated.*`
  compared with before the switch.
- `pnpm docs:find`, `docs:get`, `docs:context`, `docs:adr` behave as before; `docs:search` works in
  lexical mode with no endpoint configured.
- `tools/docs` no longer contains a second implementation of the frontmatter contract, corpus or
  lexical search (it imports the product package; the package does not import `tools/docs`).
- `pnpm agents:check` passes; generated skills contain the routing rule.
- Packaged smoke asserts `nevo-specflow docs --help` and one `docs get` from the installed artifact.

## Verification

Targeted (Windows-safe):

```bash
pnpm docs:check
pnpm docs:find semantic search
pnpm docs:get engineering.repository.dogfooding
pnpm docs:search "how are document commits owned by the engine"
pnpm agents:check
pnpm --filter nevo-repo-docs exec vitest run <launcher test>
pnpm --filter nevo-repo-docs lint
```

Packaged smoke (`pnpm --filter @nevo/specflow test:packaged`) and `check:quality` on Linux/CI.
Manual owner check: `docker compose up`, then `pnpm docs:semantic status` reports hybrid availability.

## Review focus

No duplicated documentation logic left in `tools/docs`; ADR 0005 direction (tool on product, not
reverse); generated index stability; agent instructions edited only in canonical sources; the
committed project config is honest and does not break `start` or existing tests.

## Out of scope

Superseding the ideas and promoting remaining rules (B09); CI execution of `semantic eval`.
