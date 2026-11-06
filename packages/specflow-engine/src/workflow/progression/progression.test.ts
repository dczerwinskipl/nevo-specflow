import { describe, expect, it } from 'vitest';

import type { WorkflowRun } from '../state/model';
import { assertFeedback, assertFinishInput, handoffOf } from './progression';

const SAME_TIME = '2026-11-05T10:00:00.000Z';

const run = (overrides: Partial<WorkflowRun>): WorkflowRun => ({
  workflow: { id: 'task-standard', version: 1, revision: 'a'.repeat(64) },
  position: { state: 'ready', step: 'implement' },
  attempts: [],
  returns: [],
  ...overrides,
});

describe('handoffOf', () => {
  const finished = {
    step: 'implement',
    attempt: 1,
    startedAt: SAME_TIME,
    endedAt: SAME_TIME,
    outcome: { kind: 'transition' as const, transition: 'done', artifacts: [] },
  };
  const ownerReturn = {
    at: SAME_TIME,
    from: { state: 'ready' as const, step: 'review' },
    to: 'implement',
    feedback: 'Again.',
  };

  it('takes the later event by sequence even when the timestamps are equal', () => {
    expect(
      handoffOf(
        run({
          attempts: [{ ...finished, sequence: 1 }],
          returns: [{ ...ownerReturn, sequence: 2 }],
        }),
      ),
    ).toEqual({ kind: 'return', at: SAME_TIME, feedback: 'Again.' });
    expect(
      handoffOf(
        run({
          attempts: [{ ...finished, sequence: 2 }],
          returns: [{ ...ownerReturn, sequence: 1 }],
        }),
      ),
    ).toMatchObject({ kind: 'transition', transition: 'done' });
  });

  it('ignores a clock that went back', () => {
    expect(
      handoffOf(
        run({
          attempts: [{ ...finished, sequence: 2, endedAt: '2020-01-01T00:00:00.000Z' }],
          returns: [{ ...ownerReturn, sequence: 1 }],
        }),
      ),
    ).toMatchObject({ kind: 'transition' });
  });
});

describe('finish input limits', () => {
  it.each([
    ['an empty artifact', { artifacts: [''] }],
    ['an over-long artifact', { artifacts: ['x'.repeat(1001)] }],
    ['too many artifacts', { artifacts: Array.from({ length: 101 }, () => 'file.ts') }],
    ['over-long feedback', { feedback: 'x'.repeat(16385) }],
  ])('rejects %s before anything is stored', (_name, input) => {
    expect(() => assertFinishInput(input)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
    );
  });

  it('measures feedback as it is stored (trimmed)', () => {
    expect(() => assertFeedback(` ${'x'.repeat(16384)} `)).not.toThrow();
  });
});
