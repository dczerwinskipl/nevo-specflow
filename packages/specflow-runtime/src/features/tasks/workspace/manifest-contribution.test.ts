import { describe, expect, it } from 'vitest';

import { manifestTasksSection, manifestWorkspaceTasks } from './manifest-contribution';

describe('manifestTasksSection', () => {
  it('reports a verified empty Task list as an available empty section', () => {
    expect(manifestTasksSection([])).toEqual({
      state: 'available',
      data: { groups: [], completed: 0, total: 0, attention: [] },
    });
  });

  it('reads the manifest Tasks the Specification source handed over, never a second time', async () => {
    await expect(manifestWorkspaceTasks('s', { manifestTasks: [] })).resolves.toMatchObject({
      state: 'available',
    });
    await expect(manifestWorkspaceTasks('s', {})).resolves.toEqual({
      state: 'unavailable',
      reason: 'source_unavailable',
    });
  });

  it('never guesses Tasks from unverified manifest entries', () => {
    expect(manifestTasksSection([{ id: 'task-1' }])).toEqual({
      state: 'unavailable',
      reason: 'not_implemented',
    });
  });
});
