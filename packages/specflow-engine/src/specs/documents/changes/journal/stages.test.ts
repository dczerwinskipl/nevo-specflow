import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_BATCH_REFUSES_RESERVATION,
  DOCUMENT_BATCH_STATES,
  DOCUMENT_BATCH_TRANSITIONS,
  DOCUMENT_CHANGE_STAGES,
  DOCUMENT_CHANGE_STAGE_FACTS,
  DOCUMENT_CHANGE_TRANSITIONS,
  canTransitionDocumentBatch,
  canTransitionDocumentChange,
  isBarrierStage,
  type DocumentBatchState,
  type DocumentChangeStage,
} from './stages';

/** The reviewed transition table, written out independently of the implementation. */
const EXPECTED_OPERATION: readonly (readonly [
  DocumentChangeStage,
  readonly DocumentChangeStage[],
])[] = [
  ['reserved', ['files-writing', 'failed', 'recovery-required']],
  ['files-writing', ['queued', 'completed', 'recovery-required', 'failed', 'files-writing']],
  ['queued', ['committing', 'completed', 'commit-failed']],
  ['committing', ['completed', 'queued', 'commit-failed', 'recovery-required']],
  ['completed', []],
  ['failed', []],
  ['commit-failed', ['queued', 'completed']],
  ['recovery-required', ['queued', 'completed', 'files-writing']],
];

const EXPECTED_BATCH: readonly (readonly [DocumentBatchState, readonly DocumentBatchState[]])[] = [
  ['formed', ['committing', 'dissolved']],
  ['committing', ['committed', 'failed', 'recovery-required', 'dissolved']],
  ['committed', []],
  ['failed', ['dissolved']],
  ['recovery-required', ['committed', 'dissolved']],
  ['dissolved', []],
];

describe('operation stage machine', () => {
  it('lists exactly the stages of the table', () => {
    expect([...DOCUMENT_CHANGE_STAGES].sort()).toEqual(
      EXPECTED_OPERATION.map(([from]) => from).sort(),
    );
  });

  it('allows exactly the reviewed transitions, for every ordered pair of stages', () => {
    const expected = new Map(EXPECTED_OPERATION);
    for (const from of DOCUMENT_CHANGE_STAGES) {
      for (const to of DOCUMENT_CHANGE_STAGES) {
        expect(canTransitionDocumentChange(from, to), `${from} -> ${to}`).toBe(
          expected.get(from)!.includes(to),
        );
      }

      expect([...DOCUMENT_CHANGE_TRANSITIONS[from]].sort()).toEqual(
        [...expected.get(from)!].sort(),
      );
    }
  });

  it('moves a stage to itself only to hand the write to a new executor', () => {
    for (const stage of DOCUMENT_CHANGE_STAGES) {
      expect(canTransitionDocumentChange(stage, stage), stage).toBe(stage === 'files-writing');
    }
  });

  it('reaches every stage from `reserved` and ends only in settled stages or the abandon marker', () => {
    const reached = new Set<DocumentChangeStage>(['reserved']);
    const queue: DocumentChangeStage[] = ['reserved'];
    while (queue.length > 0) {
      for (const next of DOCUMENT_CHANGE_TRANSITIONS[queue.shift()!]) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }

    expect([...reached].sort()).toEqual([...DOCUMENT_CHANGE_STAGES].sort());
    for (const stage of DOCUMENT_CHANGE_STAGES) {
      if (DOCUMENT_CHANGE_TRANSITIONS[stage].length === 0) {
        expect(DOCUMENT_CHANGE_STAGE_FACTS[stage].settled).toBe(true);
      }
    }
  });

  it('lets every active stage reach `completed`', () => {
    for (const start of DOCUMENT_CHANGE_STAGES) {
      if (!DOCUMENT_CHANGE_STAGE_FACTS[start].active) {
        continue;
      }

      const seen = new Set<DocumentChangeStage>([start]);
      const queue = [start];
      while (queue.length > 0) {
        for (const next of DOCUMENT_CHANGE_TRANSITIONS[queue.shift()!]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }

      // `reserved` can also end as a refusal; the others must be able to complete.
      expect(seen.has('completed'), start).toBe(true);
    }
  });

  it('keeps the stage facts consistent', () => {
    for (const stage of DOCUMENT_CHANGE_STAGES) {
      const facts = DOCUMENT_CHANGE_STAGE_FACTS[stage];
      // A barrier holds the claim; a settled record holds nothing and is not active.
      if (facts.barrier) {
        expect(facts.holdsClaim).toBe(true);
      }

      if (facts.settled) {
        expect(facts.holdsClaim).toBe(false);
        expect(facts.active).toBe(false);
      }

      // What is active holds its claim: the listing of active journals is the claim set.
      expect(facts.active).toBe(facts.holdsClaim);
    }
  });

  it('makes only the write phase a barrier', () => {
    expect(isBarrierStage('reserved', undefined)).toBe(true);
    expect(isBarrierStage('files-writing', undefined)).toBe(true);
    expect(isBarrierStage('recovery-required', 'write')).toBe(true);
    expect(isBarrierStage('recovery-required', 'commit')).toBe(false);
    for (const stage of ['queued', 'committing', 'commit-failed', 'completed', 'failed'] as const) {
      expect(isBarrierStage(stage, undefined), stage).toBe(false);
    }
  });
});

describe('batch state machine', () => {
  it('allows exactly the reviewed transitions, for every ordered pair of states', () => {
    const expected = new Map(EXPECTED_BATCH);
    expect([...DOCUMENT_BATCH_STATES].sort()).toEqual([...expected.keys()].sort());
    for (const from of DOCUMENT_BATCH_STATES) {
      for (const to of DOCUMENT_BATCH_STATES) {
        expect(canTransitionDocumentBatch(from, to), `${from} -> ${to}`).toBe(
          expected.get(from)!.includes(to),
        );
      }

      expect([...DOCUMENT_BATCH_TRANSITIONS[from]].sort()).toEqual([...expected.get(from)!].sort());
    }
  });

  it('refuses reservations only over a batch that is committing or awaiting recovery', () => {
    expect(
      DOCUMENT_BATCH_STATES.filter((state) => DOCUMENT_BATCH_REFUSES_RESERVATION[state]).sort(),
    ).toEqual(['committing', 'recovery-required']);
  });
});
