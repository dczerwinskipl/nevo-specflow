import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  ACTION_REASONS,
  ActionSchema,
  CatalogueIdSchema,
  ClassificationSchema,
  ContentKindSchema,
  DOCUMENT_ID_PATTERN,
  DocumentIssueCodeSchema,
  IdSchema,
  RegisteredDocumentIdSchema,
  ArchetypeCatalogueSchema,
  CreateArchetypeSelectionSchema,
  CreateDocumentsInputSchema,
  DOCUMENT_ERROR_CODES,
  DocumentContentSchema,
  DocumentErrorSchema,
  DocumentOperationInputSchema,
  DocumentOperationResultSchema,
  DocumentTreeSchema,
  DocumentTypeInfoSchema,
  SaveInputSchema,
  SaveResultSchema,
} from './index';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const ok = { available: true };

const catalogue = {
  revision: 'a'.repeat(64),
  documentTypes: [
    {
      id: 'overview',
      title: 'Overview',
      description: 'Main document.',
      useWhen: 'Always.',
      instructions: 'State the outcome.',
      defaultFilename: 'overview.md',
    },
  ],
  archetypes: [
    {
      id: 'minimal',
      version: 1,
      title: 'Minimal',
      description: 'Smallest set.',
      useWhen: 'Small work.',
      requirements: [{ documentType: 'overview', minCount: 1 }],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '# {{specificationTitle}}\n',
        },
        {
          id: 'notes',
          type: 'note',
          title: 'Notes',
          filename: 'note.md',
          include: 'optional',
          preselected: true,
          instructions: 'Free notes.',
          content: '',
        },
      ],
    },
  ],
};

const tree = {
  revision: 'r1',
  archetype: { id: 'feature', version: 1, title: 'Feature' },
  folders: [
    { path: '', actions: { rename: { available: false, reason: 'root' }, move: ok, delete: ok } },
  ],
  documents: [
    {
      id: 'overview',
      path: 'overview.md',
      classification: 'registered',
      type: 'overview',
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
      size: 12,
      revision: 'h1',
      protected: true,
      editable: true,
      satisfiesRequirement: true,
      actions: {
        rename: { available: false, reason: 'protected' },
        move: { available: false, reason: 'protected' },
        delete: { available: false, reason: 'protected' },
        classify: { available: false, reason: 'not-editable' },
      },
    },
    {
      id: 'u-0123456789abcdef',
      path: 'diagram.png',
      classification: 'unclassified',
      kind: 'image',
      mediaType: 'image/png',
      size: 2048,
      revision: 'stat:2048-1',
      protected: false,
      editable: false,
      satisfiesRequirement: false,
      actions: { rename: ok, move: ok, delete: ok, classify: ok },
    },
  ],
  dangling: [
    {
      id: 'behaviour',
      path: 'behaviour.md',
      type: 'behaviour',
      actions: { delete: { available: true, reason: 'dangling' } },
    },
  ],
  completeness: {
    complete: false,
    requirements: [
      { documentType: 'overview', minCount: 1, count: 1, satisfied: true },
      { documentType: 'behaviour', minCount: 1, count: 0, satisfied: false },
    ],
  },
  capabilities: {
    createFile: ok,
    createFolder: ok,
    import: { available: false, reason: 'archived' },
    classify: ok,
    formats: ['md', 'txt'],
  },
  issues: [
    { code: 'dangling', path: 'behaviour.md' },
    { code: 'unclassified', path: 'diagram.png' },
    { code: 'requirement-unmet', documentType: 'behaviour' },
  ],
  truncated: false,
  skippedEntries: 0,
};

