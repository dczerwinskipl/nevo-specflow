import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { countArchiveInventory, listSpecificationFiles } from './directory-scan';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function spec(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'directory-scan-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, ...path.split('/'));
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

describe('listSpecificationFiles', () => {
  it('lists regular files in code-unit order and leaves hidden entries out', async () => {
    const dir = await spec({
      'specification.yaml': 'x',
      'overview.md': 'x',
      'B.md': 'x',
      'a/z.md': 'x',
      'a/.hidden.md': 'x',
      '.git/config': 'x',
      '.secret/inner.md': 'x',
    });
    const listed = await listSpecificationFiles(dir);
    expect(listed.paths).toEqual(['B.md', 'a/z.md', 'overview.md', 'specification.yaml']);
    expect(listed.truncated).toBe(false);
    expect(listed.unaddressable).toEqual([]);
  });

  it('descends eight folder levels and reports the ninth as truncation', async () => {
    const eight = Array.from({ length: 8 }, (_, index) => 'd' + index).join('/');
    const dir = await spec({ [eight + '/deep.md']: 'x', 'top.md': 'x' });
    expect((await listSpecificationFiles(dir)).truncated).toBe(false);
    expect((await listSpecificationFiles(dir)).paths).toContain(eight + '/deep.md');

    const nine = await spec({ [eight + '/d8/too-deep.md']: 'x', 'top.md': 'x' });
    const listed = await listSpecificationFiles(nine);
    expect(listed.truncated).toBe(true);
    expect(listed.paths).not.toContain(eight + '/d8/too-deep.md');
  });
});

describe('countArchiveInventory', () => {
  it('counts hidden files and the manifest like Close archive and reports no limit for a small tree', async () => {
    const dir = await spec({
      'specification.yaml': 'x',
      'overview.md': 'x',
      '.hidden': 'x',
      'a/.also/inner.md': 'x',
    });
    const count = await countArchiveInventory(dir);
    expect(count).toMatchObject({ files: 4, bounded: false, skippedCount: 0, exceeded: false });
  });
});
