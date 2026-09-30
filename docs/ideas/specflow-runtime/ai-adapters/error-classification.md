---
id: ideas.specflow-runtime.ai-adapters.error-classification
type: engineering
title: Evidence-based provider error classification
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - errors
  - quota
  - retry
read_when:
  - implementing provider error mapping
  - deciding whether a provider failure is retryable
  - handling usage limits, authentication, model availability, or transient upstream failures
summary: >
  Classify provider failures from structured evidence first, restrict text matching to trusted
  failure fields, distinguish quota from transient rate limiting, and expose retry metadata such
  as retryNotBefore without letting model prose drive lifecycle semantics.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.provider-boundary
  - ideas.specflow-runtime.ai-adapters.protocol-examples
---

# Evidence-based provider error classification

## Problem

The legacy adapters contain useful canonical error types, but several mappings begin from one
human-readable `message` and run regexes over it. That is too weak once provider output can contain
the same words as ordinary model prose.

Example failure mode:

- the model explains that an API returned "invalid bearer token";
- a broad auth regex sees that phrase in output;
- the runtime misclassifies a successful turn as authentication failure.

The target design should preserve technical diagnostics while making the **provenance of evidence**
part of classification.

## Candidate input contract

Conceptually prefer a classifier input shaped like:

```text
ProviderFailureEvidence
  structuredTerminal
  structuredError
  providerCode
  httpStatus
  processExit
  stderr
  stdout
```

The exact TypeScript shape is intentionally left to implementation, but source/provenance MUST NOT
be flattened into one string before classification.

## Evidence priority

Suggested order:

1. structured terminal status / subtype / stop reason;
2. structured provider error code and status;
3. protocol terminal error payload;
4. process disposition and exit code;
5. stderr lines known to be emitted by the provider runtime;
6. raw stdout only as a narrowly-scoped last fallback.

Text originating from an assistant/model message MUST NOT classify infrastructure/auth/quota
failure by itself.

## Claude-family signatures worth supporting

The following tokens are useful compatibility evidence when they occur in a trusted failure
location. Matching should be case-insensitive and tolerant of hyphen/space variants where shown.

### Provider quota / account usage exhaustion

- `you've hit your ... limit`
- `you’ve hit your ... limit`
- `session limit reached`
- `session limit exceeded`
- `out of extra usage`
- `extra usage`
- `claude usage limit reached`
- `5-hour limit reached`
- `5 hour limit reached`
- `weekly limit reached`
- `usage limit reached`
- `usage cap reached`
- `ServiceQuotaExceededException`

These SHOULD map separately from temporary upstream throttling. Candidate canonical result:
`AI_QUOTA_EXHAUSTED`, with a recovery hint chosen by policy rather than by regex.

### Temporary upstream / throttling

Observed useful tokens include:

- `rate limit`, `rate-limit`, `rate_limit_error`
- `too many requests`
- HTTP/status `429`
- `overloaded`, `overloaded_error`, `server overloaded`
- `service unavailable`
- status `503`, `529`
- `high demand`
- `try again later`
- `temporarily unavailable`
- `throttled`, `throttling`, `ThrottlingException`

This class is a candidate for retry/backoff behavior. It MUST NOT swallow a more specific
deterministic failure.

### Authentication/token failures

Prefer structured 401/403 and explicit failed terminal state. Useful failure tokens include:

- `authentication_failed`, `authentication error`
- `failed to authenticate`
- `invalid bearer token`
- expired/revoked bearer, OAuth, or access token variants

The important constraint is **scope**: token phrases should be evaluated against terminal failure
fields, not arbitrary assistant stdout.

### Deterministic provider failures

These should be checked before generic transient matching:

- max-turns subtype such as `error_max_turns`;
- stop/error reasons `max_turns`, `max_turns_exhausted`, `turn_limit`,
  `turn_limit_exhausted`;
- unknown/missing provider session;
- poisoned/incompatible previous message/session state;
- model not found / unknown model / invalid model;
- image processing failure if the provider exposes one;
- policy/model refusal when represented by structured stop reason.

A refusal may arrive with process exit code 0, therefore process success alone is insufficient.

## Codex-family signatures worth supporting

### Usage limit / provider quota

Useful tokens include:

- `you've hit your usage limit`
- `you’ve hit your usage limit`
- `usage limit`
- `model is at capacity`
- `at capacity for this model`
- `capacity limit`

A common useful shape is:

```text
You've hit your usage limit for <model>. Switch to another model now, or try again at <time>.
```

The retry time SHOULD be parsed into a structured `retryNotBefore` value when unambiguous.

### Auth refresh failures

Worth keeping distinguishable in provider-private diagnostics:

- `refresh_token_reused` / "refresh token has already been used";
- `refresh_token_expired`;
- `refresh_token_invalidated` / revoked / invalid;
- `invalid_grant`;
- contextual 401/unauthorized together with OAuth/refresh/access-token/bearer terminology.

These may share a canonical auth category while retaining a provider-private subcode.

### Structural harness/process crash

Do not rely only on crash text.

A strong structural signal is:

- process exits non-zero;
- protocol emitted at least one valid event;
- no protocol terminal event was received.

That means the harness/transport disappeared underneath the agent and should be treated as an
infrastructure/process failure rather than inferred from whatever stderr happened to contain.

## Retry metadata

The canonical/internal error object should be able to carry optional metadata such as:

```text
retryable
retryNotBefore
providerCode
providerFailureClass
httpStatus
exitCode
source
```

Whether every field crosses the public product boundary is a separate decision.

### Reset-time parsing

When a provider emits "resets at" / "try again at" information:

- parse conservatively;
- retain the original diagnostic string;
- if timezone is absent, use the provider/CLI documented local-time semantics rather than inventing
  UTC;
- if parsing is ambiguous, leave `retryNotBefore` absent instead of guessing.

## Antigravity/Gemini compatibility note

Legacy evidence shows a provider can report a terminal-looking `ERROR` status while also returning
a genuine substantive response and an advisory/stale diagnostic. Therefore no global rule such as
"status ERROR always wins" or "non-empty response always wins" should be applied across providers.

Provider-specific classifiers may interpret evidenced protocol oddities, but the neutral Runtime
should receive one normalized disposition plus diagnostics.

## Verification cases

At minimum add table-driven tests for:

1. successful model prose containing "invalid bearer token" does not become auth failure;
2. weekly/5-hour/usage-cap messages classify as quota;
3. 429/high-demand/temporary-error classify as transient when no stronger class exists;
4. quota does not also classify as transient;
5. unknown session and max-turns beat generic transient regexes;
6. structured refusal with exit code 0 remains refusal;
7. Codex usage-limit time produces `retryNotBefore`;
8. malformed/ambiguous reset time does not invent a timestamp;
9. nonzero process exit after protocol start but before protocol terminal is classified structurally;
10. raw stdout assistant text alone cannot classify an infrastructure failure.

## Migration note

Do not port the legacy `mapClaudeError(message)` / `mapAntigravityError(message)` shape unchanged.
Keep the canonical taxonomy where still appropriate, but change the input boundary so provenance is
available before matching.
