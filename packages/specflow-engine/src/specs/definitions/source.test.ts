import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFilesystemDefinitionSource } from './source';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'nevo-definition-source-')));
  roots.push(base);
  await mkdir(join(base, 'real', 'definitions', 'document-type'), { recursive: true });
  await writeFile(join(base, 'real', 'definitions', 'document-type', 'a.yaml'), 'id: a\n');
  return base;
}

describe('filesystem definition source', () => {
  it('reads a tree whose home is spelled through a linked parent folder', async () => {
    const base = await fixture();
    try {
      await symlink(join(base, 'real'), join(base, 'link'), 'dir');
    } catch {
      return; // links are not creatable here (Windows without the privilege)
    }
    const source = createFilesystemDefinitionSource(join(base, 'link', 'definitions'));

    expect(await source.list('document-type', 10)).toMatchObject({ state: 'ok' });
    expect(await source.read('document-type/a.yaml', 100)).toMatchObject({ state: 'ok' });
  });

  it('refuses a tree whose root is itself a link', async () => {
    const base = await fixture();
    try {
      await symlink(join(base, 'real', 'definitions'), join(base, 'definitions'), 'dir');
    } catch {
      return;
    }
    const source = createFilesystemDefinitionSource(join(base, 'definitions'));

    expect(await source.list('document-type', 10)).toEqual({ state: 'unsafe' });
  });
});
