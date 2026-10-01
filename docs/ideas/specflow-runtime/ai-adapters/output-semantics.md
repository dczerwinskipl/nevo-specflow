---
id: ideas.specflow-runtime.ai-adapters.output-semantics
type: engineering
title: Provider output semantics
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - streaming
  - commentary
  - reasoning
  - final-answer
read_when:
  - mapping provider streams into canonical Work
  - deciding whether assistant text is commentary or a final answer
  - adding compatibility for provider protocol versions
summary: >
  Preserve provider-native structured phases when available and use a conservative buffered
  fallback when they are not, keeping reasoning, commentary, tools, and final answer distinct
  without making raw stdout the canonical transcript.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.provider-boundary
  - ideas.specflow-runtime.ai-adapters.protocol-examples
---

# Provider output semantics

## Goal

Map provider output once into the canonical `Turn -> Work` model while preserving the distinction
between:

- reasoning;
- commentary/progress;
- tool activity;
- final answer;
- diagnostics/errors.

The adapter should use provider structure when available and only infer semantics when the provider
does not expose them.

## Rule: explicit provider phase wins

If the provider supplies a stable explicit phase, do not re-infer it from ordering.

A useful example is an agent-message item carrying one of:

- `commentary`
- `final_answer`

Reasoning is a separate item/event family and should map directly to reasoning Work.

### Compatibility fallback for unphased messages

For older or reduced protocol shapes where an agent message has no phase:

1. buffer it without immediately calling it final;
2. if a later agent message/tool activity supersedes it, publish it as commentary;
3. at terminalization, if no explicit final answer exists, the last completed unphased agent message
   may be promoted to final answer;
4. once published under one canonical kind, it cannot later move to another kind; this follows the
   current canonical Work invariant that Work items do not change kind after creation.

This preserves compatibility without treating every assistant delta as final.

## Claude-family stream mapping

Useful structural rules:

### Reasoning

Map these directly to reasoning:

- content block type `thinking`;
- delta type `thinking_delta`;
- equivalent provider-supported reasoning/thought block where explicitly documented.

### Tool activity

A `tool_use` block starts tool Work. A correlated `tool_result` completes/fails that Work.

Tool appearance is also evidence that preceding assistant text was not the terminal final answer.

### Text

When no explicit final/commentary phase exists, a conservative strategy is:

- keep assistant text buffered while the turn is still structurally open;
- when tool activity begins, flush preceding buffered text as commentary;
- text emitted while a tool is actively being orchestrated is commentary/progress;
- on authoritative successful terminal result, remaining buffered assistant text becomes final
  answer;
- if no usable buffer exists, a provider terminal `result` string can be the final-answer fallback.

Do not emit both the buffered assistant text and the terminal `result` if one is merely a replay of
the other.

## Antigravity/Gemini-style stream mapping

Legacy evidence suggests a provider may emit generic `text` / `text.delta` without a reliable
phase. The same buffer-and-commit strategy is appropriate:

- generic text remains pending;
- start/completion of tool activity flushes pending text to commentary;
- reasoning/thought events map separately;
- terminal response becomes final only after terminal disposition is resolved;
- stale/advisory error text must not be appended to final answer.

When terminal response contains already-committed commentary as a prefix, strip/dedupe rather than
duplicating it.

## Final answer is not "last stdout line"

The candidate adapter mapping should not determine final answer from:

- last line written to stdout;
- last non-empty assistant-looking string;
- stderr being empty;
- process exit code 0 alone.

It should come from protocol semantics plus the compatibility fallback above.

## Diagnostic data is separate

Provider warnings, retry notices, quota messages, stderr, protocol warnings, parser warnings, and
unknown event shapes belong to technical diagnostics. They do not become commentary or final answer
unless the provider explicitly says they are assistant content.

## Unknown protocol shapes

For a previously unseen event/block type:

- capture bounded raw diagnostics;
- do not silently reinterpret it as final answer;
- if safe, ignore it for canonical semantics and emit a parser diagnostic;
- if the unknown shape affects terminal/lifecycle correctness, fail explicitly as protocol
  incompatibility rather than guessing.

## Invariants

1. One provider payload maps to canonical semantics once.
2. Reasoning never becomes final answer by fallback.
3. Tool output never becomes assistant final answer by fallback.
4. Commentary already committed remains commentary.
5. Terminal Turn immutability prevents late final-answer append.
6. Explicit provider phase outranks positional inference.
7. Fallback inference is deterministic and replay-testable.

## Verification cases

Include fixtures for:

- explicit commentary followed by explicit final answer;
- explicit final answer with streamed deltas plus completed-item suffix;
- multiple unphased messages where only the last becomes final;
- unphased message followed by tool call becomes commentary;
- thinking + text + tool + text + successful result;
- terminal result that repeats assistant text does not duplicate content;
- terminal response prefixed by already-committed commentary is deduplicated;
- error/warning text containing natural-language answer fragments never becomes final;
- late provider text after terminalization is diagnostic only.
