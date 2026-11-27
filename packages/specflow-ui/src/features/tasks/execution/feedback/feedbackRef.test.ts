import { describe, expect, it } from 'vitest';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { feedbackSections, findFeedbackSubject, hasFeedback } from './feedbackRef';

const owner = {
  class: 'human' as const,
  details: { actorId: 'local:dominik', trust: 'local' as const },
};
const attempt = (
  step: string,
  number: number,
  fields: Partial<Extract<WorkflowHistory['items'][number], { kind: 'attempt' }>> = {},
) => ({
  kind: 'attempt' as const,
  sequence: number,
  step,
  stepTitle: step,
  attempt: number,
  startedAt: `2026-11-25T1${String(number)}:00:00Z`,
  ...fields,
});

const items: WorkflowHistory['items'] = [
  { kind: 'return', sequence: 5, at: '2026-11-25T16:00:00Z', to: 'design', feedback: 'Back.' },
  attempt('review', 3, {
    endedAt: '2026-11-25T15:30:00Z',
    outcome: { kind: 'returned', to: 'design', feedback: 'Design first.' },
  }),
  attempt('review', 2, {
    outcome: {
      kind: 'transition',
      transition: 'approved',
      feedback: 'Looks right.',
      artifacts: [],
    },
    confirmation: {
      state: 'rejected',
      at: '2026-11-25T14:09:00Z',
      actor: owner,
      feedback: 'Split T-04.',
    },
  }),
  attempt('review', 1, { outcome: { kind: 'transition', transition: 'approved', artifacts: [] } }),
];

describe('the feedback a reference names', () => {
  it('finds an attempt by its step and number, with its result and its rejection in order', () => {
    const subject = findFeedbackSubject(items, { step: 'review', attempt: 2 })!;
    expect(subject.kind).toBe('attempt');
    expect(feedbackSections(subject)).toEqual([
      { source: 'result', markdown: 'Looks right.' },
      { source: 'rejection', markdown: 'Split T-04.' },
    ]);
  });

  it('finds a return hand-off by when it happened: a return record, a Reject or a returned attempt', () => {
    expect(findFeedbackSubject(items, { returnedAt: '2026-11-25T16:00:00Z' })?.kind).toBe('return');
    const rejected = findFeedbackSubject(items, { returnedAt: '2026-11-25T14:09:00Z' });
    expect(rejected?.kind === 'attempt' && rejected.item.attempt).toBe(2);
    const returned = findFeedbackSubject(items, { returnedAt: '2026-11-25T15:30:00Z' });
    expect(returned?.kind === 'attempt' && returned.item.attempt).toBe(3);
  });

  it('says when there is nothing to view, and when the history does not hold it', () => {
    const plain = findFeedbackSubject(items, { step: 'review', attempt: 1 })!;
    expect(plain.kind === 'attempt' && hasFeedback(plain.item)).toBe(false);
    expect(feedbackSections(plain)).toEqual([]);
    expect(findFeedbackSubject(items, { step: 'review', attempt: 9 })).toBeUndefined();
    expect(findFeedbackSubject(items, { returnedAt: '2026-01-01T00:00:00Z' })).toBeUndefined();
  });
});
