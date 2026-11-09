---
id: ideas.semantic-docs.local-embeddings-playground
type: reference
title: Local embeddings playground
status: draft
scope: specflow
areas:
  - ai
  - testing
tags:
  - embeddings
  - docker
  - ollama
  - local-setup
read_when:
  - running a local embedding model for semantic documentation search
  - manually trying semantic search through the CLI or HTTP API
summary: >
  How to run a local embedding model in Docker (Ollama or Hugging Face TEI), verify the
  OpenAI-compatible endpoint, and what to try once the CLI and API exist.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.configuration-and-init
  - ideas.specflow-runtime.openapi-publication
---

# Local embeddings playground

Semantic search needs an **embedding** model, not a chat model; the agent (Claude, Codex, …)
composes answers from returned chunks. Candidates: Qwen3-Embedding 0.6B (multilingual, small),
`bge-m3`, `nomic-embed-text`.

## Ollama

```powershell
docker run -d --name ollama --gpus all -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec ollama ollama pull qwen3-embedding:0.6b
curl.exe http://127.0.0.1:11434/v1/embeddings -H "Content-Type: application/json" `
  -d '{\"model\":\"qwen3-embedding:0.6b\",\"input\":[\"test\"]}'
```

Drop `--gpus all` without an NVIDIA GPU; the 0.6B model is usable on CPU.

## Hugging Face TEI (alternative)

```powershell
docker run -d --name tei -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-latest `
  --model-id Qwen/Qwen3-Embedding-0.6B
# OpenAI-compatible endpoint: http://127.0.0.1:8080/v1/embeddings
```

## Once implemented

```bash
nevo-specflow docs semantic status
nevo-specflow docs search "how are document commits owned by the engine" --json
nevo-specflow docs semantic eval

nevo-specflow start
curl "http://127.0.0.1:4318/api/docs/search?q=document+commits&limit=5"
# shape: http://127.0.0.1:4318/api/openapi.json
```

The repository would also ship a `compose.yaml` with the Ollama service and model pull.
