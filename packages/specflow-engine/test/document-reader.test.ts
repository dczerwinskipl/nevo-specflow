// Linux-only integration (real Git project, real files, symlinks, many files): the documents reader.
import { randomUUID } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import {
  link,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { withProjectControlLock } from '../src/testing';
import { deriveUnclassifiedDocumentId } from '../src/specs/documents/document-ids';
import {
  readRegisteredDocumentSummaries,
  readSpecificationDocument,
  readSpecificationDocumentTree,
  type ObservationMemoValue,
} from '../src/specs/documents/read';
import type { SummaryMemoValue } from '../src/specs/documents/read';
import { RevisionMemo } from '../src/specs/documents/revision-memo';
import { nodeVerifiedFs, type VerifiedFs } from '../src/specs/documents/verified-file';
import { git } from './support/git-project';
import {
  createdFeature,
  documentsProject,
  errorCode,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
  trackRoot,
} from './support/documents-fixture';

afterEach(removeTrackedRoots);

const NOT_IMPLEMENTED = { available: false, reason: 'not-implemented' };
const project = documentsProject;
const handBuilt = handBuiltSpecification;
const code = errorCode;

describe('readSpecificationDocumentTree', () => {
  it('shows the four registered documents of a created feature Specification, complete and stable', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    const tree = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(tree.documents.map((document) => document.id).sort()).toEqual([
      'backend',
      'behaviour',
      'overview',
      'ux',
    ]);
    expect(tree.documents.every((document) => document.classification === 'registered')).toBe(true);
    expect(tree.documents.every((document) => document.kind === 'text')).toBe(true);
    expect(tree.completeness).toEqual({
      complete: true,
      requirements: [{ documentType: 'overview', minCount: 1, count: 1, satisfied: true }],
    });
    expect(tree.archetype).toEqual({ id: 'feature', version: 1, title: 'Feature' });
    expect(tree.dangling).toEqual([]);
    expect(tree.issues).toEqual([]);
    expect(tree.truncated).toBe(false);
    expect(tree.skippedEntries).toBe(0);
    const overview = tree.documents.find((document) => document.id === 'overview')!;
    expect(overview).toMatchObject({
      path: 'overview.md',
      protected: true,
      editable: true,
      satisfiesRequirement: true,
      type: 'overview',
    });
    expect(overview.actions.delete).toEqual({ available: false, reason: 'protected' });
    expect(overview.revision).toMatch(/^[0-9a-f]{64}$/u);
    expect(tree.capabilities.createFile).toEqual(NOT_IMPLEMENTED);

    expect(await readSpecificationDocumentTree(fixture.engine, created.specId)).toEqual(tree);
  }, 240000);

  it('changes the tree revision when a file or the manifest changes', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    const first = await readSpecificationDocumentTree(fixture.engine, created.specId);
    await writeFile(join(created.dir, 'ux.md'), '# edited\n');
    const second = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(second.revision).not.toBe(first.revision);
    await writeFile(join(created.dir, 'notes.md'), 'new');
    const third = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(third.revision).not.toBe(second.revision);
    const manifest = join(created.dir, 'specification.yaml');
    await writeFile(manifest, (await readFile(manifest, 'utf8')) + '# touched\n');
    const fourth = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(fourth.revision).not.toBe(third.revision);
  }, 240000);

  it('lists a hand-added file as unclassified with a derived id and lets it be read', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    await mkdir(join(created.dir, 'notes'));
    await writeFile(join(created.dir, 'notes', 'Idea.md'), '# Hand idea\n\nbody\n');
    const tree = await readSpecificationDocumentTree(fixture.engine, created.specId);
    const hand = tree.documents.find((document) => document.path === 'notes/Idea.md')!;
    expect(hand).toMatchObject({
      classification: 'unclassified',
      id: deriveUnclassifiedDocumentId('notes/Idea.md'),
      kind: 'text',
      protected: false,
      satisfiesRequirement: false,
    });
    expect(hand.type).toBeUndefined();
    expect(hand.actions.classify).toEqual(NOT_IMPLEMENTED);
    expect(tree.issues).toContainEqual({ code: 'unclassified', path: 'notes/Idea.md' });
    expect(tree.folders.map((folder) => folder.path)).toContain('notes');

    const content = await readSpecificationDocument(fixture.engine, created.specId, hand.id);
    expect(content).toMatchObject({
      id: hand.id,
      path: 'notes/Idea.md',
      title: 'Hand idea',
      classification: 'unclassified',
      kind: 'text',
      content: '# Hand idea\n\nbody\n',
      editable: true,
      revision: hand.revision,
    });
  }, 240000);

  it('reports a hand-deleted registered file as dangling and its read as DOCUMENT_FILE_MISSING', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    await unlink(join(created.dir, 'behaviour.md'));
    const tree = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(tree.documents.map((document) => document.id)).not.toContain('behaviour');
    expect(tree.dangling).toEqual([
      {
        id: 'behaviour',
        path: 'behaviour.md',
        type: 'behaviour',
        actions: { delete: NOT_IMPLEMENTED },
      },
    ]);
    expect(tree.issues).toContainEqual({
      code: 'dangling',
      path: 'behaviour.md',
      documentType: 'behaviour',
    });
    const error = await failure(
      readSpecificationDocument(fixture.engine, created.specId, 'behaviour'),
    );
    expect(code(error)).toBe('DOCUMENT_FILE_MISSING');
  }, 240000);

  it('reports an unknown Specification and an unknown document as DOCUMENT_NOT_FOUND', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    expect(code(await failure(readSpecificationDocumentTree(fixture.engine, randomUUID())))).toBe(
      'DOCUMENT_NOT_FOUND',
    );
    // An id that is not even shaped like a Specification id is just as unknown.
    expect(code(await failure(readSpecificationDocumentTree(fixture.engine, 'not-a-uuid')))).toBe(
      'DOCUMENT_NOT_FOUND',
    );
    expect(
      code(await failure(readSpecificationDocument(fixture.engine, created.specId, 'nope'))),
    ).toBe('DOCUMENT_NOT_FOUND');
    expect(
      code(
        await failure(
          readSpecificationDocument(
            fixture.engine,
            created.specId,
            'u-0123456789abcdef0123456789abcdef',
          ),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
    // A derived id of a REGISTERED path never answers: the registered id is the only name.
    expect(
      code(
        await failure(
          readSpecificationDocument(
            fixture.engine,
            created.specId,
            deriveUnclassifiedDocumentId('overview.md'),
          ),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
  }, 240000);

  it('derives titles: first H1, else the file stem', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: {
        'overview.md': '---\nid: x\n# yaml comment\n---\n\n# Real title\n',
        'note.md': 'no heading here\n',
      },
    });
    expect((await readSpecificationDocument(fixture.engine, hand.specId, 'overview')).title).toBe(
      'Real title',
    );
    expect((await readSpecificationDocument(fixture.engine, hand.specId, 'note')).title).toBe(
      'note',
    );
  }, 240000);

  it('lists documents of the workspace summary: registered with an existing file only', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    await unlink(join(created.dir, 'ux.md'));
    await writeFile(join(created.dir, 'stray.md'), '# stray');
    const summaries = await readRegisteredDocumentSummaries(fixture.engine, created.specId);
    expect(summaries.map((item) => [item.id, item.type, item.path])).toEqual([
      ['overview', 'overview', 'overview.md'],
      ['behaviour', 'behaviour', 'behaviour.md'],
      ['backend', 'backend', 'backend.md'],
    ]);
    expect(summaries[0]!.title).toBe('Readable feature');
  }, 240000);
});

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

