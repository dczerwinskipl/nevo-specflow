import { describe, expect, it } from 'vitest';

import { manifestTasksSection } from './manifest-contribution';

describe('manifestTasksSection', () => {
  it('reports a verified empty Task list as an available empty section', () => {
    expect(manifestTasksSection([])).toEqual({
      state: 'available',
      data: { groups: [], completed: 0, total: 0, attention: [] },
    });
  });

  it('never guesses Tasks from unverified manifest entries', () => {
    expect(manifestTasksSection([{ id: 'task-1' }])).toEqual({
      state: 'unavailable',
      reason: 'not_implemented',
    });
  });
});
