---
id: reference.providers.compatibility
type: reference
title: Provider build compatibility and admission
status: current
scope: specflow
areas: [ai, runtime, security]
tags: [providers, compatibility, discovery, admission]
read_when:
  - a provider CLI was updated and availability changed
  - changing provider discovery caching, build classification or admission prerequisites
  - adding a tested or known-incompatible build record
summary: >
  Optimistic build compatibility with strict capability enforcement: Tested, Provisional and
  Unsupported classification, fingerprint identity, the 30-second discovery cache,
  reinspection before dispatch and the bundled compatibility catalogue.
related:
  - reference.protocols.session-provider-driver
  - architecture.ai.provider-boundary
  - reference.providers.claude
  - reference.providers.codex
  - reference.providers.antigravity
---

# Provider build compatibility and admission

Code: `providers/compatibility/{catalogue,admission}.ts`. Compatibility is **optimistic about
builds and strict about capabilities**. Unknown versions and hashes run when the implemented
protocol and the required execution checks pass. A catalogue entry, signature service or new
SpecFlow release MUST NOT be required for an ordinary compatible CLI update, and neither a missing
certificate nor a per-update negative-control run may become an indirect hash pin.

Known API introduction or removal boundaries MAY define a minimum version or an incompatible
range. The installed version MUST NOT be used as an arbitrary minimum, and an untested release MUST
NOT be assumed incompatible. A genuinely new protocol profile may still need a SpecFlow release.

## Classification

| Class       | Meaning                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tested      | A trusted record matches the exact build (provider, platform, architecture, SHA-256) **and** lists the requested execution mode, and current checks pass. It does not claim every model, question or resume scenario. |
| Provisional | Any other compatible build passing current local checks, including a new hash at a known version, a newer release or a new major. Available without extra opt-in or a blocking warning.                               |
| Unsupported | A known-incompatible or revoked record, an unimplemented platform/profile, or a failed required protocol/restriction check. The affected operation or mode is refused with a bounded reason.                          |

- Tested and Provisional pass exactly the same configuration, authentication, policy, environment,
  read-only and model/effort gates. Writable effects still require Engine admission.
- A Tested record that does not list the requested execution mode is Provisional for that mode.
- Missing version metadata leaves the build Provisional; a successful handshake never implies
  Tested.
- A failed file read, cancelled probe or unverified process settlement is technical unavailability,
  not proof of protocol incompatibility.
- An unsupported requested mode does not disable another supported mode.
- Real adapters are currently implemented for Windows x64 only; other platforms classify as
  Unsupported.

## Admission prerequisites

`admitProvider` refuses Unsupported builds and otherwise requires `configured`, `authenticated`,
`protocolVerified` and `executionPolicyChecked`, and for `workspace-write` also available managed
effects. Protocol compatibility alone never authorizes host execution.

`executionPolicyChecked` means the adapter validated its supported native configuration/policy
contract. It is **not** a security attestation: configuration checks, effective reported tools,
hook protocol implementation and observed OS containment are separate evidence, and a no-input
handshake proves neither native hook execution nor OS isolation.

## Fingerprint, cache and reinspection

- Each adapter fingerprints its bounded regular native executable with SHA-256. The fingerprint is
  diagnostic identity and a cache key, not an allowlist.
- Discovery is cached for at most 30 seconds, keyed by a digest of executable path and hash, opaque
  account binding, authentication source, projected environment, workspace and protocol profile.
  Authentication and policy sources are rechecked before the cache is consulted. Changing the
  account or relevant configuration, or an authoritative authentication failure, invalidates
  availability. Native bookkeeping and routine token refresh do not require a catalogue change.
- Installation identity is reinspected between probing and dispatch. Claude and Codex discard an
  executable change seen during discovery and probe the current build, at most two attempts;
  Antigravity refuses an identity change during discovery or immediately before invocation and
  requires availability to be rechecked. Model and effort are revalidated against the fresh
  catalogue; dispatch never uses an old build's models.
- The hash-to-spawn interval is path based, not an atomic executable-handle lock.

## Compatibility catalogue

The catalogue is a closed, product-bundled record set; there is no configuration or HTTP input.
A record holds provider, platform, architecture, version, SHA-256, protocol profile,
`tested | unsupported`, capabilities, authentication modes, execution modes, evidence ID and
`revoked`.

- A valid known-incompatible or revoked record wins over optimistic classification.
- Several matching records, or an invalid one, cannot grant Tested and leave the build Provisional;
  they do not create an incompatibility.
- An absent entry never disables a locally compatible build.
- Remote signing, distribution or anti-rollback is optional future infrastructure and never a
  source of executable code, command arguments or protocol parsers.