describe('paths, links and hidden entries', () => {
  it('skips symlinks (files and folders), reports them and never reads through them', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'secret.md'), '# SECRET\n');
    await mkdir(join(outside, 'folder'));
    await writeFile(join(outside, 'folder', 'inner.md'), '# INNER SECRET\n');
    const hand = await handBuilt(fixture);
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'link.md'));
    await symlink(join(outside, 'folder'), join(hand.dir, 'linked-folder'));
    await symlink('overview.md', join(hand.dir, 'inner-link.md'));

    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.documents.map((document) => document.path)).toEqual(['overview.md']);
    expect(tree.skippedEntries).toBe(3);
    expect(tree.issues.filter((issue) => issue.code === 'skipped-entry')).toEqual([
      { code: 'skipped-entry', path: 'inner-link.md' },
      { code: 'skipped-entry', path: 'link.md' },
      { code: 'skipped-entry', path: 'linked-folder' },
    ]);
    expect(JSON.stringify(tree)).not.toContain('SECRET');
    // The derived id of a symlink path resolves to nothing: it is not a listed file.
    for (const path of ['link.md', 'linked-folder/inner.md', 'inner-link.md']) {
      expect(
        code(
          await failure(
            readSpecificationDocument(
              fixture.engine,
              hand.specId,
              deriveUnclassifiedDocumentId(path),
            ),
          ),
        ),
      ).toBe('DOCUMENT_NOT_FOUND');
    }
  }, 240000);

  it('reports a registered file replaced by a symlink as dangling and never reads it', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'secret.md'), '# SECRET\n');
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'note.md': '# n\n' },
    });
    await unlink(join(hand.dir, 'note.md'));
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.dangling.map((entry) => entry.id)).toEqual(['note']);
    expect(tree.skippedEntries).toBe(1);
    expect(JSON.stringify(tree)).not.toContain('SECRET');
    expect(
      code(await failure(readSpecificationDocument(fixture.engine, hand.specId, 'note'))),
    ).toBe('DOCUMENT_FILE_MISSING');
  }, 240000);

  it('refuses a registered path below a symlinked folder as leaving the Specification directory', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'inner.md'), '# SECRET\n');
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'inner', path: 'linked/inner.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n' },
    });
    await symlink(outside, join(hand.dir, 'linked'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.dangling.map((entry) => entry.id)).toEqual(['inner']);
    expect(JSON.stringify(tree)).not.toContain('SECRET');
    expect(
      code(await failure(readSpecificationDocument(fixture.engine, hand.specId, 'inner'))),
    ).toBe('SPEC_SOURCE_UNAVAILABLE');
  }, 240000);

  it('reads a file with several hard links like any other file', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    await link(join(hand.dir, 'overview.md'), join(hand.dir, 'alias.md'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.documents.map((document) => document.path)).toEqual(['alias.md', 'overview.md']);
    const alias = tree.documents.find((document) => document.path === 'alias.md')!;
    expect((await readSpecificationDocument(fixture.engine, hand.specId, alias.id)).content).toBe(
      '# Hand\n',
    );
  }, 240000);

  it('reads a file hard-linked INTO the directory from outside (the boundary is the entry, not the inode)', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'shared.md'), '# Shared\n');
    const hand = await handBuilt(fixture);
    await link(join(outside, 'shared.md'), join(hand.dir, 'linked-in.md'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const entry = tree.documents.find((document) => document.path === 'linked-in.md')!;
    expect(entry.classification).toBe('unclassified');
    expect((await readSpecificationDocument(fixture.engine, hand.specId, entry.id)).content).toBe(
      '# Shared\n',
    );
  }, 240000);

  it('reports names with bidi overrides, zero-width and separator characters as skipped entries', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    const bidi = 'doc' + String.fromCodePoint(0x202e) + 'fdp.md';
    const zeroWidth = 'a' + String.fromCodePoint(0x200b) + 'b.md';
    const separator = 'c' + String.fromCodePoint(0x2028) + 'd.md';
    for (const name of [bidi, zeroWidth, separator]) await writeFile(join(hand.dir, name), 'x');
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.documents.map((document) => document.path)).toEqual(['overview.md']);
    expect(tree.issues.filter((issue) => issue.code === 'skipped-entry')).toHaveLength(3);
    expect(tree.skippedEntries).toBe(3);
  }, 240000);

  it('leaves hidden entries and the manifest out of the tree', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      files: { 'overview.md': '# o\n', '.hidden.md': 'x', '.dir/inner.md': 'x', 'a/.b.md': 'x' },
    });
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.documents.map((document) => document.path)).toEqual(['overview.md']);
    expect(tree.folders.map((folder) => folder.path)).toEqual(['']);
    expect(tree.issues).toEqual([]);
  }, 240000);

  it('reports names that cannot be addressed as skipped entries', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    await writeFile(join(hand.dir, 'back\\slash.md'), 'x');
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.documents.map((document) => document.path)).toEqual(['overview.md']);
    expect(tree.issues).toContainEqual({ code: 'skipped-entry', path: 'back\\slash.md' });
    expect(tree.skippedEntries).toBe(1);
  }, 240000);

  it('lists A.md and a.md with different ids and reports the case collision on a case-sensitive filesystem', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    await writeFile(join(hand.dir, 'A.md'), '# upper');
    await writeFile(join(hand.dir, 'a.md'), '# lower');
    if ((await readdir(hand.dir)).filter((name) => name.toLowerCase() === 'a.md').length !== 2) {
      return; // case-insensitive filesystem: nothing to prove here
    }
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const upper = tree.documents.find((document) => document.path === 'A.md')!;
    const lower = tree.documents.find((document) => document.path === 'a.md')!;
    expect(upper.id).not.toBe(lower.id);
    expect(tree.issues.filter((issue) => issue.code === 'path-case-collision')).toEqual([
      { code: 'path-case-collision', path: 'A.md' },
      { code: 'path-case-collision', path: 'a.md' },
    ]);
    expect((await readSpecificationDocument(fixture.engine, hand.specId, upper.id)).content).toBe(
      '# upper',
    );
    expect((await readSpecificationDocument(fixture.engine, hand.specId, lower.id)).content).toBe(
      '# lower',
    );
  }, 240000);

  it('lists a Windows reserved name as an ordinary unclassified file on Linux', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    await writeFile(join(hand.dir, 'con.txt'), 'device-like');
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const reserved = tree.documents.find((document) => document.path === 'con.txt')!;
    expect(reserved.classification).toBe('unclassified');
    expect(
      (await readSpecificationDocument(fixture.engine, hand.specId, reserved.id)).content,
    ).toBe('device-like');
  }, 240000);

  it('fails closed when the Specification directory itself is a symlink', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    const real = hand.dir + '-real';
    await rename(hand.dir, real);
    await symlink(real, hand.dir);
    await expect(readSpecificationDocumentTree(fixture.engine, hand.specId)).rejects.toMatchObject({
      code: 'SPEC_SOURCE_INVALID',
    });
  }, 240000);
});

