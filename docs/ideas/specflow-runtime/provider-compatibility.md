---
id: ideas.specflow-runtime.provider-compatibility
type: engineering
title: Provider compatibility catalogue and admission design
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, compatibility, certification, sessions]
read_when:
  - certifying an additional provider binary
  - implementing independently published compatibility updates
summary: >
  Separates installation identity, trusted certification, bounded protocol probing and
  execution admission; ships a bundled baseline while signed distribution remains deferred.
related:
  - ideas.specflow-runtime.claude-provider
  - ideas.specflow-runtime.provider-process-boundary
  - reference.protocols.session-provider-driver
---

# Provider compatibility and admission

## Decision and present scope

Use a data-only compatibility catalogue. Protocol implementations remain part of SpecFlow.
A catalogue may certify a new executable for an already implemented profile; it cannot introduce
parsers, code, environment variables, command-line arguments or writable execution modes.

PR #98 introduces a closed record schema, the trusted bundled Claude baseline, three compatibility
classifications and a separate admission policy. Production accepts only bundled exact fingerprints.
There is no remote catalogue loader, configurable certification override, provisional execution or
network update service in this stage. Remote signature/cache tests are future distribution acceptance,
not tests that have already passed. This preserves the existing strict security gate.

The baseline records the Windows x64 Claude 2.1.296 SHA-256 already inspected for the restricted
personal OAuth configuration. It certifies that configuration's binary/protocol policy evidence.
It does not certify successful paid model answers, native question continuation or semantic resume.
Those remain separate live acceptance items. Windows process-tree ownership remains an independent
known blocker; catalogue classification cannot supply missing OS lifetime evidence.

## Responsibility boundaries

| Boundary                       | Responsibility                                                                                                                                       | PR #98 implementation                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProviderInstallationDetector   | Resolve the configured installation and passively establish platform, architecture, version and SHA-256. Never run an unknown binary to identify it. | Claude native regular-file checks and bounded hashing; a known exact hash establishes the baseline version/architecture. Unknown hashes remain unavailable. General PE version extraction is deferred.              |
| ProviderCompatibilityCatalogue | Resolve trusted build records, incompatibilities and revocations for implemented profiles.                                                           | Immutable bundled baseline, closed record validator and classification policy. No external metadata is trusted.                                                                                                     |
| ProviderProtocolProbe          | Bound initialization/model/effort discovery and observable restrictions after the trust gate.                                                        | Extracted Claude discovery module; existing 10 s operation bound, 1 MiB framing, process owner, cleanup and explicit tool/MCP/plugin validation. Initialization does not prove semantic resume or execution safety. |
| ProviderAdmissionPolicy        | Combine certification with configuration, security, authentication, execution mode and account/workspace affinity.                                   | Pure policy plus the existing installation/account checks and durable coordinator dispatch gate. Provisional always denied.                                                                                         |

Authentication or configuration failure does not revoke an otherwise known build. Readiness still
reports unavailable/authenticationRequired with bounded safe text, without paths, hashes, tokens
or native account identities. No compatibility-management UI is introduced.

## Classifications

- **Verified:** exact provider/platform/architecture/hash, matching identified version, implemented
  protocol profile, current trusted evidence, no revocation. Execution additionally requires every
  independent admission prerequisite. A supported capability is distinct from live acceptance evidence.
- **Provisional:** a passively identified candidate that plausibly belongs to an existing protocol
  family but lacks trusted safety evidence. An unchanged version with another hash belongs here too.
  A permissive version match never admits it. Present policy denies all provisional execution and
  does not run host probes. A future opt-in requires an independently specified OS isolation boundary
  and restricted read-only policy; it cannot relax hooks, MCP, permissions or environment restrictions.
- **Unsupported:** unknown identity, unsupported platform/auth/profile, failed policy, incompatible
  or revoked build, invalid trusted evidence. Internal checking/unknown readiness is not a fourth
  compatibility classification. A candidate with changed/invalid protocol fails probe admission even
  if its fingerprint later obtains a catalogue record.

Classification is descriptive. Invocation permission is a separate decision. Today, an unknown
executable whose version cannot be established without executing it is unsupported, rather than
being run to determine whether it might be provisional.

## Record and future envelope

`providers/compatibility/catalogue.ts` owns the closed executable record schema:

```json
{
  "providerId": "claude",
  "platform": "win32",
  "architecture": "x64",
  "version": "2.1.296",
  "sha256": "76de74f7694a5bdc03378a5f837c9e132827bf004c98c276bc4e9094ff06769a",
  "protocolProfile": "claude-stream-json-v1",
  "classification": "verified",
  "capabilities": ["initialization", "restricted-read-tools", "questions"],
  "authenticationModes": ["personal-pro-max-oauth-file"],
  "executionModes": ["read-only"],
  "evidenceId": "claude-2.1.296-windows-readonly-policy",
  "revoked": false
}
```

