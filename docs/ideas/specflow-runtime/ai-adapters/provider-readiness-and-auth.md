---
id: ideas.specflow-runtime.ai-adapters.provider-readiness-auth
type: engineering
title: Provider readiness and authentication
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
  - security
tags:
  - providers
  - authentication
  - availability
  - diagnostics
read_when:
  - implementing provider availability or health
  - preventing a session or turn from starting when the local provider is not authenticated
  - designing provider connection tests or login-required UX
summary: >
  Distinguish installation from execution readiness, reuse useful legacy health evidence without
  treating it as an approved target contract, add bounded provider-specific readiness probes, and
  keep startTurn as the final authoritative guard so an installed but logged-out CLI is not
  presented as ready.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - ideas.specflow-runtime.ai-adapters.protocol-examples
  - ideas.specflow-runtime.ai-adapters.process-environment-boundary
  - ideas.specflow-runtime.ai-adapters.provider-capacity-admission
  - architecture.ai.provider-boundary
---

# Provider readiness and authentication

## Legacy evidence and target gap

Current SpecFlow architecture requires provider failures such as "not installed" and "not
authenticated" to remain distinguishable, but the target repository does **not yet define** a
concrete `ProviderHealth` / `authenticated` contract.

Legacy Nevo contains a useful health shape:

```text
enabled
installed
version?
authenticated?
status
unavailableReason?
```

and its provider registry already propagates `authenticated` when an adapter supplies it. That is
migration evidence, not an already-approved SpecFlow API.

The legacy adapter gap is that Claude, Codex, and Antigravity `isAvailable()` implementations
primarily prove executable/launcher availability. They do not establish reliable login readiness.
As a result, an installed-but-logged-out provider may look available until real work starts.

## Candidate state distinctions

If SpecFlow adopts an explicit authentication-readiness dimension, keep these states distinct:

| Installed | Authenticated | Meaning                                                          |
| --------- | ------------- | ---------------------------------------------------------------- |
| false     | unknown       | Provider runtime is not installed/resolvable.                    |
| true      | unknown       | Provider exists, but auth readiness has not been established.    |
| true      | false         | Provider exists but cannot currently execute authenticated work. |
| true      | true          | Authentication has been demonstrated recently.                   |

`authenticated: undefined` would mean **unknown**, not true.

A quota/rate-limit failure should not flip `installed` to false or authentication to false. A
provider can be correctly authenticated while its account is temporarily out of capacity.

## Three readiness layers

### 1. Cheap availability

Keep a cheap, frequently callable check for stable/local facts:

- executable/launcher resolvable;
- version available where cheap;
- required local runtime prerequisite present.

This check should avoid a paid model invocation and should be safe to cache briefly.

It answers:

> Can this provider runtime be launched?

It does **not** necessarily answer:

> Can this account execute a turn right now?

### 2. Explicit environment/readiness test

Add a richer provider-owned `diagnose()` / `testEnvironment()` lane.

For the local MVP, it should verify the same command/configuration path that a real run will use:

- command;
- cwd/workspace;
- auth source/readiness;
- selected model compatibility;
- selected effort compatibility where checkable;
- protocol/transport initialization;
- interaction bridge prerequisites when relevant.

A bounded "hello" probe is acceptable where no reliable zero-inference auth command exists.

This check may be:

- user-triggered from provider/settings UI;
- run after provider configuration changes;
- cached with a short TTL;
- reused as preflight evidence when still fresh.

It should not execute on every descriptor read.

### 3. Start-time authoritative guard

`startTurn()` remains the final authority.

Even after a successful readiness probe:

- credentials may expire;
- the user may log out;
- the provider may revoke a token;
- local credential/configuration state may change;
- account state may change.

A structured authentication failure during startup/first protocol exchange should map to the
canonical authentication-failure category rather than a generic provider execution failure.
Legacy Nevo uses `AI_AUTH_FAILED` for this category; preserving that exact code is a separate
target-contract decision.

The Runtime should also invalidate cached positive authentication readiness immediately.

## Session creation behavior

When SpecFlow creates a provider session before any real Turn:

- if fresh readiness evidence says `authenticated: false`, fail before allocating misleading
  active session state;
- return an actionable auth-required failure;
- do not persist a provider-native session identity that was never established.

When authentication is unknown, the candidate design may continue to the provider's normal start
path, but the first authoritative provider response still needs to classify authentication
correctly.

## Candidate provider health projection

If SpecFlow adopts a health contract similar to the legacy shape, one practical projection is:

### Installed and authenticated

```text
installed = true
authenticated = true
status = healthy
```

### Installed but login required

```text
installed = true
authenticated = false
status = unavailable
unavailableReason = login/authentication required
```

This would allow UI to distinguish **not installed** from **installed, login required** even if a
derived `available` boolean is false in both cases.

### Authentication unknown

