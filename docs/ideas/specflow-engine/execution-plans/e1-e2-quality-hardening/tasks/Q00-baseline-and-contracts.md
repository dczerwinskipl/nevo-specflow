---
id: ideas.specflow-engine.e1e2-hardening.q00
type: engineering
title: "Q00 Baseline and behavioral characterization"
status: draft
scope: specflow
areas: [testing, workflow, cli, runtime]
tags: [execution-task, temporary, hardening, testing]
read_when:
  - implementing or independently reviewing Q00 Baseline and behavioral characterization
summary: "Pin the refactor baseline and capture current journal, CLI and HTTP behavior without modifying production code."
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q00 — Lock refactor baseline and observable behavior

**Depends on:** current PR #53 SHA and T17 ownership boundary (not T17 acceptance). **Run mode:** SOLO. **Risk:** low. **Finding:** enabling checkpoint for F01–F07.

## Implementation boundary

- Pin current branch HEAD and base, tree identity and audit source SHA `d3770c575b89a8e27e58e9bd468f9febacde2588`. Do not assume that a post-squash SHA shares previous CI results.
- Record current-format Create and Close journal fixtures for valid stages and invalid/tampered cases, with exact parsing accept/reject behavior and no compatibility for unreleased formats.
- Capture CLI `--json` / `close-inspect`, HTTP Create/Close/preview/inspection responses (including 202 conflict and authorization), and Engine entrypoint exports. Identify any real consumers before Q05 changes the public shape.
- Record direct real-Git evidence for close-worktree, primary archive, linked archive+integrate, archive-only, divergent conflict and operator-reconciled recovery. Capture physical state, registry generation and whether a retry mutates.
- Identify ongoing T17 test changes separately. Do not absorb functional/regression-fix ownership or report a pending CI job as PASS.

## Acceptance

- Reproducible baseline artifact with pinned SHA, input, output and comparison criteria; no production modifications.
- Source of truth for follow-up behavioral diffs (not just screenshots of green checks).
- Independent reviewer confirms fixture and scenario selection is sufficient to detect altered journal acceptance, transition dispatch and CLI/HTTP contract semantics.

## Verification

`pnpm --filter @nevo/specflow-engine test:unit`, relevant existing Engine/CLI/Runtime suites, and available full platform evidence must be reported with exact SHAs. No fabricated execution if the environment cannot run them.