A future signed catalogue payload has closed fields `schemaVersion:1`, `revision` (monotonic safe
integer), `issuedAt`, `expiresAt` (UTC timestamps), `records` (bounded unique build records) and
`revocations` (append-only provider/platform/architecture/hash identities with reason/evidence IDs).
The detached envelope contains only `keyId`, `algorithm:"Ed25519"`, `payload` and `signature`.
The signature covers UTF-8 RFC 8785 canonical JSON of the entire payload, including revision and
times. Reject duplicate JSON keys, unknown fields, invalid encodings, excessive nesting, more than
1 MiB, ambiguous/duplicate records and a verified record that is also revoked.

This envelope is a proposed distribution contract, not an available production input. The record
validator alone does not grant trust. A local `.nevo/config.yaml` cannot create a trusted record.

## Signed distribution and offline policy — next stage

Publish the JSON and detached signature independently of provider binaries over HTTPS. Pin the
verification public key in SpecFlow; keep the private signing key in a separately controlled release
system with auditable certification evidence. HTTPS provides transport protection, not catalogue
authenticity. No publishing key or endpoint exists in this PR. Key rotation requires a release or a
separately specified transition signed by the previously trusted key.

Verify signature, closed schema, profile implementation, timestamps and monotonic revision before
activation. Reject future issue times outside a small defined clock-skew budget, expired catalogues,
rollback revisions and same-revision/different-payload changes. Persist the highest activated
revision, payload digest and known revocations atomically before admitting a build. Cache bytes and
signature in Runtime-owned storage using atomic replace/fsync; reverify on every load. A previously
observed revocation must survive cache expiry and must override the bundled baseline and older caches.

Offline startup may use an unexpired, previously verified cache. If that cache expires, dynamically
certified additions become unavailable. The bundled baseline may continue only where it does not
conflict with persisted revocations; never roll back to stale metadata to restore a revoked build.
Missing/corrupt anti-rollback state after updates requires reconciliation, rather than silently
accepting older cached trust. Explicit recovery/reset procedures and expiry duration need approval
with the distribution contract before implementation.

## Probe, caching and launch binding

Trust/isolate first, then probe. Basic probes must not use paid inference. The current Claude
initialize handshake obtains models and effort metadata without a user prompt; first-turn init also
checks expected version, native correlation, workspace, plan permission mode, restricted tools,
empty MCP and only the observed builtin plugins. Auth/policy source inspection precedes execution.
Hooks/environment checks and exact binary evidence are not replaced by a successful handshake.

Discovery is cached for at most 30 seconds. Installation/auth/policy is checked again at validation
and immediately before launch; account changes invalidate admission and native context affinity.
Handshake version is compared with the version of that newly inspected installation, rather than
a second independent constant in the driver. Future catalogue activation must invalidate discovery
and include its revision in the admission evidence. Never fallback from a failed native resume to
a new conversation or resend an input whose dispatch might already have occurred.

There is still a path-based hash-to-spawn interval. Strict atomic identity binding against concurrent
replacement requires the native launcher/file ownership boundary described in the review follow-up.
Another version check after execution cannot make an untrusted binary safe to execute. This is a
remaining hardening dependency, not a guarantee supplied by the current pure catalogue abstraction.

## Staged acceptance

1. **This PR:** bundled exact-hash path, closed record validation, verified/provisional/unsupported
   classification, deny provisional/unknown, policy/auth restrictions unchanged; controlled tests for
   known build, same version/different hash, newer candidate, revoked evidence, unknown profile,
   platform mismatch and failed security prerequisites. Existing installation tests retain fail-closed
   authentication, policy, symlink and fingerprint coverage.
2. **Distribution contract and publisher:** agree expiry/rotation/operator rules, provision signing
   key and evidence publishing. Implement bounded signature verification/cache/anti-rollback, then test
   invalid signature, expired and rolled-back metadata, offline valid cache, persisted revocation and
   unknown sensitive fields. No unverified remote allowlist may substitute for this stage.
3. **Additional certification:** controlled binary fixtures for a newer same-profile build and invalid
   protocol, discovery-to-dispatch update, bounded cancellation and negative tool inventory. Only
   afterwards publish a signed certification record. Semantic continuation/cancellation and actual
   model replies require separate live evidence; a quota response proves neither.
4. **Optional provisional invocation:** future scope, blocked until a safe OS execution boundary and
   explicit opt-in policy are defined. No writable operations in this adapter stage.
