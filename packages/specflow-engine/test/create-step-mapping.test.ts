import { describe, expect, it } from 'vitest';

import { CREATE_STAGES } from '../src/specs/create-journal';
import { createStepForStage } from '../src/specs/create/step-mapping';

describe('createStepForStage', () => {
  it.each([
    ['reserved', 'existing', false, 'reserving'],
    ['reserved', 'new-worktree', true, 'reserving'],
    ['git-initiated', 'existing', false, 'reserving'],
    ['git-initiated', 'new-worktree', false, 'preparing-workspace'],
    ['git-provisioned', 'new-worktree', true, 'preparing-workspace'],
    ['manifest-writing', 'existing', true, 'writing-specification'],
    ['manifest-written', 'new-worktree', false, 'writing-specification'],
    ['commit-writing', 'existing', true, 'committing-specification'],
    ['commit-written', 'new-worktree', true, 'committing-specification'],
    ['commit-writing', 'existing', false, 'writing-specification'],
    ['registry-writing', 'existing', true, 'registering'],
    ['registry-linked', 'new-worktree', false, 'registering'],
    ['completed', 'existing', true, undefined],
    ['recovery-required', 'new-worktree', true, undefined],
    ['from-the-future', 'existing', true, undefined],
  ] as const)('%s / %s / commits=%s -> %s', (stage, target, commits, expected) => {
    expect(createStepForStage(stage, target, commits)).toBe(expected);
  });

  it('maps every non terminal stage to a step (a new stage must be classified)', () => {
    for (const stage of CREATE_STAGES) {
      const step = createStepForStage(stage, 'new-worktree', true);
      if (stage === 'completed' || stage === 'recovery-required') expect(step).toBeUndefined();
      else expect(step, stage).toBeDefined();
    }
  });
});
