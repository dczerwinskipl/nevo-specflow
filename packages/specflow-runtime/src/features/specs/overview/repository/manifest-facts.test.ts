import { describe, expect, it } from 'vitest';

import { classifyCurrentSpec } from '../current/classify-spec';
import { manifestOverviewFacts } from './manifest-facts';

/** A Current record as the Engine repository builds it from the manifest. */
function current(tasks: readonly unknown[]) {
  const { status: _status, ...facts } = manifestOverviewFacts({ tasks });
  return {
    id: 'spec-1',
    title: 'Spec',
    updatedAt: '2026-10-29T10:00:00Z',
    ...facts,
    signals: [],
    currentExecutions: [],
  };
}

describe('manifestOverviewFacts', () => {
  it('gives every Specification the draft status until a workflow defines others', () => {
    expect(manifestOverviewFacts({ tasks: [] })).toMatchObject({
      status: 'draft',
      readyForWork: false,
    });
    expect(classifyCurrentSpec(current([]))).toEqual({ section: 'draft' });
    expect(classifyCurrentSpec(current([{ id: 'TASK-01', status: 'done' }]))).toEqual({
      section: 'draft',
    });
  });

  it('reports no tasks as 0 / 0 and never guesses progress from unverified task entries', () => {
    expect(manifestOverviewFacts({ tasks: [] }).progress).toEqual({ completed: 0, total: 0 });
    expect(
      manifestOverviewFacts({ tasks: [{ id: 'TASK-01', status: 'done' }] }).progress,
    ).toBeNull();
  });
});
