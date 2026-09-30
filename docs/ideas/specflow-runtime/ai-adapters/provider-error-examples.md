---
id: ideas.specflow-runtime.ai-adapters.provider-error-examples
type: reference
title: Provider error and limit examples
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - errors
  - timeout
  - quota
  - rate-limit
read_when:
  - implementing provider failure classification
  - adding regression fixtures for provider limits, authentication, timeout, or protocol failures
  - deciding which error signatures are observed evidence versus compatibility heuristics
summary: >
  Provider-by-provider examples of quota, rate-limit, timeout, authentication, protocol, tool,
  and execution failures, with explicit evidence level so synthetic mapper tests are not mistaken
  for captured provider protocol.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.protocol-examples
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.liveness-watchdog
---

# Provider error and limit examples

## Evidence labels

### Captured

Sanitized from a real provider invocation or an existing captured evidence fixture.

This is strong evidence for an exact event shape, but remains provider-version-specific.

### Contract test

An existing legacy test feeds a representative provider error/message into the adapter classifier
and asserts the expected canonical result.

This proves our intended compatibility behavior. It does not prove that the exact text came from a
real provider session.

### Compatibility signature

A phrase/shape worth recognizing in a trusted failure location, but not currently backed by a
captured Nevo fixture.

When encountered in a real SpecFlow run, minimize it into a replay fixture.

# Claude-family errors

## Captured: seven-day rate-limit rejection

Existing live evidence was captured from Claude Code CLI 2.1.220.

```json
{
  "type": "rate_limit_event",
  "rate_limit_info": {
    "status": "rejected",
    "resetsAt": 1788192000,
    "rateLimitType": "seven_day"
  }
}
```

followed by:

```json
{
  "type": "result",
  "subtype": "error",
  "terminal_reason": "api_error",
  "is_error": true,
  "api_error_status": 429
}
```

Useful evidence:

- rejection is structured;
- limit window type is structured;
- reset timestamp is structured;
- terminal result confirms failure;
- 429 is structured.

The classifier should prefer these fields over text matching.

A long-window limit such as `seven_day` should be considered separately from a burst TPM/RPM
throttle. The final canonical distinction between quota and rate-limit should use provider semantics
rather than status 429 alone.

## Contract test: timeout

```text
message: Request timed out waiting for upstream
exitCode: 124
```

Legacy expected result:

```text
AI_PROVIDER_TIMEOUT
HTTP 504
```

This is a mapper contract test, not proof that all supported Claude versions use exit code 124.

Ordinary provider silence remains a Runtime watchdog concern unless provider-native timeout evidence
exists.

## Contract test: not authenticated

```text
Unauthorized: Please run claude login or set ANTHROPIC_API_KEY
```

Expected:

```text
AI_AUTH_FAILED
HTTP 401
recoveryHint = operator-action
```

This text should only classify auth when it comes from trusted failure context.

## Contract test: policy denial

```text
Sandbox policy denied operation
```

Expected:

```text
AI_POLICY_DENIED
HTTP 403
```

## Contract test: quota exhaustion

```text
Monthly credit quota limit reached
```

Expected:

```text
AI_QUOTA_EXHAUSTED
HTTP 429
```

## Contract test: temporary rate limit

```text
Rate limit exceeded: TPM ceiling hit
```

Expected:

```text
AI_RATE_LIMITED
HTTP 429
recoveryHint = retry-after-delay
```

## Contract test: protocol error

```text
Protocol error: unexpected token in stream-json
```

Expected:

```text
AI_PROTOCOL_ERROR
HTTP 502
```

## Contract test: executable missing

```text
code: ENOENT
message: spawn claude ENOENT
```

Expected:

```text
AI_PROVIDER_UNAVAILABLE
HTTP 503
```

## Compatibility quota signatures

Useful trusted-failure signatures to cover:

```text
You've hit your ... limit
session limit reached
session limit exceeded
out of extra usage
5-hour limit reached
5 hour limit reached
weekly limit reached
usage limit reached
usage cap reached
ServiceQuotaExceededException
```

Transient examples:

```text
rate_limit_error
too many requests
overloaded_error
server overloaded
service unavailable
high demand
try again later
temporarily unavailable
ThrottlingException
```

# Codex errors

## Captured: failed tool while Turn remains successful

Existing captured evidence includes:

```json
{
  "method": "item/commandExecution/outputDelta",
  "params": {
    "itemId": "exec-01",
    "delta": "node : CommandNotFoundException\r\n"
  }
}
```

then:

```json
{
  "method": "item/completed",
  "params": {
    "item": {
      "type": "commandExecution",
      "id": "exec-01",
      "status": "failed",
      "exitCode": 1,
      "aggregatedOutput": "node : CommandNotFoundException\r\n"
    }
  }
}
```

The same provider Turn later runs another tool and receives authoritative:

```json
{
  "method": "turn/completed",
  "params": {
    "turn": {
      "status": "completed"
    }
  }
}
```

Expected mapping:

```text
failed commandExecution -> failed tool Work
provider Turn            -> continues
turn/completed           -> successful Turn
```

Tool stderr/output must not be promoted into provider-level availability/auth failure.

## Contract test: authentication

```json
{
  "code": 401,
  "message": "Invalid API key provided"
}
```

Expected:

```text
AI_AUTH_FAILED
HTTP 401
```

## Contract test: policy

```json
{
  "code": "POLICY_DENIED",
  "message": "Sandbox policy denied write access"
}
```

Expected:

```text
AI_POLICY_DENIED
HTTP 403
```

## Contract test: quota

