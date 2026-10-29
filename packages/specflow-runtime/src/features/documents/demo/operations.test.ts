import { describe, expect, it } from 'vitest';
import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';
import { createDemoEnvironment } from '../../../demo';
import { createDemoSpecsRepositories } from '../../specs/demo/repositories';
import { createDemoDocumentReadSource } from './read-source';

const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;

function setup(options: { showcase?: boolean; latency?: number } = {}) {
  let id = 0;
  const env = createDemoEnvironment({
    id: () => String(++id),
    ...(options.showcase ? { showcase: true } : {}),
    ...(options.latency ? { documentCommitLatencyMs: options.latency } : {}),
  });
  const { catalogue } = createDemoSpecsRepositories(env);
  const find = (specId: string) => catalogue.find(specId);
  const source = createDemoDocumentReadSource(env.documents, catalogue);

  return { env, find, source, tree: (specId: string) => source.readTree!(specId) };
}

/** The code and reason of the DocumentError a promise rejects with. */
async function code(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof DocumentError) {
      return [error.code, error.details?.reason];
    }

    throw error;
  }

  return ['resolved'];
}

/** The FOLDER revision a folder operation sends (`DocumentTree.folders[].revision`). */
const folderRevision = (tree: DocumentTree, path: string) => {
  const found = tree.folders.find((folder) => folder.path === path)?.revision;
  if (!found) {
    throw new Error('No folder revision for ' + path);
  }

  return found;
};

const node = (tree: DocumentTree, path: string) => {
  const found = tree.documents.find((document) => document.path === path);
  if (!found) {
    throw new Error('No document ' + path);
  }

  return found;
};

describe('seeded document directories', () => {
  it('give every seeded Specification a protected, registered overview', async () => {
    const { tree } = setup();
    expect(node(await tree('localization'), 'overview.md')).toMatchObject({
      id: 'overview',
      classification: 'registered',
      type: 'overview',
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
      revision: 'demo-document-1',
      protected: true,
      editable: true,
      satisfiesRequirement: true,
      actions: {
        rename: { available: false, reason: 'protected' },
        delete: { available: false, reason: 'protected' },
        classify: { available: false },
      },
    });
  });

  it('show an image, a binary file, a dangling entry and complete requirements (review)', async () => {
    const { tree } = setup();
    const review = await tree('review');
    expect(node(review, 'evidence/screen.png')).toMatchObject({
      classification: 'unclassified',
      kind: 'image',
      mediaType: 'image/png',
      editable: false,
      actions: { classify: { available: true }, rename: { available: true } },
    });
    expect(node(review, 'evidence/screen.png').id).toMatch(/^u-[0-9a-f]{32}$/u);
    expect(node(review, 'evidence/report.pdf')).toMatchObject({
      kind: 'binary',
      mediaType: 'application/octet-stream',
    });
    expect(review.dangling).toEqual([
      { id: 'ux', path: 'ux.md', type: 'ux', actions: { delete: { available: true } } },
    ]);
    expect(review.archetype).toEqual({ id: 'feature', version: 1, title: 'Feature' });
    expect(review.completeness.complete).toBe(true);
    expect(review.issues.map((issue) => issue.code)).toEqual([
      'dangling',
      'unclassified',
      'unclassified',
    ]);
    expect(review.capabilities).toMatchObject({
      createFile: { available: true },
      classify: { available: true },
      formats: ['md', 'txt'],
    });
  });

  it('show an unmet requirement of the demo-only owner archetype (security)', async () => {
    const { tree } = setup();
    const security = await tree('security');
    expect(security.archetype).toMatchObject({ id: 'cross-module', version: 1 });
    expect(security.completeness).toEqual({
      complete: false,
      requirements: [
        { documentType: 'overview', minCount: 1, count: 1, satisfied: true },
        { documentType: 'decisions', minCount: 1, count: 0, satisfied: false },
      ],
    });
    expect(security.issues).toContainEqual({
      code: 'requirement-unmet',
      documentType: 'decisions',
    });
    expect(node(security, 'notes/open-questions.md').classification).toBe('unclassified');
  });

  it('report the branch policy and the archive as the reason of every write', async () => {
    const { tree } = setup();
    const packaging = await tree('packaging');
    expect(packaging.capabilities.createFile).toEqual({
      available: false,
      reason: 'branch-protected',
    });
    expect(node(packaging, 'note.md').actions.delete).toEqual({
      available: false,
      reason: 'branch-protected',
    });
    const archived = await tree('archived-shell');
    expect(node(archived, 'ux.md')).toMatchObject({
      editable: false,
      actions: { rename: { available: false, reason: 'archived' } },
    });
    expect(archived.folders[0]!.actions.delete).toEqual({ available: false, reason: 'archived' });
  });

  it('read a text file that is not editable (json) and omit the content of an image', async () => {
    const { source, tree } = setup();
    const json = node(await tree('providers'), 'traces/replay.json');
    expect(json).toMatchObject({ kind: 'text', editable: false });
    const content = await source.read('providers', json.id);
    expect(content).toMatchObject({ title: 'replay', editable: false, path: 'traces/replay.json' });
    expect(content.content).toContain('"replay"');
    const png = node(await tree('review'), 'evidence/screen.png');
    const image = await source.read('review', png.id);
    expect(image).toMatchObject({ kind: 'image', title: 'screen', size: png.size });
    expect('content' in image).toBe(false);
    expect(await code(source.read('review', 'ux'))).toEqual(['DOCUMENT_FILE_MISSING', undefined]);
    expect(await code(source.read('review', 'nope'))).toEqual(['DOCUMENT_NOT_FOUND', undefined]);
    expect(await code(source.read('review', 'overview', 'old'))).toEqual([
      'DOCUMENT_REVISION_UNAVAILABLE',
      undefined,
    ]);
  });

  it('keep the showcase nested tree with an empty folder and an unclassified file', async () => {
    const { tree } = setup({ showcase: true });
    const admission = await tree('admission');
    expect(admission.folders.map((folder) => folder.path)).toEqual([
      '',
      'architektura',
      'architektura/decyzje',
      'badania',
      'notatki',
    ]);
    expect(node(admission, 'badania/ocena-ryzyka.md').classification).toBe('unclassified');
    expect(node(admission, 'architektura/kontekst-systemu.md')).toMatchObject({
      id: 'architecture',
      type: 'architecture',
    });
  });
});

