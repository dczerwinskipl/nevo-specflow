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
- Give supported stages and optional evidence a readable, exhaustive validation path. Preserve strict structural checks, resource derivation and invalid-stage rejection. Do not add legacy-format normalization, aliasing or fallback.
- Existing journal bytes, stages and error codes provide a **pre-refactor comparison baseline**, not a backward-compatibility requirement. Intentional changes to version, serialized format, stages and internal contracts are allowed before release without migration; document the difference, update affected consumers and cover it with explicit tests. Preserve durable intent, fail-closed rejection, CAS, idempotency, side-effect ownership and recovery authority. Avoid a general state-machine library.

## Acceptance/proof

1. Use the Q00 fixture corpus to detect changes. Every supported legitimate stage remains valid, and every forgery, missing required evidence, wrong resource claim, mismatched archive/scratch/terminal proof remains rejected. Tighten unintended acceptance of unknown keys/versions if needed; record each deliberate pre-release contract change explicitly rather than preserving the defect.
2. Read/write/roundtrip and tampered actual file tests show equivalent outcomes except for reviewed, intentional contract corrections; rejection must not mutate durable state.
3. Confirm production store shrinks to persistence ownership without stage policy hidden in IO helpers.
4. Run full relevant lifecycle/real-Git regression (including process cases), then independent review. No T17 LC regrading without current-SHA execution.

## Implementation checkpoint (candidate for independent review)

Work commenced at the owner's direction on pre-change HEAD
`a799a2fc0aa7b509d82c0d3fda8cd68296065da3`, while Q00's platform CI
was still queued. This permits implementation, **not** premature Q00 or Q01 ACCEPT.

- Extracted the existing deterministic Close validation from
  `specs/lifecycle/journal-store.ts` into `specs/lifecycle/journal-codec.ts`.
  The storage module retains directory/symlink checks, JSON parsing, atomic
  publication and `CLOSE_JOURNAL_CORRUPT` error translation.
- The validation body was compared mechanically with the original and is
  unchanged apart from naming the shared UUID regex and replacing an outdated
  T11 comment. No Close stage, durable journal shape, Git effect, CAS, registry,
  transport contract, or recovery rule was deliberately changed.
- Focused new boundary coverage:
  `test/quality-hardening-q01-codec.test.ts` verifies a real reserved Close
  checkpoint, rejects forged policy/resource/stage/identity records at both
  codec and store boundaries, and checks that rejected writes leave journal
  bytes, Git HEAD, and registry revision unchanged.
- Differential stages/roundtrip/tampering fixtures remain in
  `test/quality-hardening-q00-journals.test.ts`. The existing lifecycle,
  real-Git, process and crash recovery tests remain the safety gate.
- Current known parser inconsistencies (model-only `recovery-required` stage
  and permissive unknown top-level fields) are **not** fixed by this extraction.
  Their characterization does not create a backward-compatibility obligation;
  changing them requires an explicit, reviewed correctness decision.

**Verification not yet claimed:** `pnpm --filter @nevo/specflow-engine
test:filesystem:full`, `pnpm --filter @nevo/specflow-engine test:unit`,
TypeScript/format checks, and full Ubuntu/Windows/macOS platform gates must
run on the actual Q01 commit SHA. No local PASS is asserted. The independent
reviewer should capture the resulting HEAD and check this report against the
actual source and platform results.

