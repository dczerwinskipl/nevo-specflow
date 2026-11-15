import { describe, expect, it, vi } from 'vitest';

import { whileReleased } from './release-workspace';

describe('releasing a workspace around Close', () => {
  it('releases only a linked plan source, and ends the hold when Close fails', async () => {
    const end = vi.fn();
    const release = vi.fn(() => Promise.resolve({ end }));

    // A retry after the binding moved to the primary still carries the plan's linked source.
    const linked = { workspaceId: 'linked-1', kind: 'linked' } as const;
    await expect(whileReleased(release, linked, () => Promise.resolve('done'))).resolves.toBe(
      'done',
    );
    expect(release).toHaveBeenCalledWith('linked-1');
    expect(end).toHaveBeenCalledOnce();

    await expect(
      whileReleased(release, linked, () => Promise.reject(new Error('close failed'))),
    ).rejects.toThrow('close failed');
    expect(end).toHaveBeenCalledTimes(2);

    await whileReleased(release, { workspaceId: 'primary', kind: 'primary' }, () =>
      Promise.resolve(),
    );
    expect(release).toHaveBeenCalledTimes(2);
  });
});
