---
id: ideas.specflow-runtime.execution-plans.openapi-publication.task-a02
type: engineering
title: 'A02 — Committed OpenAPI document, CI drift check and docs promotion'
status: draft
scope: specflow
areas: [runtime, docs, release, testing]
tags: [execution-task, temporary, implementation, openapi, ci]
read_when:
  - implementing A02 of the OpenAPI publication plan
summary: >
  Write docs/reference/api/openapi.generated.json from the Runtime generation function, fail CI when
  it is stale, document the endpoint and the regeneration workflow, and mark the idea superseded.
related:
  - ideas.specflow-runtime.execution-plans.openapi-publication
  - ideas.specflow-runtime.execution-plans.openapi-publication.task-a01
  - ideas.specflow-runtime.openapi-publication
  - engineering.repository.ci
---

# A02 — Committed OpenAPI document, CI drift check and docs promotion

Temporary task of the [OpenAPI publication plan](../README.md).

## Goal and ownership

The API shape is visible in every pull request diff: a committed generated document, a single
command that writes or checks it, and a CI job that fails on drift.

- Kind/profile: general / `nevo-agents:implementer`.
- Owner paths: a Runtime package script (or a small script owned by `packages/specflow-runtime`) and
  a root `pnpm api:openapi` script in `package.json`; `docs/reference/api/openapi.generated.json`;
  `.github/workflows/ci.yml`; new `docs/reference/api/openapi.md`; `docs/engineering/repository/ci.md`;
  `docs/ideas/specflow-runtime/openapi-publication.md` (status only, plus successor links).
- Prerequisites: A01 (generation function and gap list).
- Minimal context: `engineering.repository.ci`, the `docs:check` / `docs:check --write` pair as the
  pattern to mirror.

## Scope

- `pnpm api:openapi` writes the document; `pnpm api:openapi --check` exits non-zero with a clear
  "stale: run `pnpm api:openapi`" message when the committed file differs. Same implementation for
  both modes.
- Generation uses deterministic fixture configuration (no workstation config, no network, no
  listener) so Linux and Windows produce identical bytes: LF line endings, stable key order, trailing
  newline. The file is excluded from Prettier if Prettier would rewrite it, or written already in
  Prettier's form; choose one and make `format:check` agree.
- The gap list from A01 is printed to stderr as information, never as a failure.
- CI: add the check to a job that already builds `@nevo/specflow-runtime` (for example the engine
  transport smoke job or a small dedicated job using the affected-package detection), not to
  `check:quality`, which builds repository tools only.
- Docs: `reference/api/openapi.md` (what is served, visibility, where the generated file lives, how
  to open it); `ci.md` gains the drift check; the idea gets `status: superseded` and links to both.

## Acceptance

- Committed file matches a fresh generation on Linux CI and on a Windows workstation.
- Changing any route schema without regenerating fails CI; regenerating fixes it.
- `pnpm docs:check` passes; the new reference doc has valid frontmatter and is linked from the
  reference README if one lists API docs.

## Verification

```bash
pnpm api:openapi && git diff --exit-code docs/reference/api/openapi.generated.json
pnpm api:openapi --check
pnpm docs:check
pnpm exec prettier --check docs/reference/api
```

Plus a negative check: edit one schema locally, confirm `--check` fails, revert.

## Review focus (whole-PR gate)

Real failure on drift; byte-stability across OSes; the CI job placement does not add a full product
build; authoritative docs describe behavior, not plans; the idea is superseded, not left competing.

## Out of scope

Viewer UI, schema gap closing, publishing the document outside the repository.
