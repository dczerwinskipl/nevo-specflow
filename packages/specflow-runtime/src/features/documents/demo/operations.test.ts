import { describe, expect, it } from 'vitest';
import { createDemoEnvironment } from '../../../demo';
import { creationCatalogue } from '../../../demo/catalogue';

function setup(nested = false) {
  let id = 0;
  const catalogue = structuredClone(creationCatalogue);
  if (nested)
    catalogue.archetypes.find((a) => a.id === 'feature')!.documents[0]!.filename =
      'required/specification.md';
  const env = createDemoEnvironment({ catalogue, id: () => String(++id) });
  const result = env.specs.create('alice', {
    operationId: '7f3a91c2-4b6e-4d1a-9c0e-000000000001',
    title: 'Feature',
    catalogueRevision: catalogue.revision,
    archetypeId: 'feature',
    archetypeVersion: '2',
    optionalDocumentIds: [],
  });
  const specId = result.specId;
  const add = env.documents.add('alice', specId, {
    requestId: 'add',
    documents: [{ path: 'notes/decision.md', content: '# Decision' }],
    folders: ['empty'],
  });
  return { env, specId, documentId: add.documentIds[0]!, requiredId: result.documentIds[0]! };
}
describe('demo composition', () => {
  it('keeps session context logic out of the shared demo state', () => {
    const { env } = setup();
    expect('refreshSessionDocuments' in env.state).toBe(false);
    expect(typeof env.sessions.refreshDocuments).toBe('function');
  });
});
describe('atomic demo document operations', () => {
  it('keeps stable identity, revisions, empty folders and current idle context across add/rename/move/delete', () => {
    const { env, specId, documentId } = setup();
    const session = env.sessions.allocate(
      'alice',
      specId,
      {
        title: 'Feature',
        archetype: 'Feature',
        documents: ['specification.md', 'notes/decision.md'],
      },
      {
        requestId: 'session',
        catalogueRevision: env.state.catalogue.revision,
        providerId: 'codex',
        modelId: 'model-a',
        mode: 'agent',
      },
    );
    env.documents.add('alice', specId, {
      requestId: 'next-add',
      documents: [{ path: 'transcript.txt', content: 'Client' }],
    });
    expect(env.state.sessions.get(session.sessionId)!.context.documents).toContain(
      'transcript.txt',
    );
    const rename = {
      requestId: 'rename',
      kind: 'document' as const,
      action: 'rename' as const,
      documentId,
      name: 'architecture.txt',
      expectedRevision: '1',
    };
    const renamed = env.documents.operate('alice', specId, rename);
    expect(env.documents.operate('alice', specId, rename)).toEqual(renamed);
    expect(env.documents.readDocument(specId, documentId)).toMatchObject({
      id: documentId,
      filename: 'notes/architecture.txt',
      content: '# Decision',
      revision: '1-next',
    });
    expect(env.state.sessions.get(session.sessionId)!.context.documents).toContain(
      'notes/architecture.txt',
    );
    env.documents.operate('alice', specId, {
      requestId: 'move',
      kind: 'document',
      action: 'move',
      documentId,
      targetFolder: 'empty',
      expectedRevision: '1-next',
    });
    expect(env.documents.documentTree(specId).folders.map((folder) => folder.path)).toContain(
      'notes',
    );
    const removed = env.documents.operate('alice', specId, {
      requestId: 'delete',
      kind: 'folder',
      action: 'delete',
      path: 'empty',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(removed.removedDocumentIds).toEqual([documentId]);
    expect(env.state.sessions.get(session.sessionId)!.context.documents).not.toContain(
      'empty/architecture.txt',
    );
    expect(env.documents.readDocument(specId, documentId)).toBeUndefined();
  });
  it('canonicalizes mixed-case parent paths and keeps subtree rename/move/delete coherent', () => {
    const { env, specId } = setup();
    env.documents.addFolder('alice', specId, { requestId: 'mixed-folder', path: 'ClientNotes' });
    const added = env.documents.add('alice', specId, {
      requestId: 'mixed-file',
      documents: [{ path: 'clientnotes/a.md', content: 'A' }],
      folders: ['CLIENTNOTES/Nested'],
    });
    const id = added.documentIds[0]!;
    expect(env.documents.readDocument(specId, id)!.filename).toBe('ClientNotes/a.md');
    expect(env.documents.documentTree(specId).folders.map((folder) => folder.path)).toContain(
      'ClientNotes/Nested',
    );
    env.documents.operate('alice', specId, {
      requestId: 'mixed-rename',
      kind: 'folder',
      action: 'rename',
      path: 'ClientNotes',
      name: 'Renamed',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(env.documents.readDocument(specId, id)!.filename).toBe('Renamed/a.md');
    env.documents.operate('alice', specId, {
      requestId: 'mixed-move',
      kind: 'folder',
      action: 'move',
      path: 'Renamed',
      targetFolder: 'empty',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(env.documents.readDocument(specId, id)!.filename).toBe('empty/Renamed/a.md');
    env.documents.operate('alice', specId, {
      requestId: 'mixed-delete',
      kind: 'folder',
      action: 'delete',
      path: 'empty',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(env.documents.readDocument(specId, id)).toBeUndefined();
    expect(
      env.documents
        .documentTree(specId)
        .folders.some((folder) => folder.path.toLowerCase().startsWith('empty')),
    ).toBe(false);
  });
  it('uses case-insensitive ancestry for required-path policy and legacy mixed-case descendants', () => {
    const { env, specId } = setup(true);
    const spec = env.state.specifications.get(specId)!;
    spec.requiredPaths = spec.requiredPaths.map((path) => path.toUpperCase());
    expect(
      env.documents.documentTree(specId).folders.find((folder) => folder.path === 'required')!
        .actions.delete.available,
    ).toBe(false);
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'protected-mixed',
        kind: 'folder',
        action: 'delete',
        path: 'required',
        expectedRevision: env.documents.documentTree(specId).revision,
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_required' }));
    const id = [...spec.documents.values()].find(
      (document) => document.filename === 'notes/decision.md',
    )!.id;
    spec.documents.get(id)!.filename = 'NOTES/decision.md';
    env.documents.operate('alice', specId, {
      requestId: 'legacy-mixed',
      kind: 'folder',
      action: 'delete',
      path: 'notes',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(env.documents.readDocument(specId, id)).toBeUndefined();
  });
  it('protects required identity and ancestors against every operation and root against deletion', () => {
    const { env, specId, requiredId } = setup(true);
    expect(
      env.documents.documentTree(specId).folders.find((f) => f.path === 'required')!.actions.delete
        .available,
    ).toBe(false);
    for (const action of ['rename', 'move', 'delete'] as const) {
      expect(() =>
        env.documents.operate('alice', specId, {
          requestId: action,
          kind: 'document',
          action,
          documentId: requiredId,
          expectedRevision: '1',
          ...(action === 'rename'
            ? { name: 'other.md' }
            : action === 'move'
              ? { targetFolder: '' }
              : {}),
        }),
      ).toThrowError(expect.objectContaining({ code: 'demo_document_required' }));
      expect(() =>
        env.documents.operate('alice', specId, {
          requestId: action + '-folder',
          kind: 'folder',
          action,
          path: 'required',
          expectedRevision: env.documents.documentTree(specId).revision,
          ...(action === 'rename'
            ? { name: 'other' }
            : action === 'move'
              ? { targetFolder: 'empty' }
              : {}),
        }),
      ).toThrowError(expect.objectContaining({ code: 'demo_document_required' }));
    }
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'root',
        kind: 'folder',
        action: 'delete',
        path: '',
        expectedRevision: '1',
      }),
    ).toThrow();
  });
  it('rejects unsafe paths, extensionless rename and case collisions without partial changes', () => {
    const { env, specId, documentId } = setup();
    for (const name of [
      'CON.md',
      '.hidden.md',
      '../other.md',
      'noextension',
      'notes/other.md',
      'bad.',
    ])
      expect(() =>
        env.documents.operate('alice', specId, {
          requestId: 'unsafe-' + name.replace(/[^a-z]/gi, ''),
          kind: 'document',
          action: 'rename',
          documentId,
          name,
          expectedRevision: '1',
        }),
      ).toThrow();
    env.documents.add('alice', specId, {
      requestId: 'collision',
      documents: [{ path: 'notes/Other.md', content: '' }],
    });
    const before = structuredClone(env.documents.documentTree(specId));
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'duplicate',
        kind: 'document',
        action: 'rename',
        documentId,
        name: 'other.md',
        expectedRevision: '1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_path_conflict' }));
    expect(env.documents.documentTree(specId)).toEqual(before);
  });
  it('rejects stale folder and document revisions and changed idempotency input', () => {
    const { env, specId, documentId } = setup();
    const oldTree = env.documents.documentTree(specId).revision;
    const snapshot = structuredClone(env.documents.readDocument(specId, documentId)!);
    env.documents.save(specId, snapshot, { expectedRevision: '1', content: 'Changed' });
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'stale',
        kind: 'document',
        action: 'delete',
        documentId,
        expectedRevision: '1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_revision_conflict' }));
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'folder',
        kind: 'folder',
        action: 'delete',
        path: 'notes',
        expectedRevision: oldTree,
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_revision_conflict' }));
    const command = {
      requestId: 'delete',
      kind: 'document' as const,
      action: 'delete' as const,
      documentId,
      expectedRevision: '1-next',
    };
    env.documents.operate('alice', specId, command);
    expect(() =>
      env.documents.operate('alice', specId, { ...command, expectedRevision: 'other' }),
    ).toThrowError(expect.objectContaining({ code: 'demo_request_conflict' }));
    expect(() =>
      env.documents.save(specId, snapshot, { expectedRevision: '1', content: 'Resurrect' }),
    ).toThrowError(expect.objectContaining({ code: 'specification_document_not_found' }));
  });
  it('renames a complete subtree and rejects moves into itself or a colliding tree atomically', () => {
    const { env, specId, documentId } = setup();
    env.documents.operate('alice', specId, {
      requestId: 'rename-folder',
      kind: 'folder',
      action: 'rename',
      path: 'notes',
      name: 'decisions',
      expectedRevision: env.documents.documentTree(specId).revision,
    });
    expect(env.documents.readDocument(specId, documentId)!.filename).toBe('decisions/decision.md');
    env.documents.addFolder('alice', specId, { requestId: 'subfolder', path: 'decisions/sub' });
    const before = structuredClone(env.documents.documentTree(specId));
    expect(() =>
      env.documents.operate('alice', specId, {
        requestId: 'recursive',
        kind: 'folder',
        action: 'move',
        path: 'decisions',
        targetFolder: 'decisions/sub',
        expectedRevision: before.revision,
      }),
    ).toThrow();
    expect(env.documents.documentTree(specId)).toEqual(before);
  });
});
