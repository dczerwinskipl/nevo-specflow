---
id: ideas.specflow-runtime.ai-adapters.error-classification
type: engineering
title: Quota versus transient rate-limit classification
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
  - rate-limit
read_when:
  - distinguishing provider quota exhaustion from transient throttling
  - adding retry or reset-time metadata to provider failures
summary: >
  Open classification work: separate account quota exhaustion from transient rate limiting
  using evidence from trusted failure locations only, and carry a conservatively parsed
  retryNotBefore with the private failure evidence.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.provider-error-examples
  - ideas.specflow-runtime.ai-adapters.provider-capacity-admission
  - reference.protocols.session-provider-driver
  - architecture.ai.provider-boundary
---

# Quota versus transient rate-limit classification

Implemented today: adapters map structured native errors (for example Claude `api_error`, including
HTTP 429) to the canonical Turn error vocabulary (`PROVIDER_FAILED`, `PROVIDER_AUTH_REQUIRED`, ...)
and exclude native prose ([driver protocol](../../../reference/protocols/session-provider-driver.md#failure-and-settlement)).
The vocabulary does not distinguish quota exhaustion from a transient rate limit, and carries no
retry time.

## Evidence rule

Classify from provenance-preserving evidence, in priority order: structured terminal status or stop
reason; structured provider error code and HTTP status; protocol terminal error payload; process
disposition; known provider stderr lines; raw stdout only as a narrowly scoped last fallback. Text
from an assistant/model message MUST NOT classify infrastructure, authentication or quota failure by
itself. A more specific deterministic failure (max turns, unknown session, invalid model, refusal)
wins over generic throttling.

## Two classes

**Account quota exhaustion** (does not clear with short backoff). Useful tokens in trusted failure
locations: `you've hit your ... limit`, `session limit reached/exceeded`, `out of extra usage`,
`usage limit reached`, `usage cap reached`, `5-hour limit reached`, `weekly limit reached`,
`ServiceQuotaExceededException`, Codex `You've hit your usage limit for <model> ... try again at
<time>`, `model is at capacity`.

**Transient rate limit / overload** (backoff candidate): `rate limit`, `rate_limit_error`, `too many
requests`, status 429 without a quota marker, `overloaded`/`overloaded_error`, 503/529, `service
unavailable`, `high demand`, `try again later`, `temporarily unavailable`, `ThrottlingException`.

Quota MUST NOT also classify as transient. Neither class affects authentication readiness.

## Retry metadata

Candidate private failure metadata: `retryable`, `retryNotBefore`, provider code, failure class,
HTTP status, exit code and evidence source. Whether any field crosses the public boundary is a
separate decision (a canonical `quota` code and a public reset time are the likely candidates).

Reset-time parsing is conservative: retain the original diagnostic; honour the provider's documented
time-zone semantics rather than assuming UTC; leave `retryNotBefore` absent when ambiguous.

## Verification cases

1. weekly/5-hour/usage-cap messages classify as quota, not transient;
2. 429/high-demand classify as transient when no stronger class exists;
3. Codex usage-limit text with an unambiguous time yields `retryNotBefore`;
4. ambiguous reset text never invents a timestamp;
5. successful model prose mentioning a limit or token error classifies nothing.
