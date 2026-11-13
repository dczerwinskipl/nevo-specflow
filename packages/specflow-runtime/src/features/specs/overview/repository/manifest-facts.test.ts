import { describe, expect, it } from 'vitest';

import { classifyCurrentSpec } from '../current/classify-spec';
import { manifestOverviewFacts } from './manifest-facts';

describe('manifestOverviewFacts', () => {
  it('gives every Specification the draft status until a workflow defines others', () => {
    const { status, ...facts } = manifestOverviewFacts();
    expect(status).toBe('draft');
    expect(facts.readyForWork).toBe(false);
    expect(
      classifyCurrentSpec({
        id: 'spec-1',
        title: 'Spec',
        updatedAt: '2026-10-29T10:00:00Z',
        ...facts,
        progress: null,
        signals: [],
        currentExecutions: [],
      }),
    ).toEqual({ section: 'draft' });
  });
});
