import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MANIFEST_MAX_BYTES } from './documents/limits';
import { readManifestTextBounded } from './bounded-read';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function read(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bounded-read-'));
  dirs.push(dir);
  const path = join(dir, 'm.yaml');
  await writeFile(path, content);
  const handle = await open(path, 'r');
  try {
    return await readManifestTextBounded(handle);
  } finally {
    await handle.close();
  }
}

describe('readManifestTextBounded', () => {
  it('reads a small file whole', async () => {
    expect(await read('a: 1\n')).toBe('a: 1\n');
  });

  it('reads a file of exactly the limit whole', async () => {
    expect(Buffer.byteLength(await read('x'.repeat(MANIFEST_MAX_BYTES)))).toBe(MANIFEST_MAX_BYTES);
  });

  it('never reads more than the limit plus one byte', async () => {
    const text = await read('x'.repeat(MANIFEST_MAX_BYTES * 4));
    expect(Buffer.byteLength(text)).toBe(MANIFEST_MAX_BYTES + 1);
  });
});
