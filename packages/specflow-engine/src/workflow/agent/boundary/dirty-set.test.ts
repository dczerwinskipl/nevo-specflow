import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { sha256Hex } from '../../../hash';
import { AGENT_DIRTY_FILE_BYTES_MAX, AGENT_DIRTY_PATHS_MAX } from '../journal/model';
import { dirtySetOf } from './dirty-set';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

it('names each reported path once, sorted, with its content hash or null when gone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'specflow-dirty-set-'));
  roots.push(root);
  await writeFile(join(root, 'b.ts'), 'export {};\n');

  expect(await dirtySetOf(root, ['b.ts', 'a.md', 'b.ts', ''])).toEqual({
    paths: [
      { path: 'a.md', sha256: null },
      { path: 'b.ts', sha256: sha256Hex('export {};\n') },
    ],
    truncated: false,
  });
});

it('names a file above the byte cap without hashing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'specflow-dirty-set-'));
  roots.push(root);
  // Sparse: no data is written, only the size is set.
  await writeFile(join(root, 'big.bin'), '');
  await truncate(join(root, 'big.bin'), AGENT_DIRTY_FILE_BYTES_MAX + 1);

  expect((await dirtySetOf(root, ['big.bin'])).paths).toEqual([
    { path: 'big.bin', sha256: null, oversize: true },
  ]);
});

it('cuts a set beyond its bounds and says so', async () => {
  const many = Array.from({ length: AGENT_DIRTY_PATHS_MAX + 1 }, (_, index) => `f${index}`);

  const facts = await dirtySetOf(tmpdir(), many);
  expect(facts.paths).toHaveLength(AGENT_DIRTY_PATHS_MAX);
  expect(facts.truncated).toBe(true);
  expect((await dirtySetOf(tmpdir(), ['x'.repeat(2000)])).truncated).toBe(true);
});
