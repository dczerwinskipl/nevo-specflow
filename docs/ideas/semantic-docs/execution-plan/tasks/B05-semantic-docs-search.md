---
id: ideas.semantic-docs.execution-plan.task-b05
type: engineering
title: 'B05 — Semantic docs search, configuration and result contract'
status: draft
scope: specflow
areas: [ai, docs, cli, configuration, security, testing]
tags: [execution-task, temporary, implementation, semantic-search, embeddings]
read_when:
  - implementing B05 of the semantic documentation search plan
summary: >
  Add docs search and docs semantic status|index to @nevo/specflow-docs on top of the semantic
  engine, parse and validate docs.search and ai.embeddings with ownership rules, keep the index in
  the disposable cache, and define the search result contract in @nevo/specflow-contracts.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b03
  - ideas.semantic-docs.execution-plan.task-b04
  - ideas.semantic-docs.configuration-and-init
  - ideas.semantic-docs.docs-capability
  - ideas.semantic-docs.index-freshness
  - architecture.runtime.configuration
---

# B05 — Semantic docs search and configuration

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

`nevo-specflow docs search "<question>"` returns ranked chunks grouped by document, in hybrid mode
when an embedding endpoint is configured and reachable and in lexical mode with a stated reason
otherwise, and never fails because of the embedding endpoint.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: `packages/specflow-docs/src/**` (search use case, docs chunk source with contextual
  header, configuration module for `docs.search` and `ai.embeddings`, `search`/`semantic` commands
  under `./cli`); `packages/specflow-docs/package.json` (dependency on `@nevo/ai-semantic-search`
  and `@nevo/specflow-contracts`); `packages/specflow-contracts/src/docs/` (new, sole owner of the
  search result contract, exported like the existing contract areas); `pnpm-lock.yaml`;
  `docs/reference/cli/` docs command reference (extend B04's page) and a new
  `docs/reference/configuration/` page for `docs` and `ai.embeddings`.
- Prerequisites: B03 (file-backed store, refresh), B04 (package, corpus, CLI adapter).
- Minimal context: B01 ADRs, `architecture.runtime.configuration`,
  `ideas.semantic-docs.configuration-and-init` (effective mode table), B02/B03 public API,
  `packages/specflow-contracts/src/runtime/index.ts` as a contract pattern.

## Scope

- Configuration (B-D4, planning assumption): a self-contained module in `@nevo/specflow-docs` parses
  `docs.search.semantic` (project-only) and `ai.embeddings` (`protocol`, `baseUrl`, `model`,
  `dimensions`, `apiKeyEnv`, `queryInstruction`, `batchSize`, `timeoutMs`; project and local, local
  wins per key). Secrets are never read from configuration: an `apiKey`-like literal is rejected;
  only `apiKeyEnv` names a variable, read at call time. The module exports one validation entry
  that Runtime (B07) calls so both entry points apply identical ownership rules.
- Effective mode exactly per the idea's table: not enabled, no endpoint, probe failure/timeout,
  index model mismatch (lexical until reindex), index building, otherwise hybrid. Every result
  carries `mode` and, when lexical, `reason`.
- Index under `.nevo/local/cache/docs-index/` (B-D5) of the project root; read-time refresh on every
  `search` unless `--no-refresh`; Runtime-start refresh is B07's (B-D6, no invalidation API).
- `search` options: `--limit`, `--json`, `--no-refresh`, and the switch including non-authoritative
  prefixes (default excluded); status filtering matches `context` (no inactive documents). Each
  hit: id, title, heading path, snippet, score, and a `get` hint.
- `semantic status` (exit non-zero when semantic mode is configured but unavailable) and `semantic
index` (explicit rebuild). No `semantic eval` (B-D11: dropped by the owner).
- Result contract (TypeBox schema + type) in `@nevo/specflow-contracts`; the CLI `--json` output
  and B07's HTTP response are the same contract.

## Acceptance

- Every row of the effective-mode table has a test with the fake embedder or a fake endpoint; none
  of them makes a command exit non-zero except `semantic status`.
- Ownership: `docs.search` in local config is rejected; `ai.embeddings` merges per key; a secret
  value in project or local config is rejected at load with a clear message.
- Hybrid results with a fake embedder are deterministic; lexical fallback returns BM25 chunk
  results, not an empty list.
- `--json` output validates against the contract schema.
- `find`/`get` behavior and output are unchanged (B04 parity tests stay green).

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/specflow-docs exec vitest run src/<config test> src/<search test> src/<mode test> src/<cli search test>
pnpm --filter @nevo/specflow-contracts exec vitest run src/docs
pnpm --filter @nevo/specflow-docs typecheck
pnpm --filter @nevo/specflow-contracts typecheck
pnpm --filter @nevo/specflow-docs lint
```

Manual owner check (not CI): `docs semantic status` and a few `docs search` queries against a
local Ollama. Full suites on Linux/CI.

## Review focus (heightened gate)

Lexical fallback never fails a command; every result states `mode`/`reason`; secrets never read
from project config; configuration validated at the boundary (prevent-don't-recover); the contract
is the single shape for CLI and HTTP.

## Out of scope

Init prompts (B06); Runtime endpoint and start refresh (B07); repository config and agent routing
(B08); a reconfigure command (B-D10: deferred to re-run setup / UI Settings); `semantic eval` (B-D11).
