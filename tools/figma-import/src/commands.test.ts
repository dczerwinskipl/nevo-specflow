import { describe, expect, it, vi } from 'vitest';
import { importStage } from './commands';

describe('import stage retries', () => {
  it('retries transient Figma node invalidation before surfacing an error', async () => {
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('in set_name: Internal Figma Error: Node not found'))
      .mockRejectedValueOnce(new Error('Internal Figma Error: Node not found'))
      .mockResolvedValue('ok');

    await expect(importStage('Component AppShell', action)).resolves.toBe('ok');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('does not retry deterministic importer failures', async () => {
    const action = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('invalid layout'));

    await expect(importStage('Component Example', action)).rejects.toThrow(
      'Component Example: invalid layout',
    );
    expect(action).toHaveBeenCalledOnce();
  });
});
