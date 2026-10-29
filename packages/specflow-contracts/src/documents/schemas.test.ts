import { Value } from 'typebox/value';
import type { Static } from 'typebox';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ACTION_REASONS,
  ActionSchema,
  type ActionReason,
  type Classification,
  type ContentKind,
  type DocumentIssueCode,
  type TemplateInclude,
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
  BATCH_SAVE_MAX_DOCUMENTS,
  BatchSaveInputSchema,
  BatchSaveResultSchema,
  COMMIT_FAILURE_REASONS,
  COMMIT_PENDING_REASONS,
  COMMIT_STATES,
  CommitInfoSchema,
  DEFINITION_PROBLEMS_MAX,
  DEFINITION_PROBLEM_CODES,
  DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH,
  DocumentOperationStatusSchema,
  FLUSH_MAX_WAIT_MS,
  FlushInputSchema,
  FlushResultSchema,
  FolderInputSchema,
  REVISION_CONFLICTS_MAX,
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
      id: 'u-0123456789abcdef0123456789abcdef',
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
        id: 'u-0123456789abcdef0123456789abcdef',
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
      {
        ...base,
        action: 'classify',
        documentId: 'u-0123456789abcdef0123456789abcdef',
        type: 'note',
      },
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

  it('accepts save, batch save and operation results with a commit state', () => {
    const document = { id: 'behaviour', path: 'behaviour.md', revision: 'h2' };
    expect(
      Value.Check(SaveInputSchema, { operationId, content: 'x', expectedRevision: 'h1' }),
    ).toBe(true);
    expect(
      Value.Check(SaveResultSchema, {
        operationId,
        document,
        commit: { state: 'pending', reason: 'settling', queuedAt: '2026-01-01T00:00:00.000Z' },
      }),
    ).toBe(true);
    expect(
      Value.Check(SaveResultSchema, {
        operationId,
        document,
        commit: { state: 'committed', sha: 'abc123', coalescedWith: 4, batchId: 'b1' },
      }),
    ).toBe(true);
    // The retired result shape (a boolean and a bare sha) is rejected.
    expect(Value.Check(SaveResultSchema, { operationId, revision: 'h2', committed: false })).toBe(
      false,
    );
    expect(
      Value.Check(DocumentOperationResultSchema, {
        operationId,
        revision: 'r2',
        documents: [{ ...document, path: 'research/behaviour.md', type: 'behaviour' }],
        removedDocumentIds: [],
        folders: ['research'],
        commit: { state: 'not-applicable', reason: 'git-disabled' },
      }),
    ).toBe(true);
    expect(
      Value.Check(BatchSaveResultSchema, {
        operationId,
        documents: [document],
        commit: { state: 'failed', reason: 'history-changed', recoveryRequired: true },
      }),
    ).toBe(true);
  });

  it('keeps the commit state vocabulary closed and its reasons kebab-case', () => {
    for (const state of COMMIT_STATES) {
      expect(Value.Check(CommitInfoSchema, { state })).toBe(true);
    }

    expect([...COMMIT_STATES]).toEqual([
      'pending',
      'committed',
      'failed',
      'uncommitted',
      'not-applicable',
    ]);
    expect(Value.Check(CommitInfoSchema, { state: 'queued' })).toBe(false);
    expect(Value.Check(CommitInfoSchema, { state: 'failed', reason: 'Not Kebab' })).toBe(false);
    expect(Value.Check(CommitInfoSchema, { state: 'pending', coalescedWith: -1 })).toBe(false);
    expect(Value.Check(CommitInfoSchema, { state: 'pending', extra: 1 })).toBe(false);
    for (const reason of [...COMMIT_PENDING_REASONS, ...COMMIT_FAILURE_REASONS]) {
      expect(Value.Check(CommitInfoSchema, { state: 'failed', reason })).toBe(true);
    }
  });

  it('accepts the write inputs and statuses and rejects malformed ones', () => {
    const batch = {
      operationId,
      documents: [{ documentId: 'behaviour', content: 'x', expectedRevision: 'h1' }],
    };
    expect(Value.Check(BatchSaveInputSchema, batch)).toBe(true);
    expect(Value.Check(BatchSaveInputSchema, { operationId, documents: [] })).toBe(false);
    expect(
      Value.Check(BatchSaveInputSchema, {
        operationId,
        documents: Array.from({ length: BATCH_SAVE_MAX_DOCUMENTS + 1 }, () => batch.documents[0]),
      }),
    ).toBe(false);
    expect(Value.Check(FolderInputSchema, { operationId, path: 'research' })).toBe(true);
    expect(Value.Check(FolderInputSchema, { operationId, path: '' })).toBe(false);
    expect(Value.Check(FlushInputSchema, {})).toBe(true);
    expect(Value.Check(FlushInputSchema, { waitMs: FLUSH_MAX_WAIT_MS })).toBe(true);
    expect(Value.Check(FlushInputSchema, { waitMs: FLUSH_MAX_WAIT_MS + 1 })).toBe(false);
    expect(
      Value.Check(FlushResultSchema, { settled: true, pending: 0, failed: 0, committed: 2 }),
    ).toBe(true);
    const status = {
      operationId,
      specId: 'billing',
      action: 'save-all',
      documentIds: ['behaviour'],
      createdAt: '2026-01-01T00:00:00.000Z',
      commit: { state: 'pending' },
    };
    expect(Value.Check(DocumentOperationStatusSchema, status)).toBe(true);
    expect(Value.Check(DocumentOperationStatusSchema, { ...status, action: 'copy' })).toBe(false);
    const detailed = {
      ...status,
      stage: 'commit-failed',
      updatedAt: '2026-01-01T00:00:01.000Z',
      batchMembers: [operationId],
      executor: { state: 'unknown' },
      actions: {
        retry: { available: true },
        abandon: { available: true },
        recover: { available: false },
      },
    };
    expect(Value.Check(DocumentOperationStatusSchema, detailed)).toBe(true);
    expect(Value.Check(DocumentOperationStatusSchema, { ...detailed, stage: 'stuck' })).toBe(false);
    expect(
      Value.Check(DocumentOperationStatusSchema, { ...detailed, executor: { state: 'self' } }),
    ).toBe(false);
    expect(
      Value.Check(CreateDocumentsInputSchema, {
        operationId,
        documents: [{ path: 'a.md', templateId: 'runbook' }],
        catalogueRevision: 'r1',
      }),
    ).toBe(true);
  });

  it('accepts the commit marker, archetype state and commit counters of the tree', () => {
    const [first, ...rest] = tree.documents;
    const withCommit = {
      ...tree,
      archetype: { ...tree.archetype, defined: 'absent' },
      commits: {
        pending: 1,
        failed: 0,
        recoveryRequired: 0,
        oldestPendingAt: '2026-01-01T00:00:00Z',
      },
      documents: [{ ...first, commit: { state: 'uncommitted', operationId } }, ...rest],
    };
    expect(Value.Check(DocumentTreeSchema, withCommit)).toBe(true);
    const detailedMarker = {
      state: 'pending',
      operationId,
      reason: 'index-locked',
      blockedBy: 'index-locked',
      attempts: 2,
      nextAttemptAt: '2026-01-01T00:00:05.000Z',
      queuedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(
      Value.Check(DocumentTreeSchema, {
        ...withCommit,
        commits: { ...withCommit.commits, uncommitted: 1 },
        documents: [
          {
            ...first,
            commit: detailedMarker,
            actions: { ...first!.actions, save: { available: true } },
          },
          ...rest,
        ],
      }),
    ).toBe(true);
    expect(
      Value.Check(DocumentTreeSchema, {
        ...withCommit,
        documents: [{ ...first, commit: { ...detailedMarker, reason: 'Not Kebab' } }, ...rest],
      }),
    ).toBe(false);
    expect(
      Value.Check(DocumentTreeSchema, {
        ...withCommit,
        archetype: { ...tree.archetype, defined: 'gone' },
      }),
    ).toBe(false);
    expect(
      Value.Check(DocumentTreeSchema, {
        ...withCommit,
        documents: [{ ...first, commit: { state: 'committed', operationId } }, ...rest],
      }),
    ).toBe(false);
    expect(
      Value.Check(DocumentTreeSchema, { ...withCommit, commits: { pending: 1, failed: 0 } }),
    ).toBe(false);
  });

  it('accepts the folder revision of a folder node and rejects an empty one', () => {
    const [root, ...folders] = tree.folders;
    const withRevision = {
      ...tree,
      folders: [root, ...folders.map((folder) => ({ ...folder, revision: 'abc' }))],
    };
    expect(Value.Check(DocumentTreeSchema, withRevision)).toBe(true);
    if (folders.length > 0) {
      const empty = {
        ...tree,
        folders: [root, { ...folders[0], revision: '' }, ...folders.slice(1)],
      };
      expect(Value.Check(DocumentTreeSchema, empty)).toBe(false);
    }
  });

  it('accepts catalogue problems and rejects unknown codes, long messages and too many', () => {
    const problem = {
      source: 'specification-archetype/feature.yaml',
      kind: 'specification-archetype',
      code: 'reference-missing',
      severity: 'error',
      message: 'Template "runbook" uses the unknown document type "runbook".',
      location: '/templates/1/documentType',
    };
    const withProblems = (problems: unknown[]) => ({
      ...catalogue,
      problems,
      problemsTruncated: true,
    });
    expect(Value.Check(ArchetypeCatalogueSchema, withProblems([problem]))).toBe(true);
    expect(
      Value.Check(ArchetypeCatalogueSchema, withProblems([{ ...problem, code: 'nope' }])),
    ).toBe(false);
    expect(
      Value.Check(
        ArchetypeCatalogueSchema,
        withProblems([
          { ...problem, message: 'x'.repeat(DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH + 1) },
        ]),
      ),
    ).toBe(false);
    expect(
      Value.Check(
        ArchetypeCatalogueSchema,
        withProblems(Array.from({ length: DEFINITION_PROBLEMS_MAX + 1 }, () => problem)),
      ),
    ).toBe(false);
    expect(
      Value.Check(ArchetypeCatalogueSchema, withProblems([{ ...problem, severity: 'info' }])),
    ).toBe(false);
    expect([...DEFINITION_PROBLEM_CODES]).toHaveLength(17);
  });

  it('accepts the new error details and rejects loose ones', () => {
    const body = (code: string, details: unknown) => ({ error: code, code, details });
    expect(
      Value.Check(
        DocumentErrorSchema,
        body('SPEC_BUSY', { reason: 'busy', cause: 'queue-full', retryAfterMs: 500 }),
      ),
    ).toBe(true);
    expect(
      Value.Check(
        DocumentErrorSchema,
        body('DOCUMENT_REVISION_CONFLICT', {
          conflicts: [{ documentId: 'behaviour', revision: 'h9' }],
        }),
      ),
    ).toBe(true);
    expect(
      Value.Check(
        DocumentErrorSchema,
        body('DOCUMENT_COMMITS_PENDING', { cause: 'commit-failed' }),
      ),
    ).toBe(true);
    expect(
      Value.Check(DocumentErrorSchema, body('DOCUMENT_WRITE_FAILED', { cause: 'no-space' })),
    ).toBe(true);
    expect(
      Value.Check(DocumentErrorSchema, body('SPEC_BUSY', { conflicts: [{ documentId: 'b' }] })),
    ).toBe(false);
    expect(Value.Check(DocumentErrorSchema, body('SPEC_BUSY', { retryAfterMs: -1 }))).toBe(false);
    expect(
      Value.Check(
        DocumentErrorSchema,
        body('DOCUMENT_REVISION_CONFLICT', {
          conflicts: Array.from({ length: REVISION_CONFLICTS_MAX + 1 }, () => ({
            documentId: 'a',
            revision: 'h',
          })),
        }),
      ),
    ).toBe(false);
    // `reason` stays the ActionReason vocabulary only.
    expect(
      Value.Check(
        DocumentErrorSchema,
        body('DOCUMENT_COMMITS_PENDING', { reason: 'commit-pending' }),
      ),
    ).toBe(false);
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
      'DEFINITIONS_MISSING',
      'DOCUMENT_COMMITS_PENDING',
      'DOCUMENT_OPERATION_NOT_FOUND',
      'DOCUMENT_OPERATION_STATE_INVALID',
      'DOCUMENT_WRITE_FAILED',
      'DOCUMENT_UNCOMMITTED_LIMIT',
      'MANUAL_COMMIT_UNAVAILABLE',
      'MANUAL_COMMIT_CONFLICT',
      'MANUAL_COMMIT_SUBSET_INVALID',
      'MANUAL_COMMIT_STALE',
      'MANUAL_COMMIT_MESSAGE_INVALID',
      'MANUAL_COMMIT_RECOVERY_REQUIRED',
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
    expect(Value.Check(ActionSchema, { available: false, reason: 'not-implemented' })).toBe(false);
    expect(
      Value.Check(ActionSchema, { available: false, reason: 'busy', retryAfterMs: 1000 }),
    ).toBe(true);
    expect(Value.Check(ActionSchema, { available: false, reason: 'busy', retryAfterMs: -1 })).toBe(
      false,
    );
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

describe('closed vocabularies are usable as types', () => {
  it('exposes the literal unions, not never', () => {
    expectTypeOf<ContentKind>().toEqualTypeOf<'text' | 'image' | 'binary'>();
    expectTypeOf<Classification>().toEqualTypeOf<'registered' | 'unclassified'>();
    expectTypeOf<TemplateInclude>().toEqualTypeOf<'always' | 'optional'>();
    expectTypeOf<'protected'>().toExtend<ActionReason>();
    expectTypeOf<'dangling'>().toExtend<DocumentIssueCode>();
    expectTypeOf<ActionReason>().not.toBeNever();
    expectTypeOf<Static<typeof DocumentTreeSchema>['issues'][number]['code']>().not.toBeNever();
    expectTypeOf<Static<typeof ActionSchema>['reason']>().toEqualTypeOf<ActionReason | undefined>();
    expectTypeOf<DocumentIssueCode>().not.toBeNever();
  });
});
