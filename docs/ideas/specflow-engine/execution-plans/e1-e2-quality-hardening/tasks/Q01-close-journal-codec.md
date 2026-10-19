---
id: ideas.specflow-engine.e1e2-hardening.q01
type: engineering
title: "Q01 Pure Close journal codec"
status: draft
scope: specflow
areas: [workflow, testing]
tags: [execution-task, temporary, hardening, journal]
read_when:
  - implementing or independently reviewing Q01 Pure Close journal codec
summary: "Separate strict Close journal schema and evidence validation from path-safe durable filesystem storage."
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q01 — Extract strict Close journal codec (F02)

**Depends on:** Q00 ACCEPT. **Run mode:** SOLO + independent review. **Risk:** MEDIUM. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence and problem

[`journal-store.ts:17–84`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/journal-store.ts#L17-L84) performs filesystem IO and safe path checks, while [`isCloseJournal:86–275`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/journal-store.ts#L86-L275) and [validators:308–520](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/journal-store.ts#L308-L520) enforce entire stage/evidence coherence. [Create already separates codec and store](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/create/journal-codec.ts).

## Required change

- Move *pure* current-format parsing/structural/semantic predicates to `specs/lifecycle/journal-codec.ts` (or equally narrow module). Keep read/write/lstat/realpath/atomic persistence and error translation in `journal-store.ts`.
- Give all current stages and optional evidence a readable, exhaustive validation path. Preserve strict structural checks, resource derivation and invalid-stage rejection. Do not normalize or tolerate old journal formats.
- No change to serialized bytes, stage names, mutating effects, error-code contract, lock/CAS or recovery authority. Avoid introducing a general state-machine library.

## Acceptance/proof

1. Differential fixture corpus from Q00: all valid stages stay accepted; every forgery, missing required evidence, unexpected key/version, wrong resource claim, mismatched archive/scratch/terminal proof stays rejected.
2. Read/write/roundtrip and tampered actual file tests show identical outcomes and unchanged durable state on rejection.
3. Confirm production store shrinks to persistence ownership without stage policy hidden in IO helpers.
4. Run full relevant lifecycle/real-Git regression (including process cases), then independent review. No T17 LC regrading without current-SHA execution.
