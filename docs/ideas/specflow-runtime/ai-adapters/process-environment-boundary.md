---
id: ideas.specflow-runtime.ai-adapters.process-environment-boundary
type: engineering
title: Provider process environment boundary
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - security
  - configuration
  - testing
tags:
  - providers
  - environment
  - secrets
  - process
  - security
read_when:
  - spawning a provider CLI or app-server process
  - deciding which host environment variables a provider may inherit
  - adding provider authentication through environment variables or workload identity
  - injecting Nevo run/session context into a provider process
summary: >
  Replace ambient process.env inheritance with an explicit provider process environment projection
  that preserves required OS/provider authentication inputs without leaking unrelated server
  secrets, and make readiness probes use the same projection as real execution.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.diagnostic-sanitization
  - ideas.specflow-runtime.ai-adapters.cross-platform-process-runtime
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
---

# Provider process environment boundary

## Why this matters during migration

Legacy Nevo provider processes inherit broad ambient host state:

- Claude constructs child environment from `...process.env`;
- Antigravity constructs spawn environment from `...process.env`;
- Codex defaults its app-server client environment to `process.env` and merges host environment
  again at spawn.

That made trusted Nevo correlation easy to propagate, but it also means an unrelated server
credential present in the parent process can become visible to the provider CLI, its tools,
subprocesses, or raw logs.

External adapter implementations have encountered both sides of this boundary:

1. broad inheritance leaked server-only database/auth credentials to agent processes;
2. overly narrow allowlists broke legitimate workload identity because required cloud
   web-identity variables were omitted.

The candidate target is therefore **explicit projection with provider evidence**, not "inherit
everything" and not a guessed universal denylist.

## Candidate environment composition

Conceptually:

```text
minimal OS/runtime base
+ provider-specific inherited host projection
+ explicit configured provider/user environment
+ resolved secret bindings
+ Nevo-owned run/session variables
= final child environment
```

A useful precedence is:

```text
Nevo-owned reserved variables
  > explicit adapter configuration
  > provider-specific inherited host variables
  > minimal OS/runtime base
```

Reserved Nevo runtime variables should not be overridable through provider/user configuration.

## Minimal OS/runtime base

Cross-platform process startup may require selected conventional values.

Windows candidates include `PATH`/`Path`, `PATHEXT`, `SYSTEMROOT`, `WINDIR`, `COMSPEC`,
`USERPROFILE`, `TEMP` and `TMP`.

POSIX candidates include `PATH`, `HOME` and `TMPDIR`.

Locale/runtime values such as `LANG`, `LC_ALL`, `LC_CTYPE` and `TZ` should be carried only where
supported-runtime evidence says they matter.

This is not a request to forward every conventional environment variable.

## Provider-specific inherited host projection

Some authentication/network modes genuinely depend on ambient host state. Candidate groups include:

- provider API-key/token variables;
- proxy variables such as `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`;
- enterprise CA configuration such as `NODE_EXTRA_CA_CERTS` when deliberately supported;
- cloud-provider region/profile configuration;
- workload-identity variables.

### Workload identity warning

A narrow list of static credentials is insufficient for cloud authentication.

For example, AWS web identity can require values such as:

```text
AWS_ROLE_ARN
AWS_WEB_IDENTITY_TOKEN_FILE
AWS_ROLE_SESSION_NAME
AWS_REGION / AWS_DEFAULT_REGION
AWS_STS_REGIONAL_ENDPOINTS
```

Other modes may use profiles, container credentials, or static credentials.

The environment projection should therefore be provider- and auth-mode-aware. Do not copy one
global cloud allowlist to every provider.

## Explicit configuration is a different source

A user/operator-configured value is not the same thing as ambient host inheritance.

The target boundary should be able to distinguish conceptually:

```text
plain configured value
secret reference
user-scoped secret reference
inherited host capability
Nevo-owned runtime value
```

This enables future auditability and prevents accidentally reclassifying the entire host environment
as explicit provider configuration.

Resolve secrets only at the latest boundary that actually needs the value.

## Nevo-owned runtime variables

Legacy correlation includes values such as:

```text
NEVO_SESSION_ID
NEVO_AGENT_PROVIDER
NEVO_AGENT_PROVIDER_SESSION_ID
NEVO_SPEC_ID
NEVO_TASK_ID
```

The target names still need migration review, but the ownership rule is useful:

- Runtime creates them;
- adapter/user config cannot override them;
- they contain correlation rather than credentials;
- only variables still required by migrated tooling should survive.

## Readiness must share the execution projection

A readiness/auth probe is useful only if it sees the same effective authentication/network inputs as
the real provider process.

Bad:

```text
readiness probe -> full host process.env
real turn       -> restricted provider environment
```

or the reverse.

This can create false login/auth results or make cloud identity differ between probe and execution.

The projection builder should therefore be reusable by:

- version/executable probes when environment matters;
- auth/readiness probes;
- model/capability discovery;
- real provider execution.

Probe-specific additions should be explicit.

## Do not solve this with a blacklist alone

A denylist such as `DATABASE_URL`, `AUTH_SECRET`, `GH_TOKEN` will always miss the next server-only
secret.

Prefer a small inherited projection plus explicit provider configuration. Known deny rules remain
useful as defense in depth for reserved/server-only variables.

## Diagnostics

Technical diagnostics may record which **variable names/sources** crossed the boundary, but never
their values.

Even names can reveal deployment details, so keep this out of ordinary product UI.

## Verification cases

1. unrelated server secret is absent from provider child env;
2. explicit provider secret is present without being logged;
3. Nevo-owned runtime variable cannot be overridden;
4. Windows launcher resolution keeps required PATH/PATHEXT/SystemRoot inputs;
5. POSIX PATH/HOME/temp behavior remains usable;
6. proxy/custom CA configuration survives only when supported/configured;
7. workload-identity mode retains variables required by that mode;
8. readiness probe and real execution resolve the same auth environment;
9. changing auth/config invalidates prior readiness evidence;
10. unsupported host variables do not leak merely because their names look harmless.

## Migration note

This is a security boundary worth changing **during** adapter migration rather than faithfully
porting legacy ambient `process.env` inheritance and hardening it later.
