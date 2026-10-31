---
id: ideas.specflow-runtime.provider-compatibility
type: engineering
title: Optimistic provider compatibility and strict execution checks
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, compatibility, certification, sessions]
read_when:
  - certifying an additional provider binary
  - implementing independently published compatibility updates
summary: >
  Separates diagnostic build identity, bounded protocol probing and strict execution
  admission; compatible unlisted builds run provisionally without catalogue updates.
related:
  - ideas.specflow-runtime.claude-provider
  - ideas.specflow-runtime.provider-process-boundary
  - reference.protocols.session-provider-driver
---

# Optimistic compatibility, strict capability enforcement

The owner's PR98_provider_compatibility_override.md replaces the original handover section 3.
Unknown versions and hashes are allowed when the implemented protocol and the required execution
checks pass. A catalogue entry, signature service or new SpecFlow release is not required for every
CLI update. This decision supersedes the previous mandatory exact-hash certification design.

The owner reaffirmed this on 2026-10-31 after the PR107 deep review. Neither a
missing certificate nor a mandatory per-update negative-control run may become
an indirect hash pin. Compatible minor/patch updates must keep working without
a SpecFlow release. Known API introduction/removal boundaries can define a
minimum version or a specific incompatible range; do not use the installed
version as an arbitrary minimum or assume every untested release is incompatible.
The illustrative `2.0.0` API floor in the discussion is not a recorded Antigravity
minimum and MUST NOT be shipped as one. Where version metadata is absent, required
API/protocol checks remain authoritative. Future version-to-handler profiles are
possible when actual incompatible APIs need them, not a prerequisite now.

## Classification and admission

- Tested: the exact build/version has recorded integration evidence for the implemented profile,
  and current checks pass. This label does not claim every native model/question/resume scenario
  was successfully exercised. The existing Claude 2.1.296 fingerprint records the observed baseline.
- Provisional: an untested version/build, including another hash at the same version or a new major,
  passes current local checks. It is available without extra opt-in or blocking UI warning.
- Unsupported: a known incompatibility or a failed required protocol/restriction check. Refuse the
  affected operation/mode and publish a bounded reasonCode. A failed file read, cancelled probe or
  unverified process settlement is technical unavailability, not proof of protocol incompatibility.

Both Tested and Provisional pass the same configuration, authentication, policy, environment,
read-only and supported model/effort gates. Writable effects still require Engine admission.
The internal admission field is `executionPolicyChecked`: it means the adapter
validated its supported native configuration/policy contract. It is not a generic
`securityVerified` attestation. Configuration checks, effective reported tools,
hook protocol implementation, and observed OS containment are different evidence.
A no-input handshake proves neither native hook execution nor OS isolation.
Native negative controls remain valuable acceptance/regression evidence, but
passing them for every new fingerprint is not an availability requirement.
Missing version metadata leaves the build provisional; never infer Tested from a successful handshake.
An unsupported requested mode does not disable another supported mode globally.

## Installation identity and cache

installation.ts requires a bounded regular native executable, fingerprints it with SHA-256, and
retains all existing default personal Pro/Max OAuth, managed-policy absence, registry, symlink,
profile and projected-environment checks. The fingerprint is diagnostic identity, not an allowlist.

Discovery caches for at most 30 seconds, keyed by executable path/hash, opaque account binding,
authentication mode, projected configuration/environment, workspace and implemented protocol profile.
All authentication/policy sources are rechecked before consulting the cache. Native bookkeeping and
routine token refresh do not require a new catalogue record. Changing the account or relevant
configuration invalidates availability. Configuration outside the supported sources remains denied.

Reinspect after probing and before invocation. If the executable changes during discovery, discard
that result and probe the current build, with at most two attempts. Revalidate model/effort against
the fresh catalogue after an update between admission and launch. Never dispatch using the old
build's models. The path-based hash-to-spawn interval is not an atomic executable-handle lock;
stronger OS ownership/identity binding remains a separate hardening concern.

## Unpaid probe and its limits

probe.ts starts the CLI through the existing owned-process boundary with the existing strict flags:
safe/restricted mode, explicit Read/Glob/Grep/AskUserQuestion tools, plan permissions, host stdio
permission prompts, empty strict MCP, no setting sources, hooks disabled, no slash commands/chrome.
It sends only control initialization; no user message, paid inference or history is sent.

The probe validates control framing/correlation, minimal initialize schema and bounded model/effort
metadata. Reported versions are bounded diagnostics rather than release-number admission checks.
It uses a 10-second discovery deadline, bounded frames/writes and owned disposal. Failure or uncertain
cleanup never advertises readiness or invents Tested status. Windows process-settlement uncertainty
remains applicable; the probe does not supply a stronger OS cleanup guarantee than the Runtime has.

Effective tools, plan mode, MCP and builtin-plugin inventory are observable in the invocation's
system/init frame, after sending its user message. They remain strictly checked there. The unpaid
handshake does not prove those effective settings, semantic question delivery, native cancellation
or semantic resume. CLI argument acceptance and initialization are limited compatibility evidence.
Provisional execution relies on the same declared CLI restrictions and Runtime checks as the tested
path, with no claim of an OS sandbox, complete network isolation or future native semantic correctness.
Actual refusal of those restrictions/profile blocks execution; no hash-only refusal is introduced.

## Optional local catalogue

The closed record schema stores diagnostic tested fingerprints, version/profile/scenario evidence,
authentication/execution modes and locally known incompatible/revoked builds. Known incompatibility
wins over optimistic classification. An absent entry or offline catalogue service never disables a
locally compatible build. Invalid or ambiguous diagnostic certification evidence
cannot grant Tested and leaves the build provisional; it does not create a new
incompatibility. A valid explicit known-incompatible/revoked record still wins.

Remote signing/distribution/cache/anti-rollback is optional future quality infrastructure, not an MVP
prerequisite or a source of executable code, command arguments or protocol parsers. A genuinely new
unsupported protocol profile may require a SpecFlow release. Routine CLI version changes do not.

## Evidence and tests

Controlled tests cover known Tested, same-version/new-hash, newer and new-major Provisional,
missing diagnostic version, malformed handshake, restriction failures, known incompatible evidence,
o-network/no-entry policy, cache invalidation, replacement during probing and replacement between
validation and dispatch. Controlled HTTP/native-child tests exercise updated builds through the
production registry, coordinator, SQLite and HTTP, without running an external paid model.

Live Claude model answers, question round trips and semantic resume remain separate acceptance.
The previous quota-limited native invocation does not prove those scenarios. New probes likewise
establish only the unpaid protocol/model observations they actually perform.