describe('limits', () => {
  async function many(dir: string, count: number, hidden = 0): Promise<void> {
    await mkdir(join(dir, 'bulk'), { recursive: true });
    const names = [
      ...Array.from(
        { length: count - hidden },
        (_, index) => `bulk/f${String(index).padStart(5, '0')}.md`,
      ),
      ...Array.from({ length: hidden }, (_, index) => `bulk/.h${String(index).padStart(5, '0')}`),
    ];
    for (let start = 0; start < names.length; start += 200) {
      await Promise.all(
        names.slice(start, start + 200).map((name) => writeFile(join(dir, name), 'x')),
      );
    }
  }

  it('truncates the listing at 2000 files but still reports the registered files beyond the cap', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'last', path: 'zzz/last.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n', 'zzz/last.md': '# last\n' },
    });
    await many(hand.dir, 2100);
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.truncated).toBe(true);
    const listed = tree.documents.length;
    // 2000 listed files plus the two registered ones that sort beyond the cap.
    expect(listed).toBe(2002);
    expect(tree.documents.map((document) => document.id)).toContain('last');
    expect(tree.dangling).toEqual([]);
  }, 240000);

  it('reports archive-limit above 4096 files (hidden entries counted) and not at 4096', async () => {
    const fixture = await project();
    // specification.yaml and overview.md are two of the files.
    const at = await handBuilt(fixture, { slug: 'exact' });
    await many(at.dir, 4096 - 2, 10);
    const exact = await readSpecificationDocumentTree(fixture.engine, at.specId);
    expect(exact.issues.some((issue) => issue.code === 'archive-limit')).toBe(false);
    expect(exact.truncated).toBe(true);

    await writeFile(join(at.dir, 'bulk', '.one-more'), 'x');
    const over = await readSpecificationDocumentTree(fixture.engine, at.specId);
    expect(over.issues).toContainEqual({ code: 'archive-limit' });
    expect(over.truncated).toBe(true);
  }, 240000);

  it('reports archive-limit for a file above 32 MiB and names it', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    const handle = await open(join(hand.dir, 'huge.bin'), 'w');
    await handle.truncate(32 * 1024 * 1024 + 1);
    await handle.close();
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.issues).toContainEqual({ code: 'archive-limit', path: 'huge.bin' });
    const huge = tree.documents.find((document) => document.path === 'huge.bin')!;
    expect(huge.revision).toMatch(/^stat:33554433-\d+$/u);
    expect(huge.kind).toBe('binary');
  }, 240000);

  it('reports archive-limit when the traversal reaches its own entry bound', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture);
    // 20000 directories: far fewer than 4097 files, but more entries than the traversal bound.
    await mkdir(join(hand.dir, 'dirs'));
    const names = Array.from({ length: 20001 }, (_, index) => 'd' + index);
    for (let start = 0; start < names.length; start += 500) {
      await Promise.all(
        names.slice(start, start + 500).map((name) => mkdir(join(hand.dir, 'dirs', name))),
      );
    }
    const started = performance.now();
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.issues).toContainEqual({ code: 'archive-limit' });
    // The listing shares the entries budget: it stops (truncated) instead of walking every folder.
    expect(tree.truncated).toBe(true);
    expect(performance.now() - started).toBeLessThan(5000);
    // So does the derived-id lookup: the unknown id is answered without walking everything.
    expect(
      code(
        await failure(
          readSpecificationDocument(
            fixture.engine,
            hand.specId,
            deriveUnclassifiedDocumentId('nope.md'),
          ),
        ),
      ),
    ).toBe('DOCUMENT_NOT_FOUND');
  }, 240000);

  it('derives titles from huge heading lines in linear time (read path and summaries)', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: {
        'overview.md': '#' + ' '.repeat(200_000) + 'x\n',
        'note.md': '# ' + 'a'.repeat(1024 * 1024 - 8) + '\n',
      },
    });
    for (const work of [
      () => readSpecificationDocument(fixture.engine, hand.specId, 'overview'),
      () => readSpecificationDocument(fixture.engine, hand.specId, 'note'),
      () => readRegisteredDocumentSummaries(fixture.engine, hand.specId),
    ]) {
      const started = performance.now();
      await work();
      expect(performance.now() - started).toBeLessThan(500);
    }
    const note = await readSpecificationDocument(fixture.engine, hand.specId, 'note');
    expect(note.title).toHaveLength(200);
  }, 240000);
});

