// Linux-only integration (real files, symlinks, FIFOs, races, large sparse files): raw document access.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import { deriveUnclassifiedDocumentId } from '../../src/specs/document-rules/document-ids';
import { openSpecificationDocument } from '../../src/specs/documents/open';
import { nodeVerifiedFs, type VerifiedFs } from '../../src/specs/document-rules/verified-file';
import {
  createdFeature,
  documentsProject,
  errorCode,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
  trackRoot,
} from '../support/documents-fixture';

afterEach(removeTrackedRoots);

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Resolves when the stream has closed, which is after the file handle it owned is released. */
async function closed(stream: Readable): Promise<void> {
  if (stream.closed) return;
  // A destroyed stream may emit its abort or read error before it closes; that is not under test here.
  await new Promise<void>((resolve) => {
    stream.on('error', () => undefined);
    stream.once('close', () => resolve());
  });
}

async function destroyed(stream: Readable): Promise<void> {
  stream.destroy();
  await closed(stream);
}

async function outsideDirectory(): Promise<string> {
  const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
  trackRoot(outside);
  await writeFile(join(outside, 'secret.md'), '# SECRET\n');
  return outside;
}

/** Descriptors this process has open (Linux): proves a stream released its file. */
async function openDescriptors(): Promise<number> {
  return (await readdir('/proc/self/fd')).length;
}

/** The same count, but undefined off Linux (no /proc): callers assert only when it is defined. */
async function countOpenFds(): Promise<number | undefined> {
  return onLinux ? openDescriptors() : undefined;
}

