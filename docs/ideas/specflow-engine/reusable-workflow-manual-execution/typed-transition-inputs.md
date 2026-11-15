---
id: ideas.specflow-engine.reusable-workflow.typed-inputs
type: engineering
title: Definition-driven, bounded transition input forms (E5)
status: draft
scope: specflow
areas: [workflow, ui, testing]
tags: [proposal, typed-inputs, forms, run-history]
read_when:
  - adding typed inputs (enum, number, Markdown, ...) to a workflow transition
  - rendering a generic finish form from a workflow definition
  - bounding run history (plan 06 F19)
summary: >
  Open idea: a workflow transition declares typed inputs that the Engine validates, stores within a
  bounded run history and hands to the next step, and a generic UI form renders them. Requires F19
  (bounded run history) first.
related:
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - architecture.workflow.workflow-kernel
  - ideas.specflow-engine.plan-06
  - product.specflow.ui.workflow-execution
---

# Typed transition inputs (E5, open)

Today a finish carries `result`, `feedback`, `artifacts` and, for a producing step, `tasks` and
`taskDecisions`; the Finish dialog renders these from the action projection
([Manual workflow execution](../../../product/specflow/ui/workflow-execution.md#dialogs)).

## Idea

- A transition declares typed fields: semantic type (string, boolean, integer, decimal with explicit
  precision, enum, Markdown), required or optional, and an allowlisted UI hint that is not a component
  import. The Engine validates them, records them in the attempt, hands them to the next step and
  exposes them read-only in the action projection.
- One generic form renders any definition's fields, with errors and the Narrow layout; it never knows
  step ids.

## Prerequisite: bounded history (plan 06 F19)

A run record is bounded to `RECORD_BYTES_MAX`, and long valid histories can already reach it. Before
typed inputs, decide per-field and cumulative limits checked before any write, and where large
immutable values live (a registered document or a content-addressed artifact with id, digest and
revision) with only a bounded reference in the run. Replay and the handoff validate the reference and
fail closed when it is missing; accepted history is never truncated.

## Proof

Submit each field type, validate, persist, reload and hand it forward; a maximal sequence of attempts
and returns with maximal inputs still fits the record budget; a stale or missing external value refuses
safely; a retry stays idempotent.