describe('archived Specifications', () => {
  it('are readable, with every action archived and nothing editable', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { location: 'archive' });
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    const archived = { available: false, reason: 'archived' };
    expect(tree.documents).toHaveLength(1);
    const overview = tree.documents[0]!;
    expect(overview.editable).toBe(false);
    expect(overview.actions).toEqual({
      rename: archived,
      move: archived,
      delete: archived,
      classify: archived,
    });
    expect(tree.capabilities.createFile).toEqual(archived);
    expect(tree.capabilities.classify).toEqual(archived);
    expect(tree.folders[0]!.actions.delete).toEqual(archived);
    const read = await readSpecificationDocument(fixture.engine, hand.specId, 'overview');
    expect(read).toMatchObject({ content: '# Hand\n', editable: false });
  }, 240000);
});

describe('advisory policy reasons', () => {
  it('reports branch-protected, branch-not-allowed and git-policy-invalid without a Git process', async () => {
    const protectedProject = await project(
      'runtime: {}\ngit:\n  enabled: true\n  commits:\n    protectedBranches: [main, master]\n',
    );
    const branch = git(protectedProject.root, 'branch', '--show-current');
    const hand = await handBuilt(protectedProject);
    git(protectedProject.root, 'checkout', '-q', '-b', 'feature/free');
    const free = await readSpecificationDocumentTree(protectedProject.engine, hand.specId);
    expect(free.capabilities.createFile).toEqual(NOT_IMPLEMENTED);
    git(protectedProject.root, 'checkout', '-q', branch);
    git(protectedProject.root, 'checkout', '-q', '-B', 'main');

    const spawns: string[][] = [];
    const listener = (message: unknown): void => {
      spawns.push([...(message as { args: readonly string[] }).args]);
    };
    subscribe('nevo.specflow.engine.git-process', listener);
    let tree;
    try {
      tree = await readSpecificationDocumentTree(protectedProject.engine, hand.specId);
    } finally {
      unsubscribe('nevo.specflow.engine.git-process', listener);
    }
    expect(spawns).toEqual([]);
    expect(tree.capabilities.createFile).toEqual({ available: false, reason: 'branch-protected' });
    const overview = tree.documents[0]!;
    expect(overview.actions.delete).toEqual({ available: false, reason: 'protected' });

    const allowList = await project(
      'runtime: {}\ngit:\n  enabled: true\n  commits:\n    protectedBranches: []\n    allowedBranches: ["release/*"]\n',
    );
    const allowed = await handBuilt(allowList);
    const notAllowed = await readSpecificationDocumentTree(allowList.engine, allowed.specId);
    expect(notAllowed.capabilities.createFile).toEqual({
      available: false,
      reason: 'branch-not-allowed',
    });

    const invalid = await project('runtime: {}\ngit:\n  enabled: "yes"\n');
    const bad = await handBuilt(invalid);
    const invalidTree = await readSpecificationDocumentTree(invalid.engine, bad.specId);
    expect(invalidTree.capabilities.createFile).toEqual({
      available: false,
      reason: 'git-policy-invalid',
    });
  }, 240000);
});

