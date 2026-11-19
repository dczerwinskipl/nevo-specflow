import { lstat, mkdtemp, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRecordFile } from './record-files';

vi.mock('node:fs/promises', { spy: true });

const nodeFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const filename = 'record.json';
let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'workflow-record-')));
  await writeFile(join(root, filename), 'original');
});

afterEach(async () => {
  vi.resetAllMocks();
  await rm(root, { recursive: true, force: true });
});

const read = () => readRecordFile({ root, segments: [] }, filename, 128);

describe('workflow record identity', () => {
  it('reads an unchanged regular file', async () => {
    await expect(read()).resolves.toBe('original');
  });

  it.each([
    [0n, 7n],
    [7n, 0n],
  ] as const)(
    'refuses an inode mismatch between inspection (%s) and open (%s)',
    async (inspected, opened) => {
      const stat = await nodeFs.lstat(join(root, filename), { bigint: true });
      vi.mocked(lstat).mockResolvedValueOnce(Object.assign(stat, { ino: inspected }));
      const handle = await nodeFs.open(join(root, filename), 'r');
      const openedStat = await handle.stat({ bigint: true });
      const readBytes = vi.spyOn(handle, 'read');
      vi.spyOn(handle, 'stat').mockResolvedValueOnce(Object.assign(openedStat, { ino: opened }));
      vi.mocked(open).mockResolvedValueOnce(handle);

      try {
        await expect(read()).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
        expect(readBytes).not.toHaveBeenCalled();
      } finally {
        await handle.close();
      }
    },
  );

  it('refuses a regular file replaced between inspection and open', async () => {
    const path = join(root, filename);
    const replacement = join(root, 'replacement.json');
    await writeFile(replacement, 'replaced');
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      await rename(path, join(root, 'original.json'));
      await rename(replacement, path);

      return nodeFs.open(...args);
    });

    await expect(read()).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
  });
});
