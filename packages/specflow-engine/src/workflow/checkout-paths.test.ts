import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkoutPathExists } from './checkout-paths';

let root: string;
let outside: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'checkout-paths-')));
  await mkdir(join(root, 'packages', 'ui', 'src'), { recursive: true });
  await writeFile(join(root, 'packages', 'ui', 'src', 'app.ts'), '');
  outside = await realpath(await mkdtemp(join(tmpdir(), 'checkout-outside-')));
  await writeFile(join(outside, 'secret.ts'), '');
  // A root entry whose name starts with two dots is inside the root, not its parent.
  await writeFile(join(root, '..env'), '');
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(join(root, 'packages', 'ui'), join(root, 'inner'), type);
  await symlink(outside, join(root, 'escape'), type);
  await symlink(join(root, 'missing-target'), join(root, 'dangling'), type);
  await symlink(outside, join(root, 'escape-dir.ts'), type);
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'dep', 'index.js'), '');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
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
    ['a root entry named with two leading dots', '..env', true],
    ['an internal symlink', 'inner', true],
    ['a path through an internal symlink', 'inner/src/app.ts', true],
    ['an external symlink', 'escape', false],
    ['a path through an external symlink', 'escape/secret.ts', false],
    ['an external symlink named like a file', 'escape-dir.ts', false],
    ['a dangling symlink', 'dangling', false],
    ['a glob with an escaping symlinked prefix', 'escape/**/*.ts', false],
    ['a glob with an internal symlinked prefix', 'inner/**/*.ts', true],
    ['a glob matching only an escaping symlink', '*.ts', false],
    ['a glob matching an internal symlink', 'inn*', true],
    ['a glob not descending into symlinked folders', '*/secret.ts', false],
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