describe('what a read does not do', () => {
  it('takes no control lock, starts no Git process and writes nothing', async () => {
    const fixture = await project('runtime: {}\ngit:\n  enabled: true\n');
    const created = await createdFeature(fixture);
    const listing = async (): Promise<string[]> =>
      (await readdir(join(fixture.root, 'specs'), { recursive: true })).sort();
    const before = await listing();
    const status = git(fixture.root, 'status', '--porcelain', '--untracked-files=all');

    const spawns: string[][] = [];
    const listener = (message: unknown): void => {
      spawns.push([...(message as { args: readonly string[] }).args]);
    };
    // The lock is HELD while the reads run: a read that tried to take it would fail or hang.
    await withProjectControlLock(fixture.engine.context, async () => {
      subscribe('nevo.specflow.engine.git-process', listener);
      try {
        await readSpecificationDocumentTree(fixture.engine, created.specId);
        await readSpecificationDocument(fixture.engine, created.specId, 'overview');
        await readRegisteredDocumentSummaries(fixture.engine, created.specId);
      } finally {
        unsubscribe('nevo.specflow.engine.git-process', listener);
      }
    });
    expect(spawns).toEqual([]);
    expect(await listing()).toEqual(before);
    expect(git(fixture.root, 'status', '--porcelain', '--untracked-files=all')).toBe(status);
  }, 240000);
});

