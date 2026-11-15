import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copyText';

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes the text and resolves true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('docs/a.md')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('docs/a.md');
  });

  it('resolves false without a clipboard (an insecure context)', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyText('x')).resolves.toBe(false);
  });

  it('resolves false when the browser refuses the write', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    await expect(copyText('x')).resolves.toBe(false);
  });
});