```json
{
  "message": "Insufficient quota for this operation"
}
```

Expected:

```text
AI_QUOTA_EXHAUSTED
HTTP 429
```

## Contract test: rate limit

```json
{
  "code": 429,
  "message": "Rate limit exceeded: TPM reached"
}
```

Expected:

```text
AI_RATE_LIMITED
HTTP 429
recoveryHint = retry-after-delay
```

## Contract test: protocol mismatch

```json
{
  "code": -32601,
  "message": "Method not found"
}
```

Expected:

```text
AI_PROTOCOL_ERROR
HTTP 502
```

Other JSON-RPC protocol-family codes already worth handling explicitly:

```text
-32700 parse error
-32600 invalid request
-32601 method not found
-32602 invalid params
```

## Login-required probe signatures

Within a bounded readiness probe, useful auth-required evidence includes:

```text
not logged in
login required
authentication required
unauthorized
invalid API key
missing API key
API key required
please run codex login
```

Prefer structured app-server/CLI failure fields when available.

## Timeout semantics

Codex uses a persistent app-server, so a normal per-Turn timeout should not be modeled as an
imaginary child exit code.

Typical Runtime-owned sequence:

```text
Turn active
protocol progress becomes stale
Runtime records timeout intent
Runtime requests turn/interrupt
late provider interruption/completion arrives
Runtime preserves timeout outcome
```

Expected:

```text
AI_RUNTIME_TIMEOUT
cause = timeout/protocol-silence
```

App-server death/disconnect is a separate transport/process failure.

# Antigravity errors

## Captured/tested protocol shape: concrete quota error step

```json
{
  "event": "step_update",
  "step_update": {
    "conversation_id": "conversation-1",
    "step_index": 1,
    "state": "DONE",
    "step_type": "error_message",
    "message": "Provider quota exceeded."
  }
}
```

Expected:

```text
AI_QUOTA_EXHAUSTED
```

The important fact is provenance: the text is inside a provider error step.

## Tested protocol shape: rate-limit terminal with usage

```json
{
  "event": "result",
  "result": {
    "status": "ERROR",
    "response": "",
    "error": "Rate limit hit",
    "usage": {
      "input_tokens": 350,
      "output_tokens": 42,
      "cost": 0.005
    }
  }
}
```

Expected:

```text
AI_RATE_LIMITED
usage preserved independently
```

A failed Turn must not discard valid usage telemetry.

## Tested transport timeout

Provider process:

```text
exitCode = 124
stderr = "Command timed out after 600 seconds"
```

Expected:

```text
AI_PROVIDER_TIMEOUT
source = provider CLI transport
```

This provider has a distinct CLI `--print-timeout`, so this must remain separate from the Runtime
protocol-silence watchdog.

## Tested empty error diagnostic

```json
{
  "event": "step_update",
  "step_update": {
    "state": "DONE",
    "step_type": "error_message"
  }
}
```

One empty error step is diagnostic noise, not immediate Turn failure.

A sustained sequence with no other progress can instead become liveness/stall evidence and
eventually produce:

```text
AI_RUNTIME_TIMEOUT
```

This is a concrete reason not to map event names to canonical failure classes mechanically.

## Contract test: auth failure

```text
Invalid API key / unauthorized
```

Expected:

```text
AI_AUTH_FAILED
HTTP 401
```

## Contract test: rate limit

```text
Rate limit exceeded: too many requests
```

Expected:

```text
AI_RATE_LIMITED
HTTP 429
```

## Contract test: quota

```text
Quota limit exceeded. Please check billing.
```

Expected:

```text
AI_QUOTA_EXHAUSTED
HTTP 429
```

## Terminal ERROR can be advisory in evidenced cases

Some observed/tested Antigravity behavior shows:

```text
status = ERROR
error = stale/advisory diagnostic
response = substantive current-turn answer
```

For the specific evidenced shape, the adapter can recover completion.

Do not generalize this to every status:

- `FAILED` remains fatal without contrary captured evidence;
- `TIMEOUT` remains fatal;
- error-only response remains fatal.

# Cross-provider comparison

| Condition | Claude | Codex | Antigravity |
|---|---|---|---|
| Not logged in | CLI/probe failure markers; should become readiness state | CLI/app-server probe failure markers; should become readiness state | Needs provider-specific readiness evidence; startTurn classifier remains fallback |
| Rate limit | captured structured 429/window evidence exists | classifier/error-envelope support; capture more real fixtures | tested ERROR/result and mapper shapes |
| Long-window quota | captured seven-day window evidence; more signatures worth fixtures | classifier support; capture more real fixtures | quota error step/mapper support |
| Provider timeout | mapper support; exact native shape needs version evidence | normally Runtime-owned per-Turn timeout | explicit CLI print-timeout / exit 124 |
| Runtime silence | Runtime-owned | Runtime-owned | Runtime-owned, separate from print-timeout |
| Protocol error | stream/protocol classifier | structured JSON-RPC codes | malformed/unknown stream shapes need provider-specific evidence |
| Tool failure | tool result, not automatically Turn failure | captured failed command with successful Turn | tool step failure distinct from terminal result |

## Fixture backlog

Highest-value missing real captures:

1. Claude logged-out invocation;
2. Claude 5-hour/weekly/extra-usage textual terminal variants in supported current versions;
3. Codex logged-out app-server/exec response;
4. Codex real quota/usage-limit response including reset metadata;
5. Codex transient overload response;
6. Antigravity logged-out invocation;
7. Antigravity rate/quota payloads from a current real session, not only mapper tests.

Each should be minimized and sanitized before becoming durable test data.