describe('documents contract schemas', () => {
  it('accepts the catalogue payload and rejects a missing useWhen or a string version', () => {
    expect(Value.Check(ArchetypeCatalogueSchema, catalogue)).toBe(true);

    const [archetype] = catalogue.archetypes;
    const { useWhen: _useWhen, ...withoutUseWhen } = archetype!;
    expect(
      Value.Check(ArchetypeCatalogueSchema, { ...catalogue, archetypes: [withoutUseWhen] }),
    ).toBe(false);
    expect(
      Value.Check(ArchetypeCatalogueSchema, {
        ...catalogue,
        archetypes: [{ ...archetype, version: '1' }],
      }),
    ).toBe(false);
  });

  it('rejects the retired template flag `required` and unknown keys in templates', () => {
    const [archetype] = catalogue.archetypes;
    const [overview, ...rest] = archetype!.documents;
    const withRequired = {
      ...catalogue,
      archetypes: [{ ...archetype, documents: [{ ...overview, required: true }, ...rest] }],
    };
    expect(Value.Check(ArchetypeCatalogueSchema, withRequired)).toBe(false);
  });

  it('requires description, useWhen and instructions on a document type', () => {
    const [type] = catalogue.documentTypes;
    expect(Value.Check(DocumentTypeInfoSchema, type)).toBe(true);
    for (const key of ['description', 'useWhen', 'instructions'] as const) {
      const { [key]: _removed, ...rest } = type!;
      expect(Value.Check(DocumentTypeInfoSchema, rest)).toBe(false);
    }
  });

  it('accepts the Create archetype fragment and rejects incomplete or loose shapes', () => {
    const selection = {
      archetypeId: 'feature',
      archetypeVersion: 1,
      catalogueRevision: 'a'.repeat(64),
      optionalDocumentIds: ['behaviour'],
      addedDocuments: [{ path: 'research/a.md', content: 'x' }],
      folders: ['research'],
    };
    expect(Value.Check(CreateArchetypeSelectionSchema, selection)).toBe(true);
    expect(
      Value.Check(CreateArchetypeSelectionSchema, { ...selection, archetypeVersion: '1' }),
    ).toBe(false);
    expect(
      Value.Check(CreateArchetypeSelectionSchema, {
        ...selection,
        optionalDocumentIds: ['behaviour', 'behaviour'],
      }),
    ).toBe(false);
    expect(Value.Check(CreateArchetypeSelectionSchema, { ...selection, extra: true })).toBe(false);
    const { archetypeId: _id, ...withoutArchetype } = selection;
    expect(Value.Check(CreateArchetypeSelectionSchema, withoutArchetype)).toBe(false);
    expect(
      Value.Check(CreateArchetypeSelectionSchema, {
        ...selection,
        addedDocuments: [{ path: 'a.md', content: 'x', title: 'A' }],
      }),
    ).toBe(false);
  });

  it('accepts a tree with unclassified, dangling and completeness and rejects extra keys', () => {
    expect(Value.Check(DocumentTreeSchema, tree)).toBe(true);
    expect(Value.Check(DocumentTreeSchema, { ...tree, extra: 1 })).toBe(false);
    const [first, ...rest] = tree.documents;
    expect(
      Value.Check(DocumentTreeSchema, {
        ...tree,
        documents: [{ ...first, required: true }, ...rest],
      }),
    ).toBe(false);
    expect(
      Value.Check(DocumentTreeSchema, {
        ...tree,
        documents: [
          {
            ...first,
            actions: {
              ...first!.actions,
              delete: { available: false, reason: 'required_document_path' },
            },
          },
          ...rest,
        ],
      }),
    ).toBe(false);
  });

  it('accepts document read payloads with and without content', () => {
    const base = {
      id: 'overview',
      path: 'overview.md',
      title: 'Overview',
      classification: 'registered',
      type: 'overview',
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
      size: 3,
      revision: 'h1',
      editable: true,
    };
    expect(Value.Check(DocumentContentSchema, { ...base, content: '# x' })).toBe(true);
    expect(
      Value.Check(DocumentContentSchema, {
        ...base,
        id: 'u-0123456789abcdef',
        classification: 'unclassified',
        type: undefined,
        kind: 'image',
        mediaType: 'image/png',
        editable: false,
      }),
    ).toBe(true);
    expect(Value.Check(DocumentContentSchema, { ...base, filename: 'overview.md' })).toBe(false);
  });

  it('accepts operation inputs for rename, move, delete, classify and create-documents', () => {
    const base = { operationId, kind: 'document', expectedRevision: 'h1' };
    for (const input of [
      { ...base, action: 'rename', documentId: 'behaviour', name: 'spec.md' },
      { ...base, action: 'move', documentId: 'behaviour', targetFolder: 'research' },
      { ...base, action: 'delete', documentId: 'behaviour' },
      { ...base, action: 'classify', documentId: 'u-0123456789abcdef', type: 'note' },
      { ...base, action: 'rename', kind: 'folder', path: 'research', name: 'notes' },
    ]) {
      expect(Value.Check(DocumentOperationInputSchema, input)).toBe(true);
    }
    expect(Value.Check(DocumentOperationInputSchema, { ...base, action: 'copy' })).toBe(false);
    expect(
      Value.Check(DocumentOperationInputSchema, { ...base, action: 'delete', requestId: 'x' }),
    ).toBe(false);

    expect(
      Value.Check(CreateDocumentsInputSchema, {
        operationId,
        documents: [
          { path: 'runbook.md', templateId: 'runbook' },
          { path: 'research/a.md', type: 'note', content: 'x' },
        ],
        folders: ['research'],
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateDocumentsInputSchema, {
        operationId,
        documents: [{ path: 'a.md', templateId: 'runbook', content: 'x' }],
      }),
    ).toBe(false);
    expect(
      Value.Check(CreateDocumentsInputSchema, { operationId, documents: [{ path: 'a.md' }] }),
    ).toBe(false);
  });

  it('accepts save and operation results with and without a commit', () => {
    expect(
      Value.Check(SaveInputSchema, { operationId, content: 'x', expectedRevision: 'h1' }),
    ).toBe(true);
    expect(Value.Check(SaveResultSchema, { operationId, revision: 'h2', committed: false })).toBe(
      true,
    );
    expect(
      Value.Check(SaveResultSchema, {
        operationId,
        revision: 'h2',
        committed: true,
        commit: { sha: 'abc123' },
      }),
    ).toBe(true);
    expect(
      Value.Check(DocumentOperationResultSchema, {
        operationId,
        revision: 'r2',
        documents: [
          { id: 'behaviour', path: 'research/behaviour.md', revision: 'h1', type: 'behaviour' },
        ],
        removedDocumentIds: [],
        folders: ['research'],
        committed: true,
        commit: { sha: 'abc123' },
      }),
    ).toBe(true);
  });

  it('accepts error bodies for every code and rejects unknown codes or extra keys', () => {
    for (const code of DOCUMENT_ERROR_CODES) {
      expect(Value.Check(DocumentErrorSchema, { error: code, code })).toBe(true);
    }
    expect(
      Value.Check(DocumentErrorSchema, {
        error: 'BRANCH_PROTECTED',
        code: 'BRANCH_PROTECTED',
        details: { reason: 'branch-protected' },
      }),
    ).toBe(true);
    expect(
      Value.Check(DocumentErrorSchema, {
        error: 'COMMIT_BLOCKED',
        code: 'COMMIT_BLOCKED',
        details: { reason: 'commit-blocked', blockedBy: 'index-locked' },
      }),
    ).toBe(true);
    expect(Value.Check(DocumentErrorSchema, { error: 'NOPE', code: 'NOPE' })).toBe(false);
    expect(
      Value.Check(DocumentErrorSchema, {
        error: 'SPEC_BUSY',
        code: 'SPEC_BUSY',
        details: { reason: 'x' },
      }),
    ).toBe(false);
    expect(
      Value.Check(DocumentErrorSchema, { error: 'SPEC_BUSY', code: 'SPEC_BUSY', extra: 1 }),
    ).toBe(false);
  });

  it('lists exactly the codes of the reference Errors table, in order', () => {
    expect([...DOCUMENT_ERROR_CODES]).toEqual([
      'DOCUMENT_NOT_FOUND',
      'DOCUMENT_FILE_MISSING',
      'SPEC_SOURCE_UNAVAILABLE',
      'DOCUMENT_REVISION_UNAVAILABLE',
      'DOCUMENT_REVISION_CONFLICT',
      'DOCUMENT_PATH_INVALID',
      'DOCUMENT_PATH_CONFLICT',
      'DOCUMENT_PROTECTED',
      'DOCUMENT_TYPE_INVALID',
      'DOCUMENT_ALREADY_CLASSIFIED',
      'DOCUMENT_NOT_EDITABLE',
      'DOCUMENT_TOO_LARGE',
      'DOCUMENT_OPERATION_INVALID',
      'DOCUMENT_OPERATION_CONFLICT',
      'DOCUMENT_RECOVERY_REQUIRED',
      'SPEC_MANIFEST_DIRTY',
      'SPEC_ARCHIVED',
      'SPEC_BUSY',
      'BRANCH_PROTECTED',
      'COMMIT_BLOCKED',
      'COMMIT_FAILED',
      'GIT_POLICY_INVALID',
      'CREATE_JOURNAL_UNSUPPORTED',
      'CATALOGUE_STALE',
      'ARCHETYPE_UNKNOWN',
    ]);
  });

  it('rejects malformed ids, operation ids and enum values', () => {
    expect(Value.Check(IdSchema, 'a.b_c-1')).toBe(true);
    for (const id of ['', '-a', '.a', 'a b', 'a/b', 'a'.repeat(201)]) {
      expect(Value.Check(IdSchema, id)).toBe(false);
    }
    for (const id of ['Overview', '1abc', 'a_b', '', 'a'.repeat(33)]) {
      expect(Value.Check(CatalogueIdSchema, id)).toBe(false);
    }
    expect(Value.Check(CatalogueIdSchema, 'a'.repeat(32))).toBe(true);
    expect(DOCUMENT_ID_PATTERN).toBe('^[a-z0-9][a-z0-9-]{0,63}$');
    for (const id of ['-a', 'A', 'a_b', '', 'a'.repeat(65)]) {
      expect(Value.Check(RegisteredDocumentIdSchema, id)).toBe(false);
    }
    expect(Value.Check(RegisteredDocumentIdSchema, '0abc-1')).toBe(true);

    const base = { action: 'delete', kind: 'document', documentId: 'a', expectedRevision: 'h1' };
    expect(Value.Check(DocumentOperationInputSchema, { ...base, operationId: 'not-a-uuid' })).toBe(
      false,
    );
    expect(Value.Check(DocumentOperationInputSchema, { ...base, kind: 'file', operationId })).toBe(
      false,
    );
    expect(
      Value.Check(SaveInputSchema, { operationId: 'x', content: '', expectedRevision: 'h' }),
    ).toBe(false);

    expect(Value.Check(ActionSchema, { available: false, reason: 'root_protected' })).toBe(false);
    expect(Value.Check(ContentKindSchema, 'video')).toBe(false);
    expect(Value.Check(ClassificationSchema, 'draft')).toBe(false);
    expect(Value.Check(DocumentIssueCodeSchema, 'unknown')).toBe(false);
    expect(Value.Check(DocumentTreeSchema, { ...tree, issues: [{ code: 'something-else' }] })).toBe(
      false,
    );
    expect(new Set(ACTION_REASONS).size).toBe(ACTION_REASONS.length);
  });

  it('rejects a bad template include or template id in the catalogue', () => {
    const [archetype] = catalogue.archetypes;
    const [overview, ...rest] = archetype!.documents;
    for (const patch of [{ include: 'required' }, { id: 'Overview' }, { id: 'u_1' }]) {
      expect(
        Value.Check(ArchetypeCatalogueSchema, {
          ...catalogue,
          archetypes: [{ ...archetype, documents: [{ ...overview, ...patch }, ...rest] }],
        }),
      ).toBe(false);
    }
  });
});
