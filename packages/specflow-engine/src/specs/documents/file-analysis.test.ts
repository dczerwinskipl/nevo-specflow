import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeOpenFile, decodeText, statSignatureRevision } from './file-analysis';
import { CONTENT_HASH_MAX_BYTES, CONTENT_SNIFF_BYTES } from './limits';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function analyse(name: string, content: Uint8Array | string) {
  const dir = await mkdtemp(join(tmpdir(), 'file-analysis-'));
  dirs.push(dir);
  const file = join(dir, 'f');
  await writeFile(file, content);
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat({ bigint: true });

    return { analysis: await analyzeOpenFile(handle, stat, name), stat };
  } finally {
    await handle.close();
  }
}

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

describe('analyzeOpenFile', () => {
  it('hashes a small markdown file and reports it as text', async () => {
    const { analysis } = await analyse('doc.md', '# Title\n');
    expect(analysis).toMatchObject({
      size: 8,
      revision: sha256('# Title\n'),
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
    });
    expect(decodeText(analysis.bytes!)).toBe('# Title\n');
  });

  it('serves html and xml as text/plain, never as html', async () => {
    for (const name of ['page.html', 'data.xml']) {
      const { analysis } = await analyse(name, '<script>alert(1)</script>');
      expect(analysis.kind).toBe('text');
      expect(analysis.mediaType).toBe('text/plain; charset=utf-8');
    }
  });

  it('treats a markdown file with a NUL byte as binary', async () => {
    const { analysis } = await analyse('doc.md', Buffer.from([0x23, 0x20, 0x61, 0x00, 0x62]));
    expect(analysis).toMatchObject({ kind: 'binary', mediaType: 'application/octet-stream' });
  });

  it('treats invalid UTF-8 as binary, also beyond the sniff window of a small file', async () => {
    const head = Buffer.from('a'.repeat(CONTENT_SNIFF_BYTES + 10));
    const { analysis } = await analyse('doc.md', Buffer.concat([head, Buffer.from([0xff, 0xfe])]));
    expect(analysis.kind).toBe('binary');
    const early = await analyse('doc.txt', Buffer.from([0xc3, 0x28]));
    expect(early.analysis.kind).toBe('binary');
  });

  it('keeps a byte order mark in the decoded text', async () => {
    const { analysis } = await analyse('doc.md', Buffer.from([0xef, 0xbb, 0xbf, 0x61]));
    expect(analysis.kind).toBe('text');
    expect(decodeText(analysis.bytes!).charCodeAt(0)).toBe(0xfeff);
  });

  it.each([
    ['pic.png', 'image/png'],
    ['pic.JPG', 'image/jpeg'],
    ['pic.svg', 'image/svg+xml'],
    ['pic.webp', 'image/webp'],
  ])('reports %s as an image without inspecting it', async (name, mediaType) => {
    const { analysis } = await analyse(name, Buffer.from([0, 1, 2, 3]));
    expect(analysis).toMatchObject({ kind: 'image', mediaType });
  });

  it('reports an unknown extension and a zip as binary', async () => {
    expect((await analyse('a.zip', 'PK')).analysis.kind).toBe('binary');
    expect((await analyse('noext', 'text')).analysis.kind).toBe('binary');
  });

  it('hashes exactly up to the limit and uses the stat signature above it', async () => {
    const atLimit = Buffer.alloc(CONTENT_HASH_MAX_BYTES, 0x61);
    const exact = await analyse('big.md', atLimit);
    expect(exact.analysis.revision).toBe(sha256(atLimit));
    expect(exact.analysis.bytes).toBeDefined();

    const above = Buffer.alloc(CONTENT_HASH_MAX_BYTES + 1, 0x61);
    const large = await analyse('big.md', above);
    expect(large.analysis.revision).toBe(statSignatureRevision(large.stat));
    expect(large.analysis.revision).toMatch(/^stat:1048577-\d+$/u);
    expect(large.analysis.size).toBe(CONTENT_HASH_MAX_BYTES + 1);
    expect(large.analysis.bytes).toBeUndefined();
    expect(large.analysis.kind).toBe('text');
  });

  it('decides the kind of a large text file from its first bytes only', async () => {
    const nulFirst = Buffer.alloc(CONTENT_HASH_MAX_BYTES + 1, 0x61);
    nulFirst[10] = 0;
    expect((await analyse('big.md', nulFirst)).analysis.kind).toBe('binary');
  });

  it('is deterministic for the same bytes and changes with any byte', async () => {
    const one = await analyse('a.md', 'same');
    const two = await analyse('b.md', 'same');
    const other = await analyse('a.md', 'sane');
    expect(two.analysis.revision).toBe(one.analysis.revision);
    expect(other.analysis.revision).not.toBe(one.analysis.revision);
  });
});