```text
installed = true
authenticated = undefined
status = healthy | degraded
```

Do not claim authenticated=true based only on binary presence.

### Authenticated but quota exhausted

Keep:

```text
installed = true
authenticated = true
```

Quota belongs to capacity/turn outcome. Depending on future health UX, status may remain healthy or
be shown as degraded, but it should not become "not installed" or "not authenticated".

## Claude-family readiness

### Candidate live probe

Use a small bounded non-mutating invocation, conceptually:

```text
claude --print - --output-format stream-json --verbose
stdin: Respond with hello.
```

The exact invocation must be verified against the supported CLI version.

Classify:

- successful expected response -> auth ready;
- explicit login prompt/auth failure -> auth required;
- usage limit -> authenticated but capacity unavailable;
- transient overload -> auth not disproven;
- timeout -> readiness unknown/degraded, not logged-out;
- unsupported/missing command -> installation failure.

### Login-required evidence

Useful probe-only markers include:

```text
not logged in
please log in
please run claude login
/login
login required
requires login
unauthorized
authentication required
```

Token-failure markers such as:

```text
authentication_failed
authentication error
failed to authenticate
invalid bearer token
expired bearer/oauth/access token
revoked bearer/oauth/access token
```

must be evaluated only against trusted failed terminal/error fields. Normal assistant prose can
legitimately mention these words.

### Login URL safety

If the CLI emits an interactive login URL:

- treat it as untrusted;
- allow only expected HTTPS provider hosts;
- reject credentials, arbitrary ports, query strings, and fragments unless explicitly required by
  the provider contract;
- otherwise show a fixed instruction such as `claude login`.

Do not echo an arbitrary URL from raw stderr into product UI.

## Codex readiness

### Candidate live probe

Use a bounded ephemeral invocation against the same effective auth/config home as a real run.

Conceptually:

```text
codex exec --json -
stdin: Respond with hello.
```

or use a lightweight app-server initialization/request if that proves the same auth path more
reliably.

Important: the probe must exercise the same credential source as execution. Testing the host's
default login while the real process uses another `CODEX_HOME` is a false positive.

### Useful auth-required markers

Within trusted probe failure evidence:

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

Prefer structured JSON-RPC/provider errors such as 401 when available.

Do not assume setting an environment variable is sufficient for every Codex CLI version. The
supported version's actual credential-loading behavior must be tested.

## Antigravity readiness

Do not invent an auth contract from the executable probe.

Preferred order:

1. use a provider-native auth/status command if the supported CLI exposes one;
2. otherwise use a bounded minimal headless probe against the exact execution target;
3. until such behavior is captured and fixture-backed, report authentication as unknown;
4. always retain `startTurn()` error classification as the authoritative fallback.

A successful `agy models` command is not automatically proof that inference auth is valid unless
the provider contract guarantees the same authenticated path.

## Candidate readiness check codes

Prefer machine-readable codes so UI behavior does not depend on English text. Possible neutral
codes:

```text
provider_command_ready
provider_command_missing
provider_version_incompatible
provider_auth_ready
provider_auth_required
provider_probe_timed_out
provider_probe_transient_failure
provider_model_incompatible
provider_effort_unsupported
provider_workspace_invalid
```

Provider-specific diagnostics can retain private subcodes.

## Cache/invalidation

Authentication readiness is transient.

Invalidate cached positive auth evidence when:

- a Turn returns the canonical authentication-failure category (legacy code: `AI_AUTH_FAILED`);
- login/logout/config credentials change;
- effective execution target changes;
- credential/config home changes;
- provider executable/version changes.

Refresh positive evidence after:

- successful explicit readiness test;
- successful authenticated Turn startup/completion.

Do not turn a single rate limit or quota failure into `authenticated: false`.

## Security

Readiness checks may encounter secrets in stdout/stderr.

Public diagnostics should use:

- fixed messages;
- stable codes;
- bounded safe detail;
- explicit redaction.

Avoid returning raw probe stdout/stderr in the normal API/UI result.

## MVP scope boundary

This idea does **not** introduce a remote/sandbox/provider-execution-target abstraction. The MVP
problem is local provider readiness. If remote execution is introduced later, authentication state
will likely need to be keyed by provider plus execution environment/auth source rather than stored
as one global provider boolean.

## Verification cases

For every provider with auth probing:

1. binary missing -> installed=false, authenticated unknown;
2. binary present + no login -> installed=true, authenticated=false;
3. valid login -> authenticated=true;
4. valid login + quota exhausted -> authenticated remains true;
5. transient 429/overload does not become auth=false;
6. probe timeout leaves auth unknown unless prior evidence remains valid by policy;
7. successful assistant text containing "not logged in" does not become auth failure;
8. startTurn auth failure invalidates previously cached auth-ready state;
9. a changed local credential/config home invalidates prior positive readiness;
10. no secret/raw auth payload is surfaced through health metadata.
