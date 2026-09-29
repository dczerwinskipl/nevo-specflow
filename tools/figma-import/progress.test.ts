import { describe, expect, it, vi } from 'vitest';
import { createImportProgress } from './progress';

describe('determinate import progress', () => {
  it('reports real completed work and clamps at the declared total', async () => {
    const report = vi.fn();
    const progress = createImportProgress(2, report);

    progress.complete('Validated');
    await progress.run('Component Button', async () => 'done');
    progress.complete('Ignored overflow');

    expect(report.mock.calls.map(([update]) => update)).toEqual([
      { message: 'Validated', completed: 1, total: 2 },
      { message: 'Component Button', completed: 1, total: 2 },
      { message: 'Component Button', completed: 2, total: 2 },
      { message: 'Ignored overflow', completed: 2, total: 2 },
    ]);
  });
});

