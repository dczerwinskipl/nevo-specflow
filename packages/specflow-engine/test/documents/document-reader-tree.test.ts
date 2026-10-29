// Linux-only integration (real Git project, real files, symlinks, many files): the documents reader: the tree, its limits and what a read does not do.
import { randomUUID } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { mkdir, open, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { withProjectControlLock } from '../../src/testing';
import { deriveUnclassifiedDocumentId } from '../../src/specs/document-rules/document-ids';
import { readSpecificationDocument } from '../../src/specs/documents/document-reader';
import { readRegisteredDocumentSummaries } from '../../src/specs/documents/summaries';
import { readSpecificationDocumentTree } from '../../src/specs/documents/tree-reader';
import { git } from '../support/git-project';
import {
  createdFeature,
  documentsProject,
  errorCode,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
} from '../support/documents-fixture';

afterEach(removeTrackedRoots);

const AVAILABLE = { available: true };
const project = documentsProject;
const handBuilt = handBuiltSpecification;
const code = errorCode;

describe('the archetype of a tree follows its definition file', () => {
  const definitionFile = (root: string) =>
    join(root, '.nevo', 'definitions', 'specification-archetype', 'feature.yaml');

  it('reports absent when the file is deleted and keeps the persisted snapshot', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    await rm(definitionFile(fixture.root));
    const tree = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(tree.archetype).toEqual({ id: 'feature', version: 1, defined: 'absent' });
    expect(tree.completeness.complete).toBe(true);
    expect(tree.documents).toHaveLength(4);
  });

  it('reports invalid when the file exists but is rejected, and defined again once repaired', async () => {
    const fixture = await project();
    const created = await createdFeature(fixture);
    const valid = await readFile(definitionFile(fixture.root), 'utf8');
    await writeFile(definitionFile(fixture.root), 'kind: specification-archetype\n: [broken');
    const invalid = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(invalid.archetype).toEqual({ id: 'feature', version: 1, defined: 'invalid' });

    await writeFile(definitionFile(fixture.root), valid);
    const repaired = await readSpecificationDocumentTree(fixture.engine, created.specId);
    expect(repaired.archetype).toMatchObject({ title: 'Feature', defined: 'defined' });
    expect(repaired.revision).not.toBe(invalid.revision);
  });
});

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
    expect(tree.archetype).toEqual({
      id: 'feature',
      version: 1,
      title: 'Feature',
      defined: 'defined',
    });
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
    expect(tree.capabilities.createFile).toEqual(AVAILABLE);

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
    expect(hand.actions.classify).toEqual(AVAILABLE);
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
        actions: { delete: AVAILABLE },
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

    const tree = await readSpecificationDocumentTree(fixture.engine, hand.specId);
    expect(tree.issues).toContainEqual({ code: 'archive-limit' });
    // The listing shares the entries budget: it stops (truncated) instead of walking every folder.
    expect(tree.truncated).toBe(true);
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
      await work();
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
      save: archived,
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
    expect(free.capabilities.createFile).toEqual(AVAILABLE);
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
