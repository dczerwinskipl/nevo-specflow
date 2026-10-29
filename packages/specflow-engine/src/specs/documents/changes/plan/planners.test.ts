import { describe, expect, it } from 'vitest';

import { DocumentError } from '../../../document-rules';
import { deriveUnclassifiedDocumentId } from '../../../document-rules';
import { sha256Hex } from '../../../../hash';
import { parseSpecificationManifestText } from '../../../model';
import { DOCUMENT_BATCH_MAX_PATHS } from '../limits';
import { buildSnapshot, TEST_SLUG } from '../test-support';
import { decodePlan, encodePlan, planDocumentChange } from './index';
import type { DocumentChangeRequest, PlanningOptions, PlanningSnapshot } from './index';

const DIR = 'specs/active/' + TEST_SLUG + '/';
const BEHAVIOUR = { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' };

function snapshotWithBehaviour(extra: Parameters<typeof buildSnapshot>[0] = {}): PlanningSnapshot {
  return buildSnapshot({
    documents: [BEHAVIOUR, ...(extra.documents ?? [])],
    folders: extra.folders,
    files: [
      { path: 'overview.md', content: '# Overview\n' },
      { path: 'behaviour.md', content: '# Behaviour\n' },
      ...(extra.files ?? []),
    ],
  });
}

function refusal(
  snapshot: PlanningSnapshot,
  request: DocumentChangeRequest,
  options?: PlanningOptions,
): DocumentError {
  try {
    planDocumentChange(snapshot, request, options);
  } catch (error) {
    if (error instanceof DocumentError) {
      return error;
    }

    throw error;
  }

  throw new Error('expected a refusal');
}

function plan(
  snapshot: PlanningSnapshot,
  request: DocumentChangeRequest,
  options?: PlanningOptions,
) {
  const result = planDocumentChange(snapshot, request, options);
  // Every plan the planners produce is one the strict decoder accepts, byte for byte.
  expect(decodePlan(encodePlan(result.plan).text)).toEqual(result.plan);

  return result;
}

function revisionOf(snapshot: PlanningSnapshot, path: string): string {
  return snapshot.files.find((file) => file.path === path)!.revision;
}

/** Runs `run` as if the process ran on `platform` (the Engine decides case handling by platform). */
function onPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
}