describe('demo document writes (D4 shapes)', () => {
  it('saves with operationId, replays the same body and refuses a reused id or a stale revision', async () => {
    const { env, find, source } = setup();
    const before = await source.read('localization', 'overview');
    const input = { operationId: op(1), content: '# Saved', expectedRevision: before.revision };
    const saved = await env.documents.save('alice', 'localization', 'overview', input, find);
    // The new SaveResult: the written document and the commit (the demo commits at once).
    expect(saved).toMatchObject({
      operationId: op(1),
      document: { id: 'overview', type: 'overview' },
      commit: { state: 'committed' },
    });
    expect(saved.commit.sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(saved.document.revision).not.toBe(before.revision);
    expect(await env.documents.save('alice', 'localization', 'overview', input, find)).toEqual(
      saved,
    );
    expect(
      await code(
        env.documents.save('alice', 'localization', 'overview', { ...input, content: 'x' }, find),
      ),
    ).toEqual(['DOCUMENT_OPERATION_CONFLICT', undefined]);
    expect(
      await code(
        env.documents.save(
          'alice',
          'localization',
          'overview',
          { operationId: op(2), content: 'stale', expectedRevision: before.revision },
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_REVISION_CONFLICT', undefined]);
    expect((await source.read('localization', 'overview')).content).toBe('# Saved');
  });

  it('refuses writes on a protected branch, in the archive and to files that cannot be edited', async () => {
    const { env, find, tree } = setup();
    const save = (specId: string, documentId: string, revision: string, n: number) =>
      env.documents.save(
        'alice',
        specId,
        documentId,
        { operationId: op(n), content: 'x', expectedRevision: revision },
        find,
      );
    expect(await code(save('packaging', 'overview', 'demo-document-1', 1))).toEqual([
      'BRANCH_PROTECTED',
      'branch-protected',
    ]);
    expect(await code(save('archived-shell', 'ux', 'any', 2))).toEqual([
      'SPEC_ARCHIVED',
      'archived',
    ]);
    const json = node(await tree('providers'), 'traces/replay.json');
    expect(await code(save('providers', json.id, json.revision, 3))).toEqual([
      'DOCUMENT_NOT_EDITABLE',
      'not-editable',
    ]);
    expect(await code(save('review', 'ux', 'any', 4))).toEqual([
      'DOCUMENT_FILE_MISSING',
      'dangling',
    ]);
  });

  it('classifies an unclassified file: the derived id changes to an allocated registered id', async () => {
    const { env, find, tree } = setup();
    const file = node(await tree('security'), 'notes/open-questions.md');
    const classify = {
      action: 'classify' as const,
      kind: 'document' as const,
      type: 'decisions',
      expectedRevision: file.revision,
    };
    const result = await env.documents.operate(
      'alice',
      'security',
      { ...classify, operationId: op(1), documentId: file.id },
      find,
    );
    expect(result.documents).toEqual([
      {
        id: 'decisions',
        path: 'notes/open-questions.md',
        revision: file.revision,
        type: 'decisions',
      },
    ]);
    const after = await tree('security');
    expect(after.completeness.complete).toBe(true);
    expect(node(after, 'notes/open-questions.md')).toMatchObject({
      id: 'decisions',
      classification: 'registered',
      satisfiesRequirement: true,
    });
    expect(result.revision).toBe(after.revision);
    expect(
      await code(
        env.documents.operate(
          'alice',
          'security',
          { ...classify, operationId: op(2), documentId: 'decisions' },
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_ALREADY_CLASSIFIED', undefined]);
  });

  it('renames an unclassified file (new u- id), keeps a registered id and protects the overview', async () => {
    const { env, find, tree } = setup();
    const review = await tree('review');
    const png = node(review, 'evidence/screen.png');
    const renamed = await env.documents.operate(
      'alice',
      'review',
      {
        operationId: op(1),
        action: 'rename',
        kind: 'document',
        documentId: png.id,
        name: 'shot.png',
        expectedRevision: png.revision,
      },
      find,
    );
    expect(renamed.documents[0]!.path).toBe('evidence/shot.png');
    expect(renamed.documents[0]!.id).toMatch(/^u-/u);
    expect(renamed.documents[0]!.id).not.toBe(png.id);
    const behaviour = node(review, 'behaviour.md');
    const moved = await env.documents.operate(
      'alice',
      'review',
      {
        operationId: op(2),
        action: 'move',
        kind: 'document',
        documentId: behaviour.id,
        targetFolder: 'evidence',
        expectedRevision: behaviour.revision,
      },
      find,
    );
    expect(moved.documents[0]).toMatchObject({ id: 'behaviour', path: 'evidence/behaviour.md' });
    expect(
      await code(
        env.documents.operate(
          'alice',
          'review',
          {
            operationId: op(3),
            action: 'delete',
            kind: 'document',
            documentId: 'overview',
            expectedRevision: 'demo-document-1',
          },
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_PROTECTED', 'protected']);
  });

  it('removes a dangling registration and refuses other actions on it', async () => {
    const { env, find, tree } = setup();
    const review = await tree('review');
    const base = { kind: 'document' as const, documentId: 'ux', expectedRevision: review.revision };
    const rename = { ...base, operationId: op(1), action: 'rename' as const, name: 'x.md' };
    expect(await code(env.documents.operate('alice', 'review', rename, find))).toEqual([
      'DOCUMENT_FILE_MISSING',
      'dangling',
    ]);
    const removed = await env.documents.operate(
      'alice',
      'review',
      { ...base, operationId: op(2), action: 'delete' },
      find,
    );
    expect(removed.removedDocumentIds).toEqual(['ux']);
    expect((await tree('review')).dangling).toEqual([]);
  });

  it('refuses creating, renaming or moving a file onto the path of a dangling registration', async () => {
    const { env, find, tree } = setup();
    // `ux.md` is registered but missing: creating it again (any letter case) is a conflict.
    for (const [index, path] of ['ux.md', 'UX.md'].entries()) {
      expect(
        await code(
          env.documents.create(
            'alice',
            'review',
            { operationId: op(10 + index), documents: [{ path, content: '' }] },
            find,
          ),
        ),
      ).toEqual(['DOCUMENT_PATH_CONFLICT', undefined]);
    }

    // Renaming an unclassified file onto it, or a registered one, is refused the same way.
    await env.documents.create(
      'alice',
      'review',
      { operationId: op(15), documents: [{ path: 'scratch.md', content: '' }] },
      find,
    );
    const current = await tree('review');
    const scratch = node(current, 'scratch.md');
    const behaviour = node(current, 'behaviour.md');
    for (const [index, document] of [scratch, behaviour].entries()) {
      expect(
        await code(
          env.documents.operate(
            'alice',
            'review',
            {
              operationId: op(20 + index),
              action: 'rename',
              kind: 'document',
              documentId: document.id,
              name: document === scratch ? 'Ux.md' : 'ux.md',
              expectedRevision: document.revision,
            },
            find,
          ),
        ),
      ).toEqual(['DOCUMENT_PATH_CONFLICT', undefined]);
    }

    // Moving a file named like the dangling entry into its folder is refused too.
    await env.documents.create(
      'alice',
      'review',
      { operationId: op(30), documents: [{ path: 'drafts/ux.md', content: '' }] },
      find,
    );
    const moving = node(await tree('review'), 'drafts/ux.md');
    expect(
      await code(
        env.documents.operate(
          'alice',
          'review',
          {
            operationId: op(31),
            action: 'move',
            kind: 'document',
            documentId: moving.id,
            targetFolder: '',
            expectedRevision: moving.revision,
          },
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_PATH_CONFLICT', undefined]);
    expect((await tree('review')).dangling.map((entry) => entry.path)).toEqual(['ux.md']);
  });

  it('deleting a folder also removes the registrations of its missing files', async () => {
    const { env, find, tree } = setup();
    // A registration under `evidence` whose file is gone (dangling).
    const directory = await env.documents.directory('review', find);
    directory!.registry.push({ id: 'gone', path: 'evidence/gone.md', type: 'note' });
    expect((await tree('review')).dangling.map((entry) => entry.id)).toContain('gone');
    const result = await env.documents.operate(
      'alice',
      'review',
      {
        operationId: op(40),
        action: 'delete',
        kind: 'folder',
        path: 'evidence',
        expectedRevision: folderRevision(await tree('review'), 'evidence'),
      },
      find,
    );
    expect(result.removedDocumentIds).toContain('gone');
    const after = await tree('review');
    expect(after.dangling.map((entry) => entry.id)).not.toContain('gone');
    // The path is free again.
    expect(
      await code(
        env.documents.create(
          'alice',
          'review',
          { operationId: op(41), documents: [{ path: 'evidence/gone.md', content: '' }] },
          find,
        ),
      ),
    ).toEqual(['resolved']);
  });

  it('creates documents from a template and from content, with folders, and refuses conflicts', async () => {
    const { env, find, source, tree } = setup();
    const created = await env.documents.create(
      'alice',
      'localization',
      {
        operationId: op(1),
        documents: [
          { path: 'decisions.md', templateId: 'decisions' },
          { path: 'notes/idea.md', content: '# Idea' },
        ],
        folders: ['empty'],
      },
      find,
    );
    expect(created.documents.map((item) => [item.id.slice(0, 2), item.path, item.type])).toEqual([
      ['de', 'decisions.md', 'decisions'],
      ['u-', 'notes/idea.md', undefined],
    ]);
    expect(created.documents[0]!.id).toBe('decisions');
    expect(created.folders).toEqual(['empty', 'notes']);
    expect((await source.read('localization', 'decisions')).content).toContain(
      '# Localization and account preferences - Decisions',
    );
    expect((await tree('localization')).folders.map((folder) => folder.path)).toContain('empty');
    const add = (n: number, path: string) =>
      env.documents.create(
        'alice',
        'localization',
        { operationId: op(n), documents: [{ path, content: '' }] },
        find,
      );
    expect(await code(add(2, 'NOTES/IDEA.md'))).toEqual(['DOCUMENT_PATH_CONFLICT', undefined]);
    expect(await code(add(3, '../escape.md'))).toEqual(['DOCUMENT_PATH_INVALID', undefined]);
    expect(
      await code(
        env.documents.createFolder(
          'alice',
          'localization',
          { operationId: op(4), path: 'empty' },
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_PATH_CONFLICT', undefined]);
    expect(env.documents.pathsFor('localization', (await find('localization'))!)).toEqual([
      'decisions.md',
      'notes/idea.md',
      'overview.md',
    ]);
  });

  it('renames and deletes a folder subtree atomically and refuses a move into itself', async () => {
    const { env, find, tree } = setup({ showcase: true });
    const before = await tree('admission');
    const unclassified = node(before, 'badania/ocena-ryzyka.md');
    const renamed = await env.documents.operate(
      'alice',
      'admission',
      {
        operationId: op(1),
        action: 'rename',
        kind: 'folder',
        path: 'badania',
        name: 'research',
        expectedRevision: folderRevision(before, 'badania'),
      },
      find,
    );
    expect(renamed.documents.map((document) => document.path).sort()).toEqual([
      'research/ocena-ryzyka.md',
      'research/porownanie-dostawcow.md',
    ]);
    expect(renamed.documents.find((document) => document.type === 'research')!.id).toBe('research');
    expect(renamed.documents.find((document) => !document.type)!.id).not.toBe(unclassified.id);
    const current = await tree('admission');
    const folderOperation = (n: number, action: 'move' | 'delete', path: string) => ({
      operationId: op(n),
      action,
      kind: 'folder' as const,
      path,
      ...(action === 'move' ? { targetFolder: 'architektura/decyzje' } : {}),
      expectedRevision: folderRevision(current, path),
    });
    expect(
      await code(
        env.documents.operate(
          'alice',
          'admission',
          folderOperation(2, 'move', 'architektura'),
          find,
        ),
      ),
    ).toEqual(['DOCUMENT_PATH_INVALID', undefined]);
    const deleted = await env.documents.operate(
      'alice',
      'admission',
      folderOperation(3, 'delete', 'architektura'),
      find,
    );
    expect(deleted.removedDocumentIds.sort()).toEqual(['architecture', 'decisions']);
    // Another folder's revision did not change with that delete: `notatki` still goes.
    expect(
      await code(
        env.documents.operate('alice', 'admission', folderOperation(4, 'delete', 'notatki'), find),
      ),
    ).toEqual(['resolved']);
  });

  it('checks the FOLDER revision of a folder operation, not the tree revision (as the Engine)', async () => {
    const { env, find, tree } = setup({ showcase: true });
    const before = await tree('admission');
    const stale = folderRevision(before, 'badania');
    const rename = (n: number, expectedRevision: string) =>
      env.documents.operate(
        'alice',
        'admission',
        {
          operationId: op(n),
          action: 'rename',
          kind: 'folder',
          path: 'badania',
          name: 'research',
          expectedRevision,
        },
        find,
      );
    // The tree revision is not a folder revision.
    expect(await code(rename(1, before.revision))).toEqual([
      'DOCUMENT_REVISION_CONFLICT',
      undefined,
    ]);
    // A file under the folder changes: the folder revision read before is stale.
    const file = node(before, 'badania/ocena-ryzyka.md');
    await env.documents.save(
      'alice',
      'admission',
      file.id,
      { operationId: op(2), content: '# Changed', expectedRevision: file.revision },
      find,
    );
    const after = await tree('admission');
    expect(folderRevision(after, 'badania')).not.toBe(stale);
    expect(await code(rename(3, stale))).toEqual(['DOCUMENT_REVISION_CONFLICT', undefined]);
    // A change outside the folder leaves its revision as it was.
    expect(folderRevision(after, 'architektura')).toBe(folderRevision(before, 'architektura'));
    expect(await code(rename(4, folderRevision(after, 'badania')))).toEqual(['resolved']);
  });

  it('reports busy and refuses other writes while a write commits with latency', async () => {
    const { env, find, tree } = setup({ latency: 20 });
    const save = (n: number, content: string) =>
      env.documents.save(
        'alice',
        'localization',
        'overview',
        { operationId: op(n), content, expectedRevision: 'demo-document-1' },
        find,
      );
    const first = save(1, '# One');
    // Let the first write reach its commit (it awaits the directory before marking it busy).
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await tree('localization')).capabilities.createFile).toEqual({
      available: false,
      reason: 'busy',
    });
    expect(await code(save(2, '# Two'))).toEqual(['SPEC_BUSY', 'busy']);
    await first;
    expect((await tree('localization')).capabilities.createFile).toEqual({ available: true });
  });
});
