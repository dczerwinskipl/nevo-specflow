import { describe, expect, it } from 'vitest';

import { createProgressPlaceholderRows, createProgressSteps } from './createProgress';

describe('Create progress copy', () => {
  it('labels the public steps and drops a step this build does not know', () => {
    const steps = createProgressSteps([
      { id: 'reserving', status: 'done' },
      { id: 'registering', status: 'running' },
      { id: 'future-step', status: 'pending' },
    ]);
    expect(steps).toEqual([
      { id: 'reserving', label: { key: 'create.progress.steps.reserving' }, status: 'done' },
      { id: 'registering', label: { key: 'create.progress.steps.registering' }, status: 'running' },
    ]);
  });

  it('reserves one row less for an existing workspace', () => {
    expect(createProgressPlaceholderRows(undefined)).toBe(3);
    expect(createProgressPlaceholderRows({ kind: 'existing', workspaceId: 'x' })).toBe(3);
    expect(createProgressPlaceholderRows({ kind: 'new-worktree' })).toBe(4);
  });
});