describe('save', () => {
  it('plans one path from the on-disk state to the new content and no registry change', () => {
    const snapshot = snapshotWithBehaviour();
    const { plan: result, payloads } = plan(snapshot, {
      action: 'save',
      documentId: 'behaviour',
      content: '# Changed\n',
      expectedRevision: revisionOf(snapshot, 'behaviour.md'),
    });
    expect(result.paths).toEqual([
      {
        path: DIR + 'behaviour.md',
        role: 'document',
        pre: { sha256: sha256Hex('# Behaviour\n'), bytes: 12 },
        post: { sha256: sha256Hex('# Changed\n'), bytes: 10 },
        source: { kind: 'payload' },
      },
    ]);
    expect(result.registry).toBeUndefined();
    expect(result.documents).toEqual([
      {
        id: 'behaviour',
        path: 'behaviour.md',
        type: 'behaviour',
        sha256: sha256Hex('# Changed\n'),
        bytes: 10,
      },
    ]);
    expect(payloads).toEqual([{ sha256: sha256Hex('# Changed\n'), content: '# Changed\n' }]);
  });

  it('refuses a stale revision, a missing document, a missing file and a file that is not editable', () => {
    const snapshot = buildSnapshot({
      documents: [
        BEHAVIOUR,
        { id: 'gone', path: 'gone.md', type: 'notes' },
        { id: 'data', path: 'data.json', type: 'notes' },
      ],
      files: [
        { path: 'overview.md', content: 'o' },
        { path: 'behaviour.md', content: 'b' },
        { path: 'data.json', content: '{}' },
      ],
    });
    const save = (
      documentId: string,
      expectedRevision = 'x',
      content = 'new',
    ): DocumentChangeRequest => ({
      action: 'save',
      documentId,
      content,
      expectedRevision,
    });
    expect(refusal(snapshot, save('behaviour')).code).toBe('DOCUMENT_REVISION_CONFLICT');
    expect(refusal(snapshot, save('unknown')).code).toBe('DOCUMENT_NOT_FOUND');
    expect(refusal(snapshot, save('gone')).code).toBe('DOCUMENT_FILE_MISSING');
    expect(refusal(snapshot, save('data')).code).toBe('DOCUMENT_NOT_EDITABLE');
    expect(refusal(snapshot, save('behaviour', 'x', '\ud800')).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
  });

  it('refuses content above the save limit and any write to an archived Specification', () => {
    const snapshot = snapshotWithBehaviour();
    const revision = revisionOf(snapshot, 'behaviour.md');
    expect(
      refusal(snapshot, {
        action: 'save',
        documentId: 'behaviour',
        content: 'x'.repeat(1024 * 1024 + 1),
        expectedRevision: revision,
      }).code,
    ).toBe('DOCUMENT_TOO_LARGE');
    const archived = buildSnapshot({ location: 'archive' });
    expect(
      refusal(archived, {
        action: 'save',
        documentId: 'overview',
        content: 'x',
        expectedRevision: 'x',
      }).code,
    ).toBe('SPEC_ARCHIVED');
  });

  it('saves an unclassified file by its derived id', () => {
    const snapshot = snapshotWithBehaviour({ files: [{ path: 'notes.md', content: 'n' }] });
    const id = deriveUnclassifiedDocumentId('notes.md');
    const { plan: result } = plan(snapshot, {
      action: 'save',
      documentId: id,
      content: 'm',
      expectedRevision: revisionOf(snapshot, 'notes.md'),
    });
    expect(result.documents[0]).toMatchObject({ id, path: 'notes.md' });
    expect(result.documents[0]!.type).toBeUndefined();
  });
});

describe('batch save', () => {
  const entry = (
    snapshot: PlanningSnapshot,
    documentId: string,
    path: string,
    content = 'new',
  ) => ({
    documentId,
    content,
    expectedRevision: revisionOf(snapshot, path),
  });

  it('plans every document in request order as one operation', () => {
    const snapshot = snapshotWithBehaviour();
    const { plan: result } = plan(snapshot, {
      action: 'save-all',
      documents: [
        entry(snapshot, 'overview', 'overview.md'),
        entry(snapshot, 'behaviour', 'behaviour.md'),
      ],
    });
    expect(result.paths.map((path) => path.path)).toEqual([
      DIR + 'overview.md',
      DIR + 'behaviour.md',
    ]);
    expect(result.action).toBe('save-all');
  });

  it('reports every stale document and plans nothing', () => {
    const snapshot = snapshotWithBehaviour();
    const error = refusal(snapshot, {
      action: 'save-all',
      documents: [
        { documentId: 'overview', content: 'a', expectedRevision: 'stale' },
        entry(snapshot, 'behaviour', 'behaviour.md'),
      ],
    });
    expect(error.code).toBe('DOCUMENT_REVISION_CONFLICT');
    expect(error.details?.conflicts).toEqual([
      { documentId: 'overview', revision: revisionOf(snapshot, 'overview.md') },
    ]);
  });

  it('refuses a duplicated id, an empty or oversized batch and too much content', () => {
    const snapshot = snapshotWithBehaviour();
    const one = entry(snapshot, 'overview', 'overview.md');
    expect(refusal(snapshot, { action: 'save-all', documents: [one, one] }).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
    expect(refusal(snapshot, { action: 'save-all', documents: [] }).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
    expect(
      refusal(snapshot, { action: 'save-all', documents: Array.from({ length: 26 }, () => one) })
        .code,
    ).toBe('DOCUMENT_OPERATION_INVALID');
  });

  it('refuses more than the total content limit even when each document fits', () => {
    const ids = ['d1', 'd2', 'd3', 'd4', 'd5'];
    const snapshot = buildSnapshot({
      documents: ids.map((id) => ({ id, path: id + '.md', type: 'notes' })),
      files: [
        { path: 'overview.md', content: 'o' },
        ...ids.map((id) => ({ path: id + '.md', content: id })),
      ],
    });
    const big = 'x'.repeat(1024 * 1024);
    expect(
      refusal(snapshot, {
        action: 'save-all',
        documents: ids.map((id) => entry(snapshot, id, id + '.md', big)),
      }).code,
    ).toBe('DOCUMENT_TOO_LARGE');
  });
});

describe('create', () => {
  it('writes the files, registers the typed ones with deterministic ids and adds the folders', () => {
    const snapshot = snapshotWithBehaviour();
    const request: DocumentChangeRequest = {
      action: 'create',
      documents: [
        { path: 'design/api.md', type: 'behaviour', content: 'api' },
        { path: 'free.md', content: 'free' },
      ],
      folders: ['empty'],
    };
    const first = plan(snapshot, request);
    const second = plan(snapshot, request);
    expect(first.plan).toEqual(second.plan);
    expect(first.plan.allocatedIds).toHaveLength(1);
    expect(first.plan.allocatedIds[0]).toMatch(/^behaviour-[a-z2-7]{6,}$/u);
    expect(first.plan.paths.map((path) => [path.role, path.path])).toEqual([
      ['document', DIR + 'design/api.md'],
      ['document', DIR + 'free.md'],
      ['manifest', DIR + 'specification.yaml'],
    ]);
    const registry = first.plan.registry!;
    expect(registry.documents.map((entry) => entry.path)).toEqual([
      'overview.md',
      'behaviour.md',
      'design/api.md',
    ]);
    expect(registry.folders).toEqual(['empty']);
    // The planned manifest is exactly what the strict parser reads back.
    const manifestPayload = first.payloads.find(
      (payload) => payload.sha256 === first.plan.paths.at(-1)!.post!.sha256,
    )!;
    expect(
      parseSpecificationManifestText(manifestPayload.content, TEST_SLUG, 'active').documents,
    ).toEqual(registry.documents);
    // The unclassified file is reported too, under the id derived from its path.
    expect(first.plan.documents.map((document) => document.id)).toEqual([
      ...first.plan.allocatedIds,
      deriveUnclassifiedDocumentId('free.md'),
    ]);
  });

  it('pins the template and the rendered hash, and checks the catalogue revision', () => {
    const snapshot = snapshotWithBehaviour();
    const request: DocumentChangeRequest = {
      action: 'create',
      documents: [{ path: 'a.md', type: 'behaviour', content: 'rendered', templateId: 'tpl' }],
      folders: [],
      catalogueRevision: 'rev-1',
    };
    const { plan: result } = plan(snapshot, request, { currentCatalogueRevision: 'rev-1' });
    expect(result.templates).toEqual([
      { path: 'a.md', templateId: 'tpl', sha256: sha256Hex('rendered') },
    ]);
    expect(refusal(snapshot, request, { currentCatalogueRevision: 'rev-2' }).code).toBe(
      'CATALOGUE_STALE',
    );
    expect(refusal(snapshot, { ...request, catalogueRevision: undefined }).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
  });

  it('creates an unclassified file without touching the manifest', () => {
    const { plan: result } = plan(snapshotWithBehaviour(), {
      action: 'create',
      documents: [{ path: 'scratch.md', content: 's' }],
      folders: [],
    });
    expect(result.paths.map((path) => path.role)).toEqual(['document']);
    expect(result.registry).toBeUndefined();
    expect(result.documents).toEqual([
      {
        id: deriveUnclassifiedDocumentId('scratch.md'),
        path: 'scratch.md',
        sha256: sha256Hex('s'),
        bytes: 1,
      },
    ]);
  });

  it.each([
    [
      'an existing file ignoring case',
      [{ path: 'Behaviour.md', content: 'x' }],
      [],
      'DOCUMENT_PATH_CONFLICT',
    ],
    [
      'a file below an existing file',
      [{ path: 'behaviour.md/x.md', content: 'x' }],
      [],
      'DOCUMENT_PATH_CONFLICT',
    ],
    [
      'two entries with the same name ignoring case',
      [
        { path: 'a.md', content: 'x' },
        { path: 'A.md', content: 'x' },
      ],
      [],
      'DOCUMENT_PATH_CONFLICT',
    ],
    [
      'a file that is also a folder of another entry',
      [
        { path: 'a', content: 'x' },
        { path: 'a/b.md', content: 'x' },
      ],
      [],
      'DOCUMENT_PATH_CONFLICT',
    ],
    [
      'a reserved name',
      [{ path: 'specification.yaml', content: 'x' }],
      [],
      'DOCUMENT_PATH_INVALID',
    ],
    ['a traversal', [{ path: '../x.md', content: 'x' }], [], 'DOCUMENT_PATH_INVALID'],
    ['a folder that is a file', [], ['behaviour.md'], 'DOCUMENT_PATH_CONFLICT'],
    ['a bad folder path', [], ['a//b'], 'DOCUMENT_PATH_INVALID'],
    ['a bad type', [{ path: 'a.md', type: 'Bad Type', content: 'x' }], [], 'DOCUMENT_TYPE_INVALID'],
    [
      'the overview type',
      [{ path: 'a.md', type: 'overview', content: 'x' }],
      [],
      'DOCUMENT_OPERATION_INVALID',
    ],
    [
      'a type in the derived id space',
      [{ path: 'a.md', type: 'u', content: 'x' }],
      [],
      'DOCUMENT_OPERATION_INVALID',
    ],
    ['nothing at all', [], [], 'DOCUMENT_OPERATION_INVALID'],
  ])('refuses %s', (_name, documents, folders, code) => {
    expect(refusal(snapshotWithBehaviour(), { action: 'create', documents, folders }).code).toBe(
      code,
    );
  });

  it('allows a folder and a file in it, but not more than the Create caps', () => {
    const snapshot = snapshotWithBehaviour();
    expect(
      plan(snapshot, {
        action: 'create',
        documents: [{ path: 'docs/a.md', content: 'x' }],
        folders: ['docs'],
      }).plan.paths,
    ).toHaveLength(2);
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}.md`, content: 'x' }));
    expect(refusal(snapshot, { action: 'create', documents: files, folders: [] }).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
    const folders = Array.from({ length: 101 }, (_, i) => `d${i}`);
    expect(refusal(snapshot, { action: 'create', documents: [], folders }).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
    const big = 'x'.repeat(600 * 1024);
    expect(
      refusal(snapshot, {
        action: 'create',
        documents: [
          { path: 'a.md', content: big },
          { path: 'b.md', content: big },
        ],
        folders: [],
      }).code,
    ).toBe('DOCUMENT_TOO_LARGE');
  });
});

describe('folder', () => {
  it('registers an empty folder through the manifest only', () => {
    const { plan: result } = plan(snapshotWithBehaviour(), { action: 'folder', path: 'notes' });
    expect(result.paths.map((path) => path.role)).toEqual(['manifest']);
    expect(result.registry!.folders).toEqual(['notes']);
    expect(result.folders).toEqual(['notes']);
  });

  it('refuses an existing folder, a name taken by a file and an invalid path', () => {
    const snapshot = snapshotWithBehaviour({ files: [{ path: 'docs/a.md', content: 'x' }] });
    expect(refusal(snapshot, { action: 'folder', path: 'DOCS' }).code).toBe(
      'DOCUMENT_PATH_CONFLICT',
    );
    expect(refusal(snapshot, { action: 'folder', path: 'behaviour.md' }).code).toBe(
      'DOCUMENT_PATH_CONFLICT',
    );
    expect(refusal(snapshot, { action: 'folder', path: '.hidden' }).code).toBe(
      'DOCUMENT_PATH_INVALID',
    );
  });
});

describe('rename and move of a document', () => {
  const snapshot = snapshotWithBehaviour({ folders: ['archive-me'] });
  const revision = (): string => revisionOf(snapshot, 'behaviour.md');

  it('renames a registered document: the bytes move, the id stays, the registry follows', () => {
    const { plan: result } = plan(snapshot, {
      action: 'rename',
      target: { kind: 'document', documentId: 'behaviour' },
      name: 'rules.md',
      expectedRevision: revision(),
    });
    expect(
      result.paths.map((path) => [
        path.path.slice(DIR.length),
        path.pre === null,
        path.post === null,
      ]),
    ).toEqual([
      ['rules.md', true, false],
      ['behaviour.md', false, true],
      ['specification.yaml', false, false],
    ]);
    expect(result.paths[0]!.source).toEqual({ kind: 'moved-from', path: DIR + 'behaviour.md' });
    expect(result.documents).toEqual([
      {
        id: 'behaviour',
        path: 'rules.md',
        type: 'behaviour',
        sha256: sha256Hex('# Behaviour\n'),
        bytes: 12,
      },
    ]);
    expect(result.registry!.documents.find((entry) => entry.id === 'behaviour')!.path).toBe(
      'rules.md',
    );
  });

  it('allows a rename that only changes case on a case-sensitive system and refuses a rename onto another file', () => {
    expect(
      onPlatform(
        'linux',
        () =>
          plan(snapshot, {
            action: 'rename',
            target: { kind: 'document', documentId: 'behaviour' },
            name: 'Behaviour.md',
            expectedRevision: revision(),
          }).plan.paths,
      ),
    ).toHaveLength(3);
    expect(
      refusal(snapshot, {
        action: 'rename',
        target: { kind: 'document', documentId: 'behaviour' },
        name: 'OVERVIEW.md',
        expectedRevision: revision(),
      }).code,
    ).toBe('DOCUMENT_PATH_CONFLICT');
  });

  it('refuses a rename that only changes case where the file system ignores case (it would remove the file)', () => {
    const failure = onPlatform('win32', () =>
      refusal(snapshot, {
        action: 'rename',
        target: { kind: 'document', documentId: 'behaviour' },
        name: 'Behaviour.md',
        expectedRevision: revision(),
      }),
    );
    expect(failure.code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(failure.details?.cause).toBe('case-only-rename');
  });

  it('treats a move into a folder that differs only in case like a case-only rename', () => {
    const inFolder = snapshotWithBehaviour({
      documents: [{ id: 'n', path: 'docs/n.md', type: 'notes' }],
      files: [{ path: 'docs/n.md', content: 'n' }],
    });
    const request: DocumentChangeRequest = {
      action: 'move',
      target: { kind: 'document', documentId: 'n' },
      targetFolder: 'Docs',
      expectedRevision: revisionOf(inFolder, 'docs/n.md'),
    };
    expect(
      onPlatform('linux', () =>
        plan(inFolder, request).plan.paths.map((path) => path.path.slice(DIR.length)),
      ),
    ).toEqual(['Docs/n.md', 'docs/n.md', 'specification.yaml']);
    const failure = onPlatform('win32', () => refusal(inFolder, request));
    expect(failure.code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(failure.details?.cause).toBe('case-only-rename');
  });

  it('moves into a folder, to the root, and refuses a no-op or a bad folder', () => {
    const moved = plan(snapshot, {
      action: 'move',
      target: { kind: 'document', documentId: 'behaviour' },
      targetFolder: 'a/b',
      expectedRevision: revision(),
    });
    expect(moved.plan.registry!.documents.find((entry) => entry.id === 'behaviour')!.path).toBe(
      'a/b/behaviour.md',
    );
    const request = (targetFolder: string): DocumentChangeRequest => ({
      action: 'move',
      target: { kind: 'document', documentId: 'behaviour' },
      targetFolder,
      expectedRevision: revision(),
    });
    expect(refusal(snapshot, request('')).code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(refusal(snapshot, request('../x')).code).toBe('DOCUMENT_PATH_INVALID');
    expect(refusal(snapshot, request('overview.md')).code).toBe('DOCUMENT_PATH_CONFLICT');
  });

  it('renames an unclassified file without a registry change; its derived id follows the path', () => {
    const withFile = snapshotWithBehaviour({ files: [{ path: 'loose.md', content: 'l' }] });
    const id = deriveUnclassifiedDocumentId('loose.md');
    const { plan: result } = plan(withFile, {
      action: 'rename',
      target: { kind: 'document', documentId: id },
      name: 'found.md',
      expectedRevision: revisionOf(withFile, 'loose.md'),
    });
    expect(result.registry).toBeUndefined();
    expect(result.removedDocumentIds).toEqual([id]);
    expect(result.documents[0]!.id).toBe(deriveUnclassifiedDocumentId('found.md'));
  });

  it('refuses the overview and a stale revision', () => {
    for (const request of [
      { action: 'rename', name: 'x.md' },
      { action: 'move', targetFolder: 'a' },
      { action: 'delete' },
    ] as const) {
      expect(
        refusal(snapshot, {
          ...request,
          target: { kind: 'document', documentId: 'overview' },
          expectedRevision: revisionOf(snapshot, 'overview.md'),
        }).code,
      ).toBe('DOCUMENT_PROTECTED');
    }

    expect(
      refusal(snapshot, {
        action: 'delete',
        target: { kind: 'document', documentId: 'behaviour' },
        expectedRevision: 'stale',
      }).code,
    ).toBe('DOCUMENT_REVISION_CONFLICT');
  });
});

describe('delete and classify of a document', () => {
  it('deletes the file and its registry entry', () => {
    const snapshot = snapshotWithBehaviour();
    const { plan: result } = plan(snapshot, {
      action: 'delete',
      target: { kind: 'document', documentId: 'behaviour' },
      expectedRevision: revisionOf(snapshot, 'behaviour.md'),
    });
    expect(result.paths.map((path) => [path.role, path.post])).toEqual([
      ['document', null],
      ['manifest', expect.anything()],
    ]);
    expect(result.removedDocumentIds).toEqual(['behaviour']);
    expect(result.registry!.documents.map((entry) => entry.id)).toEqual(['overview']);
  });

  it('removes a dangling registry entry without a file path', () => {
    const snapshot = buildSnapshot({
      documents: [{ id: 'gone', path: 'gone.md', type: 'notes' }],
    });
    const { plan: result } = plan(snapshot, {
      action: 'delete',
      target: { kind: 'document', documentId: 'gone' },
      expectedRevision: 'whatever',
    });
    expect(result.paths.map((path) => path.role)).toEqual(['manifest']);
  });

  it('classifies an unclassified file: registry only, a new id, no file change', () => {
    const snapshot = snapshotWithBehaviour({ files: [{ path: 'loose.md', content: 'l' }] });
    const id = deriveUnclassifiedDocumentId('loose.md');
    const { plan: result } = plan(snapshot, {
      action: 'classify',
      documentId: id,
      type: 'notes',
      expectedRevision: revisionOf(snapshot, 'loose.md'),
    });
    expect(result.paths.map((path) => path.role)).toEqual(['manifest']);
    expect(result.documents).toMatchObject([{ id: 'notes', path: 'loose.md', type: 'notes' }]);
    expect(result.removedDocumentIds).toEqual([id]);
    expect(result.allocatedIds).toEqual(['notes']);
  });

  it('refuses to classify a registered document, an unknown one, a bad type and the overview type', () => {
    const snapshot = snapshotWithBehaviour({ files: [{ path: 'loose.md', content: 'l' }] });
    const id = deriveUnclassifiedDocumentId('loose.md');
    const revision = revisionOf(snapshot, 'loose.md');
    const classify = (documentId: string, type: string): DocumentChangeRequest => ({
      action: 'classify',
      documentId,
      type,
      expectedRevision: revision,
    });
    expect(refusal(snapshot, classify('behaviour', 'notes')).code).toBe(
      'DOCUMENT_ALREADY_CLASSIFIED',
    );
    expect(refusal(snapshot, classify('nope', 'notes')).code).toBe('DOCUMENT_NOT_FOUND');
    expect(refusal(snapshot, classify(id, 'Not Valid')).code).toBe('DOCUMENT_TYPE_INVALID');
    expect(refusal(snapshot, classify(id, 'overview')).code).toBe('DOCUMENT_OPERATION_INVALID');
  });
});

describe('folder operations', () => {
  const files = [
    { path: 'docs/a.md', content: 'a' },
    { path: 'docs/sub/b.md', content: 'b' },
    { path: 'docs/loose.txt', content: 'l' },
  ];
  const snapshot = snapshotWithBehaviour({
    documents: [
      { id: 'a', path: 'docs/a.md', type: 'notes' },
      { id: 'b', path: 'docs/sub/b.md', type: 'notes' },
    ],
    folders: ['docs/empty', 'other'],
    files,
  });
  const options: PlanningOptions = { folderRevision: (folder) => 'rev:' + folder };
  const folderTarget = { kind: 'folder', path: 'docs' } as const;

  it('renames a folder: every file moves, the registry and explicit folders follow', () => {
    const { plan: result } = plan(
      snapshot,
      { action: 'rename', target: folderTarget, name: 'guides', expectedRevision: 'rev:docs' },
      options,
    );
    const moved = result.paths.filter((path) => path.source.kind === 'moved-from');
    expect(moved.map((path) => path.path.slice(DIR.length)).sort()).toEqual([
      'guides/a.md',
      'guides/loose.txt',
      'guides/sub/b.md',
    ]);
    expect(
      result
        .registry!.documents.filter((entry) => entry.path.startsWith('guides/'))
        .map((entry) => entry.id),
    ).toEqual(['a', 'b']);
    expect(result.registry!.folders).toEqual(['guides/empty', 'other']);
    expect(result.folders).toEqual(['guides']);
    expect(result.removedDocumentIds).toEqual([deriveUnclassifiedDocumentId('docs/loose.txt')]);
    expect(result.documents.map((document) => document.id)).toContain(
      deriveUnclassifiedDocumentId('guides/loose.txt'),
    );
  });

  it('moves a folder below another and refuses moving it into itself', () => {
    const { plan: result } = plan(
      snapshot,
      { action: 'move', target: folderTarget, targetFolder: 'other', expectedRevision: 'rev:docs' },
      options,
    );
    expect(result.registry!.documents.map((entry) => entry.path)).toContain('other/docs/a.md');
    expect(
      refusal(
        snapshot,
        {
          action: 'move',
          target: folderTarget,
          targetFolder: 'docs/sub',
          expectedRevision: 'rev:docs',
        },
        options,
      ).code,
    ).toBe('DOCUMENT_OPERATION_INVALID');
  });

  it('deletes a folder with everything below it', () => {
    const { plan: result } = plan(
      snapshot,
      { action: 'delete', target: folderTarget, expectedRevision: 'rev:docs' },
      options,
    );
    expect(
      result.paths.filter((path) => path.role === 'document').every((path) => path.post === null),
    ).toBe(true);
    expect([...result.removedDocumentIds].sort()).toEqual(
      ['a', 'b', deriveUnclassifiedDocumentId('docs/loose.txt')].sort(),
    );
    expect(result.registry!.documents.map((entry) => entry.id)).toEqual(['overview', 'behaviour']);
    expect(result.registry!.folders).toEqual(['other']);
  });

  it('refuses a stale folder revision, an unknown folder and a missing folder revision source', () => {
    const request = (path: string, expectedRevision: string): DocumentChangeRequest => ({
      action: 'delete',
      target: { kind: 'folder', path },
      expectedRevision,
    });
    expect(refusal(snapshot, request('docs', 'stale'), options).code).toBe(
      'DOCUMENT_REVISION_CONFLICT',
    );
    expect(refusal(snapshot, request('nope', 'rev:nope'), options).code).toBe('DOCUMENT_NOT_FOUND');
    expect(refusal(snapshot, request('docs', 'rev:docs')).code).toBe('DOCUMENT_OPERATION_INVALID');
  });

  it('refuses a rename onto an existing folder and a rename that keeps the name', () => {
    const rename = (name: string): DocumentChangeRequest => ({
      action: 'rename',
      target: folderTarget,
      name,
      expectedRevision: 'rev:docs',
    });
    expect(refusal(snapshot, rename('OTHER'), options).code).toBe('DOCUMENT_PATH_CONFLICT');
    expect(refusal(snapshot, rename('docs'), options).code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(refusal(snapshot, rename('a/b'), options).code).toBe('DOCUMENT_PATH_INVALID');
  });

  it('renames a folder that only changes case on a case-sensitive system and refuses it where case is ignored', () => {
    const rename = (name: string): DocumentChangeRequest => ({
      action: 'rename',
      target: folderTarget,
      name,
      expectedRevision: 'rev:docs',
    });
    expect(
      onPlatform('linux', () => plan(snapshot, rename('Docs'), options).plan.paths.length),
    ).toBeGreaterThan(0);
    const failure = onPlatform('win32', () => refusal(snapshot, rename('Docs'), options));
    expect(failure.code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(failure.details?.cause).toBe('case-only-rename');
  });

  it('refuses where case is ignored a folder move whose parent differs only in case', () => {
    const nested = snapshotWithBehaviour({
      files: [
        { path: 'a/docs/x.md', content: 'x' },
        { path: 'a/y.md', content: 'y' },
      ],
    });
    const move: DocumentChangeRequest = {
      action: 'move',
      target: { kind: 'folder', path: 'a/docs' },
      targetFolder: 'A',
      expectedRevision: 'rev:a/docs',
    };
    expect(
      onPlatform('linux', () =>
        plan(nested, move, options)
          .plan.paths.filter((path) => path.source.kind === 'moved-from')
          .map((path) => path.path.slice(DIR.length)),
      ),
    ).toEqual(['A/docs/x.md']);
    const failure = onPlatform('win32', () => refusal(nested, move, options));
    expect(failure.details?.cause).toBe('case-only-rename');
  });

  it('refuses a folder move that would write a path it also removes (a same-name ancestor), on every system', () => {
    // Moving `b/b` to the root makes it `b`: `b/b/b/x.md` would be written to `b/b/x.md`, which the
    // same plan then removes as the origin of `b/x.md`.
    const sameName = snapshotWithBehaviour({
      files: [
        { path: 'b/b/x.md', content: 'same' },
        { path: 'b/b/b/x.md', content: 'same' },
      ],
    });
    const move: DocumentChangeRequest = {
      action: 'move',
      target: { kind: 'folder', path: 'b/b' },
      targetFolder: '',
      expectedRevision: 'rev:b/b',
    };
    for (const platform of ['linux', 'win32'] as const) {
      const failure = onPlatform(platform, () => refusal(sameName, move, options));
      expect(failure.code).toBe('DOCUMENT_OPERATION_INVALID');
      expect(failure.details?.cause).toBeUndefined();
    }
  });

  it('expands over 200 paths to DOCUMENT_OPERATION_INVALID, and accepts exactly the cap', () => {
    const many = (count: number): PlanningSnapshot =>
      buildSnapshot({
        files: [
          { path: 'overview.md', content: 'o' },
          ...Array.from({ length: count }, (_, i) => ({ path: `bulk/f${i}.md`, content: 'x' })),
        ],
      });
    const request: DocumentChangeRequest = {
      action: 'delete',
      target: { kind: 'folder', path: 'bulk' },
      expectedRevision: 'r',
    };
    const opts: PlanningOptions = { folderRevision: () => 'r' };
    // Deleting touches one path per file; no manifest change for unclassified files.
    expect(plan(many(DOCUMENT_BATCH_MAX_PATHS), request, opts).plan.paths).toHaveLength(
      DOCUMENT_BATCH_MAX_PATHS,
    );
    const error = refusal(many(DOCUMENT_BATCH_MAX_PATHS + 1), request, opts);
    expect(error.code).toBe('DOCUMENT_OPERATION_INVALID');
    expect(error.details?.cause).toBe('folder-expansion-limit');
    // A rename touches an old and a new path per file, so half the cap already overflows.
    expect(
      refusal(many(101), { ...request, action: 'rename', name: 'moved' }, opts).details?.cause,
    ).toBe('folder-expansion-limit');
  });
});
