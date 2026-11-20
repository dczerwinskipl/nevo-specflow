import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { sha256Hex } from '../../../hash';
import { AGENT_DIRTY_PATHS_MAX } from '../journal/model';
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

it('cuts a set beyond its bounds and says so', async () => {
  const many = Array.from({ length: AGENT_DIRTY_PATHS_MAX + 1 }, (_, index) => `f${index}`);

  const facts = await dirtySetOf(tmpdir(), many);
  expect(facts.paths).toHaveLength(AGENT_DIRTY_PATHS_MAX);
  expect(facts.truncated).toBe(true);
  expect((await dirtySetOf(tmpdir(), ['x'.repeat(2000)])).truncated).toBe(true);
});
