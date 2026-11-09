---
id: ideas.semantic-docs.configuration-and-init
type: architecture
title: Semantic docs configuration and init
status: draft
scope: specflow
areas:
  - configuration
  - ai
  - cli
  - security
tags:
  - embeddings
  - init
  - semantic-search
  - providers
read_when:
  - designing `ai.embeddings` or `docs` configuration sections
  - adding a semantic search step to `nevo-specflow init`
  - deciding when semantic search is enabled or falls back to lexical
summary: >
  Proposal for configuring embedding endpoints once under `ai.embeddings` (project + local),
  feature opt-in under `docs.search.semantic`, an init contribution with a connectivity probe,
  and explicit lexical fallback whenever vectors cannot be obtained.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.docs-capability
  - architecture.runtime.configuration
---

# Semantic docs configuration and init

## Shape

Top-level sections are capability-owned namespaces (`runtime`, `specs`, `sessions`, …). The
embedding endpoint is configured **once** under `ai`, and features opt in:

```yaml
# .nevo/config.yaml (project, committed)
docs:
  root: docs
  taxonomy:
    scopes: [shared, repo, specflow, nevo-ui]
    areas: [ai, workflow, runtime, docs]
  search:
    semantic: true # use semantic mode when an embedding endpoint is available
ai:
  embeddings: # optional team/company default
    model: qwen3-embedding:0.6b
    baseUrl: https://embeddings.example.com/v1

# .nevo/local/config.yaml (workstation, ignored)
ai:
  embeddings:
    protocol: openai-compatible
    baseUrl: http://127.0.0.1:11434/v1 # overrides project
    model: qwen3-embedding:0.6b
    dimensions: 1024 # optional, verified by probe
    apiKeyEnv: OPENAI_API_KEY # variable name, never the secret itself
    queryInstruction: 'Given a question, retrieve relevant project documentation'
    batchSize: 32
    timeoutMs: 10000
```

Why `protocol` + `baseUrl` instead of `provider: ollama`: one OpenAI-compatible adapter serves
local and external hosts alike; the URL alone is not enough because the index depends on model and
dimensions.

Ownership rules (to validate at the boundary like `runtime` ownership today):

- secrets never in project config; API keys only via environment variable reference;
- `docs.taxonomy` and `docs.search` are project-only;
- `ai.embeddings` may appear in both; local wins per key.

`sessions.providers` (agent CLI drivers) stays where it is; see [AI package naming](ai-package-naming.md).

## Effective mode

| Condition                               | Mode                  | Reported reason                   |
| --------------------------------------- | --------------------- | --------------------------------- |
| `docs.search.semantic` absent/false     | lexical               | semantic search not enabled       |
| no `ai.embeddings` endpoint             | lexical               | no embedding endpoint configured  |
| probe fails / timeout                   | lexical               | endpoint unreachable (`<detail>`) |
| dimension or model mismatch with config | lexical until reindex | index model mismatch              |
| index still building                    | lexical               | index building                    |
| otherwise                               | hybrid                | —                                 |

The fallback never fails a command; `docs semantic status` is the explicit check and exits non-zero
when semantic mode is configured but unavailable.

## Init contribution

`nevo-specflow init` gains a docs/semantic step through the existing init contribution mechanism:

1. ask whether to enable semantic documentation search;
2. ask for endpoint (default local Ollama URL) and model;
3. run the probe immediately and show reachability, latency and dimension;
4. write `docs.search.semantic` to project config and endpoint details to local config;
5. summary line: "semantic search enabled" or "configured but unavailable → lexical".
