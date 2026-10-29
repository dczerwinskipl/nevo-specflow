import { describe, expect, it } from 'vitest';

import { DocumentError } from '../../document-rules/errors';
import { buildSnapshot } from '../changes/test-support';
import { planDocumentChange } from '../changes/plan';
import type { DocumentChangeRequest } from '../changes/plan/request';
import { projectDocumentTree, type ObservedFile } from '../projection';
import { folderRevisionOf } from '../write/folder-revision';

/**
 * Admission and the tree must agree on every refusal a read can know (docs/reference/api/
 * specification-documents.md, tree actions): what the tree offers, the planner accepts; what the
 * tree refuses for the document itself, the planner refuses with the matching error.
 */

const snapshot = buildSnapshot({
  documents: [
    { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' },
    { id: 'diagram', path: 'diagram.png', type: 'diagram' },
  ],
  folders: ['empty'],
  files: [
    { path: 'overview.md', content: '# Overview\n' },
    { path: 'behaviour.md', content: 'behaviour\n' },
    { path: 'diagram.png', content: 'not really a png' },
    { path: 'notes/idea.md', content: 'idea\n' },
    { path: 'notes/data.bin', content: 'data' },
  ],
});

const STATIC_ERRORS = new Set([
  'DOCUMENT_PROTECTED',
  'DOCUMENT_NOT_EDITABLE',
  'DOCUMENT_ALREADY_CLASSIFIED',
  'SPEC_ARCHIVED',
]);

function observedFiles(): ObservedFile[] {
  return snapshot.files.map((file) => ({
    path: file.path,
    size: file.bytes,
    revision: file.revision,
    kind: /\.(md|txt)$/u.test(file.path) ? 'text' : 'binary',
    mediaType: 'application/octet-stream',
  }));
}

function tree() {
  return projectDocumentTree({
    manifest: snapshot.manifest,
    manifestBytes: Buffer.from(snapshot.manifestText),
    location: 'active',
    files: observedFiles(),
    truncated: false,
    skippedEntries: 0,
    skippedPaths: [],
    archiveLimit: { exceeded: false },
  });
}

function refusalOf(request: DocumentChangeRequest): string | undefined {
  try {
    planDocumentChange(snapshot, request, {
      folderRevision: (folder) => folderRevisionOf(folder, snapshot.files, snapshot.manifest),
    });
    return undefined;
  } catch (error) {
    if (error instanceof DocumentError) return error.code;
    throw error;
  }
}

describe('the tree actions and the planners agree', () => {
  const projected = tree();

  it.each(projected.documents.map((document) => [document.path, document] as const))(
    'for the document %s',
    (_path, document) => {
      const target = { kind: 'document', documentId: document.id } as const;
      const expectedRevision = document.revision;
      const requests: [keyof typeof document.actions, DocumentChangeRequest][] = [
        ['save', { action: 'save', documentId: document.id, content: 'new\n', expectedRevision }],
        ['rename', { action: 'rename', target, name: 'renamed.md', expectedRevision }],
        ['move', { action: 'move', target, targetFolder: 'moved', expectedRevision }],
        ['delete', { action: 'delete', target, expectedRevision }],
        [
          'classify',
          { action: 'classify', documentId: document.id, type: 'notes', expectedRevision },
        ],
      ];
      for (const [name, request] of requests) {
        const action = document.actions[name]!;
        const refusal = refusalOf(request);
        if (action.available) {
          expect(refusal === undefined || !STATIC_ERRORS.has(refusal)).toBe(true);
        } else if (action.reason === 'protected') {
          expect(refusal).toBe('DOCUMENT_PROTECTED');
        } else if (action.reason === 'not-editable') {
          expect(refusal === 'DOCUMENT_NOT_EDITABLE' || document.kind !== 'text').toBe(true);
        } else if (document.classification === 'registered' && name === 'classify') {
          expect(refusal).toBe('DOCUMENT_ALREADY_CLASSIFIED');
        }
      }
    },
  );

  it('offers a save only for text that is editable, and never a rename of the overview', () => {
    const byPath = new Map(projected.documents.map((document) => [document.path, document]));
    expect(byPath.get('behaviour.md')!.actions.save).toEqual({ available: true });
    expect(byPath.get('diagram.png')!.actions.save).toEqual({
      available: false,
      reason: 'not-editable',
    });
    expect(byPath.get('overview.md')!.actions.rename).toEqual({
      available: false,
      reason: 'protected',
    });
  });

  it.each(projected.folders.map((folder) => [folder.path || '(root)', folder] as const))(
    'for the folder %s',
    (_name, folder) => {
      if (folder.path === '') {
        expect(folder.actions.rename).toEqual({ available: false, reason: 'root' });
        expect(folder.revision).toBeUndefined();
        return;
      }
      const target = { kind: 'folder', path: folder.path } as const;
      // The revision the tree reports is the one a folder operation compares.
      const expectedRevision = folder.revision!;
      expect(expectedRevision).toBe(
        folderRevisionOf(folder.path, snapshot.files, snapshot.manifest),
      );
      const requests: [keyof typeof folder.actions, DocumentChangeRequest][] = [
        ['rename', { action: 'rename', target, name: 'renamed', expectedRevision }],
        ['move', { action: 'move', target, targetFolder: 'moved', expectedRevision }],
        ['delete', { action: 'delete', target, expectedRevision }],
      ];
      for (const [name, request] of requests) {
        const action = folder.actions[name];
        const refusal = refusalOf(request);
        if (action.available) {
          // A folder request with the reported revision is planned: no static refusal and no stale revision.
          expect(refusal).toBeUndefined();
        } else if (action.reason === 'protected') {
          expect(refusal).toBe('DOCUMENT_PROTECTED');
        }
      }
    },
  );

  it('refuses every write in an archived Specification the way the planners do', () => {
    const archived = buildSnapshot({ location: 'archive' });
    expect(() =>
      planDocumentChange(archived, {
        action: 'save',
        documentId: 'overview',
        content: 'x',
        expectedRevision: archived.files[0]!.revision,
      }),
    ).toThrow(DocumentError);
    const result = projectDocumentTree({
      manifest: archived.manifest,
      manifestBytes: Buffer.from(archived.manifestText),
      location: 'archive',
      files: [],
      truncated: false,
      skippedEntries: 0,
      skippedPaths: [],
      archiveLimit: { exceeded: false },
    });
    expect(result.capabilities.createFile).toEqual({ available: false, reason: 'archived' });
  });
});