describe('openSpecificationDocument', () => {
  it('streams a registered document with its metadata', async () => {
    const fixture = await documentsProject();
    const created = await createdFeature(fixture);
    const opened = await openSpecificationDocument(fixture.engine, created.specId, 'overview');
    const bytes = await drain(opened.stream);
    expect(opened.metadata).toMatchObject({
      specId: created.specId,
      id: 'overview',
      path: 'overview.md',
      filename: 'overview.md',
      classification: 'registered',
      type: 'overview',
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
      size: bytes.length,
      revision: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(bytes.toString('utf8')).toContain('Readable feature');
  }, 240000);

  it('opens an unclassified file by its derived id, with the basename of a nested path', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture, {
      files: { 'overview.md': '# o\n', 'assets/pic.png': Buffer.from([1, 2, 3, 4]) },
    });
    const opened = await openSpecificationDocument(
      fixture.engine,
      hand.specId,
      deriveUnclassifiedDocumentId('assets/pic.png'),
    );
    expect(opened.metadata).toMatchObject({
      classification: 'unclassified',
      path: 'assets/pic.png',
      filename: 'pic.png',
      kind: 'image',
      mediaType: 'image/png',
      size: 4,
    });
    expect(await drain(opened.stream)).toEqual(Buffer.from([1, 2, 3, 4]));
  }, 240000);

  it('streams a file above the hash limit exactly and reports a stat-signature revision', async () => {
    const fixture = await documentsProject();
    const big = Buffer.alloc(3 * 1024 * 1024 + 17);
    for (let index = 0; index < big.length; index += 1) big[index] = index % 251;
    const hand = await handBuiltSpecification(fixture, {
      files: { 'overview.md': '# o\n', 'big.bin': big },
    });
    const opened = await openSpecificationDocument(
      fixture.engine,
      hand.specId,
      deriveUnclassifiedDocumentId('big.bin'),
    );
    expect(opened.metadata.kind).toBe('binary');
    expect(opened.metadata.mediaType).toBe('application/octet-stream');
    expect(opened.metadata.size).toBe(big.length);
    expect(opened.metadata.revision).toMatch(/^stat:3145745-\d+$/u);
    expect((await drain(opened.stream)).equals(big)).toBe(true);
  }, 240000);

  it('never serves a text file as html: html and xml are plain text, svg is an image', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture, {
      files: {
        'overview.md': '# o\n',
        'page.html': '<script>alert(1)</script>',
        'data.xml': '<a/>',
        'vector.svg': '<svg onload="alert(1)"/>',
      },
    });
    const media: Record<string, string> = {};
    for (const path of ['page.html', 'data.xml', 'vector.svg']) {
      const opened = await openSpecificationDocument(
        fixture.engine,
        hand.specId,
        deriveUnclassifiedDocumentId(path),
      );
      media[path] = opened.metadata.mediaType;
      opened.stream.destroy();
    }
    expect(media).toEqual({
      'page.html': 'text/plain; charset=utf-8',
      'data.xml': 'text/plain; charset=utf-8',
      'vector.svg': 'image/svg+xml',
    });
  }, 240000);

  it('reports a dangling entry as DOCUMENT_FILE_MISSING and unknown ids as DOCUMENT_NOT_FOUND', async () => {
    const fixture = await documentsProject();
    const created = await createdFeature(fixture);
    await unlink(join(created.dir, 'ux.md'));
    expect(
      errorCode(await failure(openSpecificationDocument(fixture.engine, created.specId, 'ux'))),
    ).toBe('DOCUMENT_FILE_MISSING');
    expect(
      errorCode(await failure(openSpecificationDocument(fixture.engine, created.specId, 'zzz'))),
    ).toBe('DOCUMENT_NOT_FOUND');
  }, 240000);

  it('refuses a file above the 25 MiB raw limit and accepts exactly 25 MiB', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture);
    const exact = join(hand.dir, 'exact.bin');
    const over = join(hand.dir, 'over.bin');
    await writeFile(exact, '');
    await writeFile(over, '');
    await truncate(exact, 25 * 1024 * 1024);
    await truncate(over, 25 * 1024 * 1024 + 1);
    const before = await countOpenFds();
    const opened = await openSpecificationDocument(
      fixture.engine,
      hand.specId,
      deriveUnclassifiedDocumentId('exact.bin'),
    );
    expect(opened.metadata.size).toBe(25 * 1024 * 1024);
    await destroyed(opened.stream);
    expect(
      errorCode(
        await failure(
          openSpecificationDocument(
            fixture.engine,
            hand.specId,
            deriveUnclassifiedDocumentId('over.bin'),
          ),
        ),
      ),
    ).toBe('DOCUMENT_TOO_LARGE');
    const after = await countOpenFds();
    if (before !== undefined && after !== undefined) expect(after).toBeLessThanOrEqual(before);
  }, 240000);

  it.skipIf(!onLinux)(
    'releases the file when the consumer aborts and when the file ends',
    async () => {
      const fixture = await documentsProject();
      const hand = await handBuiltSpecification(fixture, {
        files: { 'overview.md': '# o\n', 'big.bin': Buffer.alloc(4 * 1024 * 1024, 7) },
      });
      const id = deriveUnclassifiedDocumentId('big.bin');
      const before = await openDescriptors();
      const aborted = await openSpecificationDocument(fixture.engine, hand.specId, id);
      expect(await openDescriptors()).toBeGreaterThan(before);
      for await (const chunk of aborted.stream) {
        expect((chunk as Buffer).length).toBeGreaterThan(0);
        break; // abandon the stream after the first chunk
      }
      await destroyed(aborted.stream);
      expect(await openDescriptors()).toBe(before);

      const finished = await openSpecificationDocument(fixture.engine, hand.specId, id);
      await drain(finished.stream);
      await closed(finished.stream);
      expect(await openDescriptors()).toBe(before);
    },
    240000,
  );

  it.skipIf(!onLinux)(
    'fails the stream, never pads it, when the file shrinks while being sent',
    async () => {
      const fixture = await documentsProject();
      const hand = await handBuiltSpecification(fixture, {
        files: { 'overview.md': '# o\n', 'big.bin': Buffer.alloc(3 * 1024 * 1024, 7) },
      });
      const opened = await openSpecificationDocument(
        fixture.engine,
        hand.specId,
        deriveUnclassifiedDocumentId('big.bin'),
      );
      await truncate(join(hand.dir, 'big.bin'), 10);
      await expect(drain(opened.stream)).rejects.toThrow(/shorter/u);
      await closed(opened.stream);
    },
    240000,
  );
});

