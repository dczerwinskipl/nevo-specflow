---
id: ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
type: engineering
title: Provider diagnostics and protocol replay
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - diagnostics
  - replay
  - fixtures
  - protocol
read_when:
  - adding a provider environment check
  - debugging provider installation/auth/version problems
  - adding regression coverage for provider protocol drift
summary: >
  Keep cheap availability separate from an explicit provider diagnostic lane, and make provider
  event parsing replayable from minimized fixtures so protocol bugs become deterministic tests
  instead of requiring reproduction against a live CLI.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.raw-diagnostics-retention
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.output-semantics
  - ideas.specflow-runtime.ai-adapters.protocol-examples
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.model-selection-effort
  - ideas.specflow-runtime.ai-adapters.provider-error-examples
---

# Provider diagnostics and protocol replay

## Two different questions

Do not overload one `isAvailable()` boolean with every provider health concern.

### Availability

Cheap, safe, frequently callable:

- executable/transport resolvable;
- basic version probe succeeds within a short timeout;
- no network/auth side effects unless explicitly part of the provider's cheap contract.

### Diagnose / test environment

Explicit and richer:

- executable path and version;
- supported protocol/version features;
- authentication state where safely testable;
- configured model existence where deterministically testable;
- cwd/workspace accessibility;
- required temp/config path writability;
- MCP/bridge reachability if the selected transport needs it;
- provider-specific compatibility constraints;
- relevant platform limitations.

A candidate API name could be `diagnose()` or `testEnvironment()`; exact naming is not decided here.

## Diagnostic result shape

Prefer independent checks instead of one opaque boolean:

```text
checks:
  executable
  version
  authentication
  protocol
  workspace
  interactionBridge
overall:
  ready | degraded | unavailable
```

Each check should have:

- stable machine-readable code/status;
- concise safe user message;
- optional bounded technical details;
- remediation/recovery hint when known.

Do not expose raw command output by default.

## Redaction

Diagnostic helpers must assume provider output may contain sensitive material.

At minimum consider redaction for:

- bearer/API tokens;
- OAuth/refresh tokens;
- authorization headers;
- obvious credential environment values;
- signed URLs/query credentials where recognizable.

Bound detail length so a failed probe cannot dump megabytes into runtime state.

## Parser separation

Where provider integration currently mixes:

- process spawn/lifetime;
- line buffering;
- JSON parsing;
- protocol interpretation;
- canonical event emission;
- error classification;

extract a pure/testable protocol interpretation layer where practical.

The target does not need a universal parser framework. The useful property is:

```text
raw provider event sequence
  -> provider parser/interpreter
  -> normalized adapter events/evidence
  -> canonical Runtime mapping
```

Process orchestration remains outside the pure replay path.

## Replay harness

For each provider, tests should be able to feed captured/minimized NDJSON/JSON-RPC/event fixtures
without launching the real CLI.

Fixture expectations may assert:

- commentary/reasoning/final-answer classification;
- tool start/update/completion;
- session establishment;
- usage extraction;
- error class and retry metadata;
- terminal disposition;
- unknown event behavior.

## Fixture provenance

Fixtures are engineering evidence, not user history.

When creating one from a real failure:

1. minimize to the smallest reproducing event sequence;
2. redact secrets/file contents not required by the bug;
3. normalize timestamps and opaque IDs unless identity is part of the case;
4. annotate the behavior being protected;
5. store expected normalized/canonical output next to the fixture/test.

Do not require the original raw capture after fixture creation.

## Protocol drift strategy

When a provider version changes output:

- replay existing fixtures against the new parser;
- add a fixture for the new shape;
- preserve backwards compatibility only where it is still an intended supported provider version;
- if a shape cannot be interpreted safely, prefer an explicit protocol-compatibility failure over
  silently guessing final answer/lifecycle.

Provider version should be included in diagnostics and, when useful, raw-capture metadata.

## Suggested high-value initial fixtures

### Claude-family

- thinking + assistant text + tool + assistant text + result;
- quota reset message;
- successful response discussing an auth error phrase;
- max-turns;
- model refusal with successful process exit;
- unknown session;
- terminal result repeating streamed assistant text.

### Codex-family

- explicit `commentary` and `final_answer` phases;
- legacy/unphased multiple agent messages;
- reasoning item;
- usage-limit with `try again at`;
- auth refresh invalidation;
- protocol starts then process exits before terminal event.

### Antigravity/Gemini-style

- empty diagnostic `error_message` noise followed by success;
- repeated empty diagnostics representing a stall;
- terminal-looking `ERROR` plus substantive non-echoed response;
- genuine `FAILED` with no valid response;
- terminal response containing already-committed commentary prefix.

## Verification

The parser/replay suite should run without:

- provider credentials;
- installed provider CLI;
- network;
- real home-directory state;
- real MCP server.

Live integration tests can remain as a small separate layer.
