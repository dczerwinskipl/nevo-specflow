---
id: ideas.specflow-runtime.ai-adapters.usage-accounting
type: engineering
title: Provider usage accounting provenance
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - usage
  - tokens
  - cost
  - providers
  - sessions
read_when:
  - mapping provider token or cost usage into canonical Turn state
  - aggregating usage across resumed provider sessions
  - deciding whether a provider usage update is incremental or cumulative
summary: >
  Carry explicit usage scope/provenance so repeated provider usage events and resumed sessions cannot
  be double-counted, distinguishing per-turn deltas, cumulative session totals, and unknown usage
  semantics before aggregation.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.protocol-examples
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
---

# Provider usage accounting provenance

## Current migration risk

Legacy Nevo maps provider usage directly into canonical updates:

- Claude emits `input_tokens` / `output_tokens` from several event shapes;
- Codex emits token-usage notifications;
- Antigravity emits token counts and sometimes cost.

This review did not find an explicit usage-basis field stating whether a sample is:

- a delta for one event;
- total for the current Turn;
- cumulative total for the provider Session;
- provider/model ledger total;
- unknown.

That distinction matters once sessions resume.

A value of `1000 input tokens` cannot safely be summed if it is actually a cumulative session total
repeated on every Turn.

## Candidate usage sample

Conceptually preserve both value and accounting semantics:

```text
UsageSample
  tokensIn?
  tokensOut?
  cachedTokensIn?
  reasoningTokens?
  cost?
  basis
  providerSource?
  sequence/event identity?
```

Candidate `basis` values:

```text
turn_delta
turn_total
session_cumulative
unknown
```

Exact names belong in the eventual target contract.

## Aggregation rules

### turn_delta

Add to the current Turn aggregate once per unique sample/event.

### turn_total

Represents authoritative total-so-far for the Turn.

Use replacement/authoritative-sequence semantics rather than summing every update.

### session_cumulative

Represents provider Session total.

A Turn delta can be derived only from a trustworthy previous baseline associated with the same
`ProviderSessionRef` and compatible metric definition:

```text
current cumulative total - previous persisted cumulative baseline
```

If no trustworthy baseline exists, leave the derived Turn delta unknown.

### unknown

Store/display as diagnostic usage if useful, but do not feed a billing aggregate that assumes a
basis.

Unknown must not silently mean `turn_delta`.

## Multiple provider usage surfaces

Providers may expose usage in several places:

- message/assistant event;
- terminal result;
- dedicated token-usage notification;
- model-usage ledger;
- account/quota API.

These are not automatically additive.

For each provider/version, establish whether:

- two surfaces describe the same tokens;
- one supersedes the other;
- one includes subagents/sidechains while another does not;
- scopes differ.

A terminal/provider ledger may be more authoritative than top-level message usage when provider
evidence says so.

## Usage identity and replay

A reconnect/replayed notification must not duplicate cost.

Candidate dedupe evidence includes:

- provider event/request ID;
- canonical Runtime sequence assigned once;
- provider monotonic usage sequence;
- terminal sample superseding a provisional sample.

Do not deduplicate solely because numeric values happen to be equal.

## Cached and reasoning tokens

Keep provider-exposed dimensions separate until semantics are known.

Do not derive `input = cached + uncached`, or the inverse, without provider evidence.

Likewise `thinking_tokens` / reasoning tokens may be included in output totals, separately billed, or
telemetry-only. Preserve the provider meaning before calculating a neutral rollup.

## Cost provenance

A cost field also needs provenance:

```text
provider_reported
locally_estimated
unknown
```

Do not present a local estimate as provider-billed truth.

If model pricing is later used locally, version/date the pricing evidence.

## Relation to capacity/quota

Turn usage and account capacity answer different questions:

- usage accounting: what did this Turn/Session consume?
- capacity: what can this account/model still consume and when does it reset?

Do not infer remaining quota by subtracting canonical token totals unless the provider explicitly
defines compatible units/windows.

## Verification cases

1. repeated `turn_total` updates replace rather than sum;
2. two real `turn_delta` events add once each;
3. replayed event does not double-count;
4. resumed session cumulative total is differenced only against the same session baseline;
5. missing cumulative baseline leaves derived Turn delta unknown;
6. provider Session change resets cumulative baseline;
7. terminal authoritative sample can supersede provisional samples without duplication;
8. cached/reasoning tokens keep provider-defined dimensions;
9. cost provenance distinguishes provider-reported from estimated;
10. reload reproduces the same aggregate without raw capture.

## Migration note

Add this while canonical usage is still being migrated. Once persisted historical totals exist,
changing from "sum every event" to basis-aware accounting becomes much harder.
