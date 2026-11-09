---
id: ideas.semantic-docs.execution-plan.task-b09
type: engineering
title: 'B09 — Promotion, supersession and feature verification'
status: draft
scope: specflow
areas: [docs, testing, release]
tags: [execution-task, temporary, verification, documentation]
read_when:
  - implementing B09 of the semantic documentation search plan
  - reviewing the semantic documentation search pull request as a whole
summary: >
  Promote the remaining durable rules of the semantic docs ideas into authoritative documents, mark
  the ideas superseded with successor links, and verify the whole pull request end to end against
  the ideas and ADRs before merge.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b01
  - ideas.semantic-docs.execution-plan.task-b08
  - ideas.semantic-docs
  - ideas.readme
---

# B09 — Promotion, supersession and feature verification

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

After merge no idea document competes with authoritative guidance, and the whole feature is proven
from configuration through CLI and HTTP on CI.

- Kind/profile: general / `nevo-agents:implementer`; the whole-PR gate is reviewed by a separate
  `nevo-agents:reviewer`.
- Owner paths: `docs/ideas/semantic-docs/*.md` (status and successor links only; the
  `ai-package-naming` family table may stay draft if the owner keeps `@nevo/ai-models`/`@nevo/ai-agents`
  as open ideas — then it is narrowed, not superseded); authoritative documents only to fill gaps
  found during the check (CLI, configuration and API references belong to their tasks); an
  end-to-end test in `packages/specflow/test/` if no task covers CLI config → search → result
  contract across packages; `docs/index.generated.*`.
- Prerequisites: B01–B08.
- Minimal context: the plan README, all idea documents, the B01 ADRs, the reference docs written by
  B04–B08, `ideas.readme` (promotion rule).

## Scope

- Walk every durable rule of the six ideas and confirm it lives in exactly one authoritative home
  (ADR, architecture, reference or engineering doc); add missing ones, never copy the same normative
  rule into two places.
- Ideas fully realized get `status: superseded` with `superseded_by` pointing to their successors;
  the hub keeps only the still-open topics (contextual help, other corpora, watcher) or is
  superseded with a successor hub link. The open question "ADR authoring stays in `tools/docs`" and
  "Runtime endpoint in the same PR" are recorded as decided by B01.
- Cross-package contract check, in-process with the deterministic fake embedder (no HTTP fake, no
  packaged artifact, no repository `docs/` scan — see the plan's test budget): a fixture project
  config with `docs.search.semantic` → the `docs search --json` command and the
  `GET /api/docs/search` handler (Fastify `inject`) return results valid against the same contract.
  Add it only if B05/B07 tests do not already cover it.
- Confirm the plan's exit criteria and that this plan is ready to be retired after merge.

## Acceptance

- No `draft` idea in `docs/ideas/semantic-docs/` describes behavior that now exists differently.
- `pnpm docs:check` passes; `pnpm docs:get` of each superseded idea fails closed and names its
  successor.
- Linux CI green: full package suites, lint, build, OpenAPI drift check, packaged product smoke.
- Every plan-README open decision maps to an authoritative answer.

## Verification

Targeted (Windows-safe):

```bash
pnpm docs:check
pnpm docs:context
pnpm --filter @nevo/specflow exec vitest run test/<end-to-end docs search test>
```

Full `pnpm check` and the packaged smoke on Linux/CI.

## Review focus (whole-PR gate)

Whole-PR review against all ideas and ADRs: package direction, no native modules, lexical fallback,
ownership validation, authorization, freshness without a watcher, parity of deterministic commands,
and that authoritative docs describe how things work while plans stay in ideas.

## Out of scope

Contextual help UX; retiring this plan (after merge); new features found during review (reported
back to planning, not added here).
