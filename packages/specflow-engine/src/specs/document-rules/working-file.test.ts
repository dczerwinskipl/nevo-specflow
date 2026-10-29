import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { symlinksAvailable } from '../../../test/support/platform';

import { sha256Hex } from '../../hash';
import { hashWorkingFile } from './working-file';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'specflow-working-file-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('hashWorkingFile', () => {
  it('hashes a regular file, reports an absent path and a directory', async () => {
    await writeFile(join(dir, 'a.md'), 'abc');
    expect(await hashWorkingFile(join(dir, 'a.md'), 1024)).toEqual({
      kind: 'file',
      sha256: sha256Hex('abc'),
      bytes: 3,
    });
    expect(await hashWorkingFile(join(dir, 'nope.md'), 1024)).toEqual({ kind: 'absent' });
    expect(await hashWorkingFile(dir, 1024)).toEqual({ kind: 'not-regular' });
  });

  it('refuses a file over the limit without reading it', async () => {
    await writeFile(join(dir, 'big.md'), '');
    await truncate(join(dir, 'big.md'), 2048);
    expect(await hashWorkingFile(join(dir, 'big.md'), 1024)).toEqual({ kind: 'too-large' });
  });

  it.skipIf(!symlinksAvailable)('never reads through a symbolic link', async () => {
    await writeFile(join(dir, 'target.md'), 'abc');
    await symlink(join(dir, 'target.md'), join(dir, 'link.md'));
    expect(await hashWorkingFile(join(dir, 'link.md'), 1024)).toEqual({ kind: 'not-regular' });
  });
});
