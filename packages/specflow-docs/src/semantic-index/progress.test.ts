import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createProgressRecorder, indexActivity, readLatestProgress } from './progress';

const directory = mkdtempSync(join(tmpdir(), 'specflow-docs-progress-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('refresh progress records', () => {
  it('records a refresh to new files, keeps only the latest and maps it with the writer lock', async () => {
    let now = Date.parse('2026-11-10T10:00:00.000Z');
    const recorder = createProgressRecorder(directory, { pid: 42, now: () => now });
    void recorder.update({ embedded: 0, total: 300 });
    now += 60_000;
    void recorder.update({ embedded: 128, total: 300 });
    await recorder.finish({ outcome: 'completed', generation: 7 });

    const record = await readLatestProgress(directory);
    expect(record).toMatchObject({
      state: 'finished',
      outcome: 'completed',
      generation: 7,
      pid: 42,
      startedAt: '2026-11-10T10:00:00.000Z',
      embedded: 128,
      total: 300,
    });
    expect(readdirSync(directory)).toHaveLength(1);
    expect(indexActivity({ status: 'free' }, record)).toEqual({
      state: 'idle',
      last: {
        outcome: 'completed',
        startedAt: '2026-11-10T10:00:00.000Z',
        endedAt: '2026-11-10T10:01:00.000Z',
        embedded: 128,
        total: 300,
        generation: 7,
      },
    });

    // A running record is the holder's progress while it holds the lock, interrupted without it.
    const running = { ...record!, state: 'running' as const };
    expect(indexActivity({ status: 'held', pid: 42 }, running)).toEqual({
      state: 'updating',
      pid: 42,
      progress: {
        startedAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-10T10:01:00.000Z',
        embedded: 128,
        total: 300,
      },
    });
    expect(indexActivity({ status: 'held', pid: 7 }, running)).toEqual({
      state: 'updating',
      pid: 7,
    });
    expect(indexActivity({ status: 'free' }, running)).toMatchObject({
      state: 'idle',
      last: { outcome: 'interrupted' },
    });
  });
});
