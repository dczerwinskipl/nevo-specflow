---
id: ideas.specflow-engine.e1e2-hardening.q05
type: engineering
title: 'Q05 Stable public operation projections'
status: draft
scope: specflow
areas: [runtime, cli, workflow, testing]
tags: [execution-task, temporary, hardening, contracts]
read_when:
  - implementing or independently reviewing Q05 Stable public operation projections
summary: 'Present transport-neutral Create/Close results instead of exposing durable internal journals by default.'
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q05 — Stable Engine operation results, CLI/HTTP parity (F05)

**Depends on:** Q04 ACCEPT. **Run mode:** SOLO + API contract review. **Risk:** MEDIUM. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

[`engine/index.ts:55–73`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/index.ts#L55-L73) exports internal journal/plan types, [`specs/command.ts:120–220`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow/src/specs/command.ts#L120-L220) emits raw Close results/journals in JSON, while [HTTP publicResult](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-runtime/src/features/specs/close/endpoint.ts#L45-L65) projects a narrower shape and [CloseResultSchema](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-contracts/src/specs/close.ts#L37-L60) accepts arbitrary stage strings.

## Required change

- Define a stable Engine-owned operation status/result projection (Create/Close as appropriate) with minimal public fields: operationId, specId, kind, status, known outcome and safely scoped conflict diagnostics.
- Use the same projection as the basis for normal CLI JSON and HTTP results. The adapters retain transport-specific status/error mapping and authorization; no duplicated lifecycle logic.
- Treat raw journal inspection as an explicitly named privileged/operator diagnostic, not ordinary completion output. Audit all standard paths for raw filesystem, registry, scratch owner or physical Git representation leaks.
- Evaluate existing consumers from Q00; if an unreleased prototype JSON shape changes, document the deliberate break instead of adding permanent compatibility scaffolding.
- Preserve capability scoping for whole-branch integration and ensure no speculative workflow evaluation statuses are introduced.

## Acceptance/proof

- Schema tests assert exact shape and status for completed, in-progress, known-conflict and recovery-required outcomes; no uncontrolled `stage: string` coupling in standard public DTO.
- CLI JSON and HTTP responses semantically match for same operation identity, with appropriate differentiated authorization.
- Anonymous/unauthorized requests cannot use operation IDs to infer other Specs or project Git history.
- Real CLI subprocess + HTTP integration tests, normal offline invocation and refresh after independent CLI mutation remain green.
