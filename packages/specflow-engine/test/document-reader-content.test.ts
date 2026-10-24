// Linux-only integration (real Git project, real files, symlinks, many files): the documents reader: content kinds, revisions and size limits.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readSpecificationDocument } from '../src/specs/documents/document-reader';
import { readSpecificationDocumentTree } from '../src/specs/documents/tree-reader';
import {
  createdFeature,
  documentsProject,
  errorCode,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
} from './support/documents-fixture';

afterEach(removeTrackedRoots);

const project = documentsProject;
const handBuilt = handBuiltSpecification;
const code = errorCode;

describe('kinds, revisions and size limits', () => {
  it('classifies png and svg as images, a zip as binary, html as plain text and markdown with NUL as binary', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      files: {
        'overview.md': '# Kinds\n',
        'pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        'vector.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        'bundle.zip': Buffer.from('PK\x03\x04'),
        'page.html': '<h1>x</h1>',
        'nul.md': Buffer.from([0x23, 0x20, 0x00, 0x61]),
      },
    });
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const byPath = Object.fromEntries(tree.documents.map((document) => [document.path, document]));
    expect(byPath['pic.png']).toMatchObject({ kind: 'image', mediaType: 'image/png' });
    expect(byPath['vector.svg']).toMatchObject({ kind: 'image', mediaType: 'image/svg+xml' });
    expect(byPath['bundle.zip']).toMatchObject({
      kind: 'binary',
      mediaType: 'application/octet-stream',
    });
    expect(byPath['page.html']).toMatchObject({
      kind: 'text',
      mediaType: 'text/plain; charset=utf-8',
    });
    expect(byPath['nul.md']).toMatchObject({ kind: 'binary', editable: false });
    expect(byPath['pic.png']!.editable).toBe(false);

    const image = await readSpecificationDocument(
      fixture.engine,
      hand.specId,
      byPath['pic.png']!.id,
    );
    expect(image.kind).toBe('image');
    expect(image.content).toBeUndefined();
    const zip = await readSpecificationDocument(
      fixture.engine,
      hand.specId,
      byPath['bundle.zip']!.id,
    );
    expect(zip.content).toBeUndefined();
    const nul = await readSpecificationDocument(fixture.engine, hand.specId, byPath['nul.md']!.id);
    expect(nul).toMatchObject({ kind: 'binary' });
    expect(nul.content).toBeUndefined();
  }, 240000);

  it('answers 1 MiB of text as JSON and refuses 1 MiB + 1 byte as DOCUMENT_TOO_LARGE', async () => {
    const fixture = await project();
    const exact = Buffer.alloc(1024 * 1024, 0x61);
    const over = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'exact', path: 'exact.md', type: 'note' },
        { id: 'over', path: 'over.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'exact.md': exact, 'over.md': over },
    });
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const byId = Object.fromEntries(tree.documents.map((document) => [document.id, document]));
    expect(byId.exact!.revision).toMatch(/^[0-9a-f]{64}$/u);
    expect(byId.over!.revision).toMatch(/^stat:1048577-\d+$/u);
    expect(byId.exact).toMatchObject({ editable: true, size: 1024 * 1024 });
    expect(byId.over).toMatchObject({ editable: false, size: 1024 * 1024 + 1, kind: 'text' });

    const read = await readSpecificationDocument(fixture.engine, hand.specId, 'exact');
    expect(read.content).toHaveLength(1024 * 1024);
    expect(
      code(await failure(readSpecificationDocument(fixture.engine, hand.specId, 'over'))),
    ).toBe('DOCUMENT_TOO_LARGE');
  }, 240000);

  it('honours ?revision: the current one reads, any other is DOCUMENT_REVISION_UNAVAILABLE', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    const current = await readSpecificationDocument(fixture.engine, created.specId, 'overview');
    expect(
      (
        await readSpecificationDocument(fixture.engine, created.specId, 'overview', {
          revision: current.revision,
        })
      ).revision,
    ).toBe(current.revision);
    expect(
      code(
        await failure(
          readSpecificationDocument(fixture.engine, created.specId, 'overview', {
            revision: 'something-else',
          }),
        ),
      ),
    ).toBe('DOCUMENT_REVISION_UNAVAILABLE');
    await writeFile(join(created.dir, 'overview.md'), '# changed\n');
    expect(
      code(
        await failure(
          readSpecificationDocument(fixture.engine, created.specId, 'overview', {
            revision: current.revision,
          }),
        ),
      ),
    ).toBe('DOCUMENT_REVISION_UNAVAILABLE');
  }, 240000);

  it('serves an image larger than the JSON limit as metadata without content', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      files: { 'overview.md': '# o\n', 'big.png': Buffer.alloc(2 * 1024 * 1024, 1) },
    });
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const image = tree.documents.find((document) => document.path === 'big.png')!;
    expect(image.revision).toMatch(/^stat:2097152-\d+$/u);
    const read = await readSpecificationDocument(fixture.engine, hand.specId, image.id);
    expect(read).toMatchObject({ kind: 'image', size: 2 * 1024 * 1024 });
    expect(read.content).toBeUndefined();
  }, 240000);
});
