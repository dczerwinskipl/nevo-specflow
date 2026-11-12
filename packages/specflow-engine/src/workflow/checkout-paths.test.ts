import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkoutPathExists } from './checkout-paths';

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'checkout-paths-')));
  await mkdir(join(root, 'packages', 'ui', 'src'), { recursive: true });
  await writeFile(join(root, 'packages', 'ui', 'src', 'app.ts'), '');
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'dep', 'index.js'), '');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('checkoutPathExists', () => {
  it.each([
    ['a file', 'packages/ui/src/app.ts', true],
    ['a folder', 'packages/ui', true],
    ['a missing path', 'packages/api', false],
    ['a glob matching a file', 'packages/**/*.ts', true],
    ['a glob matching only folders', 'packages/*', true],
    ['a glob matching nothing', 'packages/**/*.css', false],
    ['a glob matching only inside node_modules', '**/index.js', false],
  ])('%s', async (_name, path, expected) => {
    expect(await checkoutPathExists(root, path)).toBe(expected);
  });

  it('refuses a glob that needs too many entries to decide', async () => {
    await expect(checkoutPathExists(root, '**/*.css', 2)).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message: expect.stringContaining('too broad') as unknown,
    });
  });
});
