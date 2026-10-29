import { describe, expect, it } from 'vitest';

import { mapBounded } from '../src/concurrency';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('mapBounded', () => {
  it('preserves input order and never exceeds the concurrency bound', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapBounded([5, 4, 3, 2, 1, 0], 3, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => setTimeout(resolve, value * 3));
      running -= 1;

      return value * 2;
    });
    expect(result).toEqual([10, 8, 6, 4, 2, 0]);
    expect(peak).toBe(3);
  });

  it('rejects with the first error by input order and lets started work finish', async () => {
    const finished: number[] = [];
    await expect(
      mapBounded([0, 1, 2, 3], 4, async (value) => {
        if (value === 2) {
          throw new Error('late-index-fast');
        }

        if (value === 1) {
          await tick();

          throw new Error('early-index-slow');
        }

        await tick();
        finished.push(value);

        return value;
      }),
    ).rejects.toThrow('early-index-slow');
    expect(finished.sort()).toEqual([0, 3]);
  });

  it('handles empty input and rejects an invalid bound', async () => {
    await expect(mapBounded([], 4, (value: number) => Promise.resolve(value))).resolves.toEqual([]);
    await expect(mapBounded([1], 0, (value) => Promise.resolve(value))).rejects.toThrow(RangeError);
  });
});
