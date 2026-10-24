// Linux-only integration (real Git project, real files, symlinks, many files): the documents reader: symlinks, links, hidden and unaddressable entries.
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { deriveUnclassifiedDocumentId } from '../src/specs/documents/document-ids';
import { readSpecificationDocument } from '../src/specs/documents/document-reader';
import { readRegisteredDocumentSummaries } from '../src/specs/documents/summaries';
import { readSpecificationDocumentTree } from '../src/specs/documents/tree-reader';
import { nodeVerifiedFs, type VerifiedFs } from '../src/specs/documents/verified-file';
import {
  documentsProject,
  errorCode,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
  trackRoot,
} from './support/documents-fixture';

afterEach(removeTrackedRoots);

const project = documentsProject;
const handBuilt = handBuiltSpecification;
const code = errorCode;

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

describe('registered files replaced by redirections', () => {
  it('reports a registered file swapped for a symlink only as skipped, not dangling', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'secret.md'), '# SECRET\n');
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n' },
    });
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.dangling).toEqual([]);
    expect(tree.issues).toContainEqual({ code: 'skipped-entry', path: 'note.md' });
    expect(tree.issues.some((issue) => issue.code === 'dangling')).toBe(false);
  }, 240000);

  it('reports a registered file below an ancestor replaced by a symlink only as skipped', async () => {
    const fixture = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    trackRoot(outside);
    await writeFile(join(outside, 'a.md'), '# A\n');
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'inner', path: 'sub/a.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n' },
    });
    await symlink(outside, join(hand.dir, 'sub'));
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.dangling).toEqual([]);
    expect(tree.issues).toContainEqual({ code: 'skipped-entry', path: 'sub/a.md' });
    expect(tree.issues.some((issue) => issue.code === 'dangling')).toBe(false);
  }, 240000);
});

describe('files that cannot be read safely', () => {
  const errno = (code: string): Error => Object.assign(new Error(code), { code });

  async function twoRegistered() {
    const fixture = await project();
    const hand = await handBuilt(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'bad', path: 'bad.md', type: 'note' },
      ],
      files: { 'overview.md': '# Fine\n', 'bad.md': '# Bad\n' },
    });
    return { fixture, hand };
  }

  it('leaves an unreadable registered file out of the summaries and keeps the others', async () => {
    const { fixture, hand } = await twoRegistered();
    // EACCES while inspecting the entry: the layer reports it as an unavailable source.
    const fs: VerifiedFs = {
      ...nodeVerifiedFs,
      lstat: (path) =>
        path.endsWith('/bad.md') ? Promise.reject(errno('EACCES')) : nodeVerifiedFs.lstat(path),
    };
    const rows = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, { fs });
    expect(rows.map((row) => row.id)).toEqual(['overview']);
  }, 240000);

  it('skips a file whose analysis fails with a document error (the open race)', async () => {
    const { fixture, hand } = await twoRegistered();
    // ELOOP at open: the entry became a symlink after the check; the layer reports a document error.
    const fs: VerifiedFs = {
      ...nodeVerifiedFs,
      open: (path, flags) =>
        path.endsWith('/bad.md')
          ? Promise.reject(errno('ELOOP'))
          : nodeVerifiedFs.open(path, flags),
    };
    const rows = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, { fs });
    expect(rows.map((row) => row.id)).toEqual(['overview']);
    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs });
    expect(tree.issues).toContainEqual({ code: 'skipped-entry', path: 'bad.md' });
  }, 240000);
});
