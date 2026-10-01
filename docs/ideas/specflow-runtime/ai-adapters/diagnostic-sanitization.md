---
id: ideas.specflow-runtime.ai-adapters.diagnostic-sanitization
type: engineering
title: Provider diagnostic sanitization
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - security
  - testing
tags:
  - diagnostics
  - redaction
  - secrets
  - telemetry
  - providers
read_when:
  - persisting provider diagnostics or errors
  - logging provider commands, stderr, environment failures, or probe output
  - emitting telemetry derived from provider execution
  - exposing technical provider details in UI or API responses
summary: >
  Sanitize provider diagnostics at the boundary using actual resolved secret values plus structural
  token heuristics, bound retained text after redaction, remove terminal/control artifacts, and keep
  telemetry attributes closed and low-cardinality.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.process-environment-boundary
  - ideas.specflow-runtime.ai-adapters.raw-diagnostics-retention
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - architecture.ai.provider-boundary
---

# Provider diagnostic sanitization

## Problem

Provider diagnostics are valuable because they contain commands, paths, error payloads, environment
details and provider output. Those same fields can contain credentials.

Legacy Nevo has bounded/local diagnostic mechanisms, but this review did not find one shared
provider diagnostic sanitizer.

A safe design needs more than a regex for variable names.

## Two diagnostic classes

### Raw diagnostic capture

Potentially contains the original provider payload.

- local technical evidence;
- restricted storage;
- bounded retention/size;
- excluded from normal API/UI;
- potentially sensitive even after ordinary logging is sanitized.

### Sanitized diagnostic

Safe enough for normal technical logs, persisted error metadata, or deep-inspection UI.

- redacted;
- bounded;
- terminal/control artifacts removed;
- useful structured provenance/category retained.

Sanitization does not make raw capture unnecessary; raw capture does not make sanitization optional.

## Combine two redaction strategies

### Structural heuristics

Recognize common secret-bearing forms:

- CLI options such as `--api-key value` and `--token=value`;
- environment assignments such as `TOKEN=...`;
- `Authorization: Bearer ...`;
- JSON fields whose names imply token/key/password/secret/credential/cookie/connection string;
- common API-key/token shapes;
- JWT-like dotted tokens;
- URLs containing passwords/credentials.

### Actual resolved secret values

When Runtime has resolved a provider secret, use the **value itself** as redaction evidence.

This catches arbitrary keys such as:

```text
DATABASE_URL
CUSTOM_PROVIDER_CONFIG
INTERNAL_CONNECTION
```

Useful forms to consider:

- literal value;
- JSON-escaped form;
- URL-encoded form where safely derivable;
- URL password component separately.

Process longer values before shorter values so a shorter secret cannot partially rewrite a longer one.

## Avoid false-positive redaction of protocol identifiers

Broad token/JWT heuristics can match innocent dotted identifiers.

If a known public protocol selector legitimately resembles a token, use a **small exact allowlist**
for that value rather than weakening the redactor globally.

## Command logging

Avoid logging raw reconstructed provider commands when they can contain prompts, credentials, signed
URLs or temporary tokens.

Prefer structured/sanitized metadata such as executable plus safe argument labels, or a single
shared redacted command formatter.

## Text cleanup

Before persisting/displaying sanitized diagnostics:

- strip ANSI/OSC escape sequences;
- strip disallowed control characters while preserving useful line breaks/tabs;
- replace malformed Unicode/surrogate data rather than failing persistence;
- trim excessive surrounding whitespace.

Provider errors must not be able to inject terminal control behavior into logs/UI.

## Size bounds

Redact **before** final truncation where practical, then enforce strict field/output limits.

Record truncation explicitly so a user knows a diagnostic is incomplete.

This avoids huge provider error bodies becoming durable state and avoids cutting a secret-bearing
construct before the sanitizer can recognize it.

## Telemetry is stricter than diagnostics

Tracing/metrics backends index attributes, so telemetry needs a closed, low-cardinality contract.

Do not emit free-form:

- prompt;
- full command/args;
- path;
- raw provider session ID;
- user-defined provider name;
- error body;
- model response.

Prefer:

- closed provider family;
- closed phase/outcome;
- numeric durations/counts;
- known command basename;
- hashed opaque IDs only when stable correlation is useful;
- `other` / `unknown` for unbounded labels.

## Error classification interaction

Classification should inspect provider-private structured/raw evidence first. Sanitization happens
before technical text crosses into normal Runtime/API persistence.

Prefer:

```text
provider-private evidence
-> classify
-> extract bounded technical metadata
-> sanitize persisted/public diagnostic text
```

Do not sanitize so aggressively before classification that provider codes/statuses are lost.

## Verification cases

1. configured secret under arbitrary key is removed from stderr diagnostic;
2. bearer header is redacted;
3. CLI `--token=value` is redacted;
4. JSON and escaped-JSON secret fields are redacted;
5. URL password literal and encoded form are redacted;
6. known harmless dotted protocol selector survives JWT heuristic;
7. ANSI/control sequences disappear without losing useful lines;
8. malformed Unicode cannot break error persistence;
9. huge diagnostic is bounded and marked truncated;
10. telemetry never receives prompt/path/raw session ID/full command;
11. raw capture remains separately protected and is never mistaken for sanitized output.

## Migration note

Centralize this before providers grow separate redaction regexes. The same sanitizer should serve
readiness probes, execution failures, cleanup errors, and technical inspection.
