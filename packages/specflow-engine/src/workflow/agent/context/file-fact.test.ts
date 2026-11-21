import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fileFact, isCheckoutRelative } from './file-fact';

let base: string | undefined;
afterEach(async () => {
  if (base) {
    await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    base = undefined;
  }
});

/** A symlink the platform may refuse (Windows without the privilege): the case is then skipped. */
async function tryLink(target: string, path: string, type: 'file' | 'dir'): Promise<boolean> {
  try {
    await symlink(target, path, type);

    return true;
  } catch {
    return false;
  }
}

describe('fileFact', () => {
  it('pins a regular file by size and digest and refuses paths that leave the checkout', async () => {
    base = await mkdtemp(join(tmpdir(), 'agent-context-'));
    const root = join(base, 'root');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'abc');
    await writeFile(join(base, 'secret.txt'), 'outside');
    const budget = { remaining: 100 };

    const fact = await fileFact(root, 'src/a.ts', budget);
    expect(fact).toMatchObject({ path: 'src/a.ts', bytes: 3 });
    expect(fact?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(budget.remaining).toBe(97);

    for (const path of ['../secret.txt', '/etc/passwd', 'C:/x', 'src\\a.ts', 'src/../src/a.ts']) {
      expect(isCheckoutRelative(path)).toBe(false);
      expect(await fileFact(root, path, budget)).toBeUndefined();
    }

    expect(await fileFact(root, 'src', budget)).toBeUndefined();
    expect(await fileFact(root, 'src/missing.ts', budget)).toBeUndefined();
    expect(await fileFact(root, 'src/a.ts', { remaining: 2 })).toEqual({
      path: 'src/a.ts',
      bytes: 3,
    });

    if (await tryLink(join(base), join(root, 'out'), 'dir')) {
      expect(await fileFact(root, 'out/secret.txt', budget)).toBeUndefined();
    }

    if (await tryLink(join(base, 'secret.txt'), join(root, 'link.txt'), 'file')) {
      expect(await fileFact(root, 'link.txt', budget)).toBeUndefined();
    }
  });
});
