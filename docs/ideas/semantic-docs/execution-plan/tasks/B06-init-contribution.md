---
id: ideas.semantic-docs.execution-plan.task-b06
type: engineering
title: 'B06 — Semantic documentation search step in nevo-specflow init'
status: draft
scope: specflow
areas: [cli, configuration, ai, testing]
tags: [execution-task, temporary, implementation, init, embeddings]
read_when:
  - implementing B06 of the semantic documentation search plan
summary: >
  Contribute an optional semantic documentation search step to nevo-specflow init that asks for the
  endpoint and model, probes it immediately, and writes docs.search to project config and endpoint
  details to local config.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b05
  - ideas.semantic-docs.configuration-and-init
  - architecture.runtime.configuration
---

# B06 — Init contribution

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

A fresh `nevo-specflow init` can enable semantic documentation search in one guided step and tells
the user whether it is usable right now.

- Kind/profile: integration / `nevo-agents:implementer`.
- Owner paths: an init contribution module in `packages/specflow-docs/src/` (with tests) exported
  for the shell; `packages/specflow/src/init/cli.ts` (sole owner in this plan: call the docs step
  and merge its project/local sections and summary next to `runtime` and `git`);
  `packages/specflow/test/init*.test.ts`; the init section of the docs configuration reference from
  B05.
- Prerequisites: B05 (configuration module, probe through the engine adapter).
- Minimal context: `packages/specflow/src/init/cli.ts`, `packages/specflow-runtime/src/init/contracts.ts`
  (`RuntimeSetupUi`, `RuntimeInitContribution` shape), B05's configuration module,
  `ideas.semantic-docs.configuration-and-init` (init steps).

## Scope

- Step order and content from the idea: ask to enable (default no); endpoint (default local Ollama
  `http://127.0.0.1:11434/v1`) and model; optional `apiKeyEnv` name, never the secret; probe and
  show reachability, latency and dimension; write `docs.search.semantic: true` to project config and
  the endpoint under `ai.embeddings` in local config; summary line "semantic search enabled" or
  "configured but unavailable — lexical".
- `@nevo/specflow-docs` must not import Runtime: the step declares its own minimal prompt port,
  which the shell satisfies with the existing `RuntimeSetupUi` instance.
- A failed probe does not abort init; the user's answers are still written and the summary states
  the reason.
- The written sections pass B05's validation entry (the step builds them through it, not by
  hand-assembled objects that could diverge).
- No change to `init`'s refusal on an existing `.nevo/config.yaml` (B-D10: existing projects edit
  config manually; documented in the configuration reference).

## Acceptance

- Init tests with a scripted UI cover: declined (no `docs`/`ai` sections written), enabled with a
  reachable fake endpoint, enabled with an unreachable endpoint (config written, lexical summary).
- Generated config loads through both the docs CLI and `loadRuntimeConfig` without error.
- Existing init tests stay green unchanged except for the additional prompt.

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/specflow exec vitest run test/init.test.ts
pnpm --filter @nevo/specflow-docs exec vitest run src/<init contribution test>
pnpm --filter @nevo/specflow typecheck
pnpm --filter @nevo/specflow lint
```

Full suites on Linux/CI.

## Review focus

Secrets never prompted for or written; probe failure handled as a reported state; package
direction; init remains a single flow, not a second configuration writer.

## Out of scope

A reconfigure command for initialized projects (B-D10); Runtime endpoint (B07).