describe.skipIf(!onLinux)('symlinks and races (POSIX O_NOFOLLOW)', () => {
  it('never opens a symlinked entry, registered or not', async () => {
    const fixture = await documentsProject();
    const outside = await outsideDirectory();
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n' },
    });
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'free.md'));
    expect(
      errorCode(await failure(openSpecificationDocument(fixture.engine, hand.specId, 'note'))),
    ).toBe('DOCUMENT_FILE_MISSING');
    expect(
      errorCode(
        await failure(
          openSpecificationDocument(
            fixture.engine,
            hand.specId,
            deriveUnclassifiedDocumentId('free.md'),
          ),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
  }, 240000);

  /**
   * An fs whose `open` of `target` first (or, with `afterOpen`, right afterwards) runs `swap` once:
   * the race window between the check and the open. Other files (the manifest) open normally.
   */
  function racing(target: string, swap: () => Promise<void>, afterOpen = false): VerifiedFs {
    let swapped = false;
    return {
      ...nodeVerifiedFs,
      open: async (path, flags) => {
        const hit = !swapped && path.endsWith(target);
        if (hit && !afterOpen) {
          swapped = true;
          await swap();
        }
        const handle = await nodeVerifiedFs.open(path, flags);
        if (hit && afterOpen) {
          swapped = true;
          await swap();
        }
        return handle;
      },
    };
  }

  it('detects a file replaced by a symlink between the check and the open', async () => {
    const fixture = await documentsProject();
    const outside = await outsideDirectory();
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'note.md': '# note\n' },
    });
    const before = await openDescriptors();
    const fs = racing('note.md', async () => {
      await unlink(join(hand.dir, 'note.md'));
      await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
    });
    const error = await failure(
      openSpecificationDocument(fixture.engine, hand.specId, 'note', { fs }),
    );
    expect(errorCode(error)).toBe('SPEC_SOURCE_UNAVAILABLE');
    expect(String((error as Error).message)).not.toContain('SECRET');
    expect(await openDescriptors()).toBeLessThanOrEqual(before);
  }, 240000);

  it('detects a file replaced by another regular file (other inode) between the check and the open', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'note.md': '# note\n' },
    });
    const fs = racing('note.md', async () => {
      await writeFile(join(hand.dir, 'other.md'), '# swapped\n');
      await rename(join(hand.dir, 'other.md'), join(hand.dir, 'note.md'));
    });
    expect(
      errorCode(
        await failure(openSpecificationDocument(fixture.engine, hand.specId, 'note', { fs })),
      ),
    ).toBe('SPEC_SOURCE_UNAVAILABLE');
  }, 240000);

  it('detects a symlink swapped in right after the open (post-open lstat)', async () => {
    const fixture = await documentsProject();
    const outside = await outsideDirectory();
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'note.md': '# note\n' },
    });
    const before = await openDescriptors();
    const fs = racing(
      'note.md',
      async () => {
        await unlink(join(hand.dir, 'note.md'));
        await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
      },
      true,
    );
    expect(
      errorCode(
        await failure(openSpecificationDocument(fixture.engine, hand.specId, 'note', { fs })),
      ),
    ).toBe('SPEC_SOURCE_UNAVAILABLE');
    expect(await openDescriptors()).toBeLessThanOrEqual(before);
  }, 240000);

  it('detects a folder swapped for a symlink to another directory around the open', async () => {
    const fixture = await documentsProject();
    const outside = await outsideDirectory();
    await writeFile(join(outside, 'doc.md'), '# SECRET\n');
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'doc', path: 'sub/doc.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'sub/doc.md': '# inside\n' },
    });
    const fs = racing(
      'doc.md',
      async () => {
        await rename(join(hand.dir, 'sub'), join(hand.dir, 'sub-moved'));
        await symlink(outside, join(hand.dir, 'sub'));
      },
      true,
    );
    const error = await failure(
      openSpecificationDocument(fixture.engine, hand.specId, 'doc', { fs }),
    );
    expect(errorCode(error)).toBe('SPEC_SOURCE_UNAVAILABLE');
  }, 240000);

  it('does not block on, or serve, a FIFO swapped in between the check and the open', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'note.md': '# note\n' },
    });
    const fs = racing('note.md', async () => {
      await unlink(join(hand.dir, 'note.md'));
      execFileSync('mkfifo', [join(hand.dir, 'note.md')]);
    });
    expect(
      errorCode(
        await failure(openSpecificationDocument(fixture.engine, hand.specId, 'note', { fs })),
      ),
    ).toBe('SPEC_SOURCE_UNAVAILABLE');
  }, 240000);

  it('treats a FIFO or a socket-like special entry as skipped, never as a file', async () => {
    const fixture = await documentsProject();
    const hand = await handBuiltSpecification(fixture);
    execFileSync('mkfifo', [join(hand.dir, 'pipe')]);
    expect(
      errorCode(
        await failure(
          openSpecificationDocument(
            fixture.engine,
            hand.specId,
            deriveUnclassifiedDocumentId('pipe'),
          ),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
  }, 240000);

  it('reads a file with a hard link elsewhere (hard links are plain files)', async () => {
    const fixture = await documentsProject();
    const outside = await outsideDirectory();
    const hand = await handBuiltSpecification(fixture);
    await mkdir(join(hand.dir, 'sub'));
    await link(join(hand.dir, 'overview.md'), join(outside, 'overview-link.md'));
    const opened = await openSpecificationDocument(fixture.engine, hand.specId, 'overview');
    expect((await drain(opened.stream)).toString()).toBe('# Hand\n');
  }, 240000);
});