describe('revision memo', () => {
  function counting(): { fs: VerifiedFs; opens: string[] } {
    const opens: string[] = [];
    return {
      opens,
      fs: {
        ...nodeVerifiedFs,
        open: (path, flags) => {
          opens.push(path);
          return nodeVerifiedFs.open(path, flags);
        },
      },
    };
  }

  it('answers the workspace documents section from a memo for unchanged old files', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { files: { 'overview.md': '# o\n', 'old.md': 'old' } });
    const old = new Date(Date.now() - 60_000);
    await utimes(join(hand.dir, 'old.md'), old, old);
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const summaryMemo = new RevisionMemo<SummaryMemoValue>(100);
    const { fs, opens } = counting();
    const first = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
    });
    opens.length = 0;
    const second = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
    });
    expect(opens.map((path) => path.split('/').pop())).toEqual(['specification.yaml']);
    expect(second).toEqual(first);

    // A changed file is a new key and is read again.
    await writeFile(join(hand.dir, 'overview.md'), '# changed title\n');
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const third = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
    });
    expect(third.find((item) => item.id === 'overview')?.title).toBe('changed title');
  }, 240000);

  it('does not reopen an unchanged old file, and does not memoise a file written just now', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { files: { 'overview.md': '# o\n', 'old.md': 'old' } });
    const old = new Date(Date.now() - 60_000);
    await utimes(join(hand.dir, 'old.md'), old, old);
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const memo = new RevisionMemo<ObservationMemoValue>(100);
    const { fs, opens } = counting();
    const first = await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo });
    const opensFirst = opens.length;
    expect(opensFirst).toBeGreaterThanOrEqual(3); // manifest + two documents
    opens.length = 0;
    const second = await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo });
    // Only the manifest is opened again.
    expect(opens.map((path) => path.split('/').pop())).toEqual(['specification.yaml']);
    expect(second).toEqual(first);

    // A file changed within the memo key is a new key: its size changed, so it is re-analysed.
    await writeFile(join(hand.dir, 'old.md'), 'longer content');
    await utimes(join(hand.dir, 'old.md'), old, old);
    opens.length = 0;
    const third = await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo });
    expect(opens.some((path) => path.endsWith('old.md'))).toBe(true);
    expect(third.revision).not.toBe(second.revision);

    // Written just now: never memoised, so every read opens it.
    await writeFile(join(hand.dir, 'fresh.md'), 'fresh');
    await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo });
    opens.length = 0;
    await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo });
    expect(opens.some((path) => path.endsWith('fresh.md'))).toBe(true);
  }, 240000);
});
