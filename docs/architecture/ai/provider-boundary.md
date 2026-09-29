---
id: architecture.ai.provider-boundary
type: architecture
title: AI provider boundary
status: current
read_when:
  - adding or changing an AI provider
  - exposing provider capabilities
  - mapping provider events, errors, interactions, or session identity
  - deciding whether provider-specific data may cross into Runtime or UI contracts
summary: >
  AI providers are adapters behind canonical SpecFlow contracts. They expose honest
  capabilities, normalize lifecycle/events/errors at the boundary, keep provider-private
  identifiers and payloads out of product contracts, and preserve raw diagnostics only
  for bounded technical inspection.
related:
  - architecture.ai.canonical-session-turn-work
  - architecture.runtime.ownership-and-lifecycle
  - engineering.shared.effects-and-io
  - architecture.principles.normative-language
---

# AI provider boundary

A provider integration is an adapter, not a second product model.

Claude, Codex, Antigravity/Gemini, mocks, and future providers may use different protocols and
execution models. Those differences are contained at the provider boundary.

## Canonical in, provider-specific out

Application/runtime code asks for canonical operations such as:

- discover availability/capabilities;
- create or attach a session;
- start or cancel a Turn;
- answer a canonical interaction;
- inspect provider-backed session metadata.

The adapter translates those operations into the provider's real protocol and maps provider output
back into canonical events/state.

Provider-specific event names, request IDs, SDK objects, JSON-RPC payloads, CLI output shapes, and
process conventions MUST NOT become UI/workflow contracts.

## Honest capabilities

Capabilities describe what the currently usable transport can actually do.

An adapter MUST NOT advertise a capability merely because the provider product supports it in theory. If the configured
or headless transport cannot answer interactive questions, resume sessions, stream reasoning, or
perform another operation, the capability is false/unavailable and attempting it fails explicitly.

Capability discovery MAY change with installation, version, or configuration. When the underlying
fact can change during the Runtime lifetime, capability state MUST NOT be permanently frozen at
construction.

## Error normalization

Provider failures map into a bounded canonical taxonomy useful to application logic, while
preserving technical diagnostics separately.

The canonical provider boundary MUST expose failures in distinguishable categories useful to
application logic, including at least:

- unavailable, not installed, or not authenticated;
- unsupported capability;
- rejected or invalid request;
- process or transport failure;
- timeout, cancellation, or interruption;
- provider-reported execution failure.

UI/workflow code MUST NOT parse human error strings to decide lifecycle semantics.

## Session identity

Provider session identity is opaque. Application code MUST NOT derive semantics from its string
format.

A provider-backed session MUST be addressed by the composite
`ProviderSessionRef = (provider, providerSessionId)`. `providerSessionId` alone MUST NOT be treated
as globally unique.

Local product correlation to specs, tasks, or worktrees is separate metadata and MUST survive
display/path changes.

## Events and ordering

Normalize provider output once, close to the adapter.

Canonical ordering MUST be assigned by the neutral Runtime so downstream consumers do not depend on
provider timestamp quirks or event naming.

Adapters MAY emit incremental events, but terminal arbitration MUST belong to one neutral lifecycle
owner. Competing process exit, cancellation, timeout, protocol-terminal, and disconnect signals
MUST settle to one terminal outcome.

## Raw diagnostics

Raw provider payloads are useful for diagnosis but are not product state.

When retained:

- bound their size and retention;
- keep them out of ordinary UI/product contracts;
- treat them as potentially sensitive;
- associate them with canonical session/turn/work identity;
- MUST NOT be required to reconstruct normal application semantics.

## Interaction transports

MCP, stdio JSON-RPC, CLI hooks, or another bridge are provider/transport mechanisms.

A canonical user interaction is the invariant. The mechanism used to pause/unblock a provider is
replaceable and provider-specific.
