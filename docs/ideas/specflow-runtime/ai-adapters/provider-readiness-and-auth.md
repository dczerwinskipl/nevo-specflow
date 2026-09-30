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
  Distinguish installation from execution readiness, use the existing authenticated provider-health
  dimension, add bounded provider-specific readiness probes, and keep startTurn as the final
  authoritative guard so an installed but logged-out CLI is not presented as ready.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - ideas.specflow-runtime.ai-adapters.protocol-examples
  - architecture.ai.provider-boundary
---

# Provider readiness and authentication

## Current gap

The neutral health model already has the right distinction:

```text
enabled
installed
version?
authenticated?
status
unavailableReason?
```

The provider registry also already propagates `authenticated` when a provider returns it.

The gap is in the adapters:

- Claude `isAvailable()` currently proves that the CLI can be resolved/probed;
- Codex `isAvailable()` currently proves that the CLI/launcher can be resolved/probed;
- Antigravity `isAvailable()` currently proves that the CLI can be resolved/probed;
- none of the three currently returns authoritative authentication readiness.

As a result, an installed-but-logged-out provider can be displayed as available and authentication
may only be discovered when real work starts.

## Required state distinctions

Do not collapse these states:

| Installed | Authenticated | Meaning |
|---|---|---|
| false | unknown | Provider runtime is not installed/resolvable. |
| true | unknown | Provider exists, but auth readiness has not been established. |
| true | false | Provider exists but cannot currently execute authenticated work. |
| true | true | Authentication has been demonstrated recently. |

`authenticated: undefined` means **unknown**, not true.

A quota/rate-limit failure MUST NOT flip `installed` to false. A provider can be correctly
authenticated while its account is temporarily out of capacity.

## Three readiness layers

### 1. Cheap availability

Keep a cheap, frequently callable check for stable/local facts:

- executable/launcher resolvable;
- version available where cheap;
- required local runtime prerequisite present.

This check SHOULD avoid a paid model invocation and SHOULD be safe to cache briefly.

It answers:

> Can this provider runtime be launched?

It does **not** necessarily answer:

> Can this account execute a turn right now?

### 2. Explicit environment/readiness test

Add a richer provider-owned `diagnose()` / `testEnvironment()` lane.

It SHOULD verify the exact execution target that a run will use:

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
- a remote execution target may differ;
- account state may change.

A structured authentication failure during startup/first protocol exchange MUST become
`AI_AUTH_FAILED`, not generic provider execution failure.

It SHOULD also invalidate cached `authenticated: true` readiness immediately.

## Session creation behavior

When SpecFlow creates a provider session before any real Turn:

- if fresh readiness evidence says `authenticated: false`, fail before allocating misleading
  active session state;
- return an actionable auth-required failure;
- do not persist a provider-native session identity that was never established.

When authentication is unknown, session creation MAY continue to the provider's normal start path,
but the first authoritative provider response must still classify authentication correctly.

## Provider health projection

A practical projection using the existing contract is:

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

This allows UI to distinguish **not installed** from **installed, login required** even if the
existing derived `available` boolean is false in both cases.

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
be shown as degraded, but it must not become "not installed" or "not authenticated".

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

## Stable readiness check codes

Prefer machine-readable codes so UI behavior does not depend on English text. Candidate neutral
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

- a Turn returns `AI_AUTH_FAILED`;
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
9. remote/sandbox probe tests the remote target rather than host credentials;
10. no secret/raw auth payload is surfaced through health metadata.
