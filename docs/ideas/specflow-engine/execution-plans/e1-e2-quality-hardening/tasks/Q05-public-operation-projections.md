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

## Implementation checkpoint — Q05 candidate for independent review

Starting from exact HEAD `f607fd39d9baa216c0b88aee5be17fec53f87471`, add
`specs/operation-projection.ts` as the single Engine-owned presentation
boundary. Both transports use the same projection for Create and Close.

- Create reports `kind: specification-create`, `status: completed`, stable
  operation/spec/workspace IDs, slug and relative manifest path. Absolute
  `workspaceRoot` remains an internal Engine result and is deliberately
  omitted from normal HTTP and CLI JSON. CLI human output continues to give
  an explicitly requested local workspace location.
- Close reports `operationId`, `specId`, `kind`, status, known outcome and
  conflict-relative paths when resolution is required; it does not expose a
  raw journal, persistent scratch owner, Git SHAs, branches, registry resources
  or absolute filesystem paths. Phases with uncertain effects are reported as
  `recovery-required`, not success. CLI `--preview` is also narrow.
- `specs close-inspect` remains an explicitly requested local operator
  diagnostic returning the durable journal, not a normal mutation response.
  HTTP retains scoped authorization before operation-id lookup, including
  separate project-wide integration privilege on whole-branch operations.
- No backward compatibility adapter is introduced for unreleased JSON shapes.
  Internal Engine journal/plan APIs remain available to lifecycle consumers
  and tests, not serialized by normal transports.
- Contracts are closed with literal operation statuses and outcomes.
  Focused projections tests plus existing cross-transport CLI process and
  Runtime authorization/retry integration tests form the verification surface.

**Gate:** run current-HEAD `pnpm check:quality`, Build/TypeScript, full
Engine/Runtime/CLI integration and independent API review before Q05 ACCEPT.
This checkpoint is not evidence that CI already passed on a new Q05 SHA.

## Independent-review follow-up: supported Engine API boundary

The public package root now exposes projected Close operation/inspection/preview
methods, not raw Close journal/plan types or mutation results. The same projected
results are consumed by CLI and authorized HTTP. Raw Create/Close journal
inspection has the **explicitly named local diagnostic subpath**
`@nevo/specflow-engine/diagnostics`, separate from normal application imports.
Test-only internal lifecycle use cases and types stay under `./testing`.
The CLI `close-inspect` command opts in to the diagnostic subpath, while normal
Create/Close JSON and HTTP remain journal-free. This is a deliberate breaking
change to unreleased Engine exports; no compatibility aliases are added.
