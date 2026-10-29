import {
  ACTION_REASONS,
  COMMIT_FAILURE_REASONS,
  COMMIT_STATES,
  CommitInfoSchema,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_OPERATION_STATUS_ACTIONS,
  DocumentErrorSchema,
  type DocumentErrorCode,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { SharedResourceError, overlaps } from '../../durable/claims';
import * as createLimits from '../../create/limits';
import { DocumentError } from '../../document-rules';
import {
  COMMIT_STATE_OF_STAGE,
  RECOVERY_REQUIRED_BY_FAILURE_REASON,
  commitInfoOfJournal,
} from './commit-info';
import {
  assertDocumentChangeClaimsAvailable,
  documentChangeHoldsClaim,
  resourcesForDocumentChange,
} from './claims';
import { DOCUMENT_CHANGE_CAUSES, DOCUMENT_CHANGE_ERROR_MAP, documentChangeError } from './errors';
import { fingerprintDocumentChange } from './fingerprint';
import { classifyBatchPath, decideBatchReplay, inspectBatchPaths } from './inspection';
import { DOCUMENT_CHANGE_STAGES } from './journal/stages';
import * as limits from './limits';
import { DOCUMENT_CHANGE_ACTIONS, type DocumentChangeRequest, type FileState } from './plan';
import { TEST_WORKSPACE_ID, buildJournal } from './test-support';
import { sha256Hex } from '../../../hash';

describe('limits', () => {
  it('mirrors the documented table', () => {
    expect(limits.DOCUMENT_JOURNAL_MAX_BYTES).toBe(32 * 1024);
    expect(limits.DOCUMENT_BATCH_RECORD_MAX_BYTES).toBe(64 * 1024);
    expect(limits.DOCUMENT_BATCH_MAX_OPERATIONS).toBe(50);
    expect(limits.DOCUMENT_BATCH_MAX_PATHS).toBe(200);
    expect(limits.DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT).toBe(200);
    expect(limits.BATCH_SAVE_MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024);
  });

  it('uses the Create caps for created documents', () => {
    expect(limits.CREATE_DOCUMENTS_MAX_FILES).toBe(createLimits.ADDED_DOCUMENTS_MAX_FILES);
    expect(limits.CREATE_DOCUMENTS_MAX_FOLDERS).toBe(createLimits.ADDED_DOCUMENTS_MAX_FOLDERS);
    expect(limits.CREATE_DOCUMENTS_MAX_TOTAL_BYTES).toBe(
      createLimits.ADDED_DOCUMENTS_MAX_TOTAL_BYTES,
    );
  });

  it('lets one queued operation per batch slot fit the checkout queue', () => {
    expect(limits.DOCUMENT_BATCH_MAX_OPERATIONS).toBeLessThan(
      limits.DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT,
    );
  });
});

describe('actions', () => {
  it('are the contract status vocabulary without the manual commit, which has a journal of its own', () => {
    expect([...DOCUMENT_CHANGE_ACTIONS]).toEqual(
      DOCUMENT_OPERATION_STATUS_ACTIONS.filter((action) => action !== 'manual-commit'),
    );
  });
});

describe('error map', () => {
  it('maps every cause to a contract code, and only valid reasons', () => {
    expect(Object.keys(DOCUMENT_CHANGE_ERROR_MAP).sort()).toEqual(
      [...DOCUMENT_CHANGE_CAUSES].sort(),
    );
    for (const cause of DOCUMENT_CHANGE_CAUSES) {
      const mapping: { code: DocumentErrorCode; reason?: string } =
        DOCUMENT_CHANGE_ERROR_MAP[cause];
      expect(DOCUMENT_ERROR_CODES).toContain(mapping.code);
      if (mapping.reason !== undefined) {
        expect(ACTION_REASONS as readonly string[]).toContain(mapping.reason);
      }
    }
  });

  it('can emit every code the write path owns', () => {
    const emitted = new Set(
      DOCUMENT_CHANGE_CAUSES.map((cause) => DOCUMENT_CHANGE_ERROR_MAP[cause].code),
    );
    for (const code of [
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
      'DOCUMENT_COMMITS_PENDING',
      'DOCUMENT_OPERATION_NOT_FOUND',
      'DOCUMENT_OPERATION_STATE_INVALID',
      'DOCUMENT_WRITE_FAILED',
      'CATALOGUE_STALE',
    ] as const) {
      expect(emitted.has(code), code).toBe(true);
    }
  });

  it('builds errors whose body is a valid contract error', () => {
    const error = documentChangeError('busy-queue-full', 'The queue is full.', {
      retryAfterMs: 500,
    });
    expect(error).toBeInstanceOf(DocumentError);
    expect(error.code).toBe('SPEC_BUSY');
    expect(error.details).toEqual({ reason: 'busy', cause: 'queue-full', retryAfterMs: 500 });
    expect(
      Value.Check(DocumentErrorSchema, {
        error: error.code,
        code: error.code,
        details: error.details,
      }),
    ).toBe(true);
    const conflict = documentChangeError('revision-conflict', 'x', {
      conflicts: [{ documentId: 'a', revision: 'r' }],
    });
    expect(conflict.details).toEqual({ conflicts: [{ documentId: 'a', revision: 'r' }] });
    expect(documentChangeError('path-invalid', 'x').details).toBeUndefined();
    expect(
      documentChangeError('commit-blocked', 'x', { blockedBy: 'index-locked' }).details,
    ).toEqual({
      reason: 'commit-blocked',
      blockedBy: 'index-locked',
    });
  });
});

describe('fingerprint', () => {
  const save: DocumentChangeRequest = {
    action: 'save',
    documentId: 'behaviour',
    content: 'text',
    expectedRevision: 'rev',
  };
  const create: DocumentChangeRequest = {
    action: 'create',
    documents: [{ path: 'a.md', type: 'behaviour', content: 'x' }],
    folders: ['f'],
  };
  const requests: DocumentChangeRequest[] = [
    save,
    { action: 'save-all', documents: [{ documentId: 'a', content: 'x', expectedRevision: 'r' }] },
    create,
    { action: 'folder', path: 'notes' },
    {
      action: 'rename',
      target: { kind: 'document', documentId: 'a' },
      name: 'b.md',
      expectedRevision: 'r',
    },
    {
      action: 'move',
      target: { kind: 'folder', path: 'a' },
      targetFolder: 'b',
      expectedRevision: 'r',
    },
    { action: 'delete', target: { kind: 'document', documentId: 'a' }, expectedRevision: 'r' },
    { action: 'classify', documentId: 'u-1', type: 'notes', expectedRevision: 'r' },
  ];

  it('is a stable sha256 and differs between actions', () => {
    const all = requests.map(fingerprintDocumentChange);
    expect(all.every((value) => /^[0-9a-f]{64}$/u.test(value))).toBe(true);
    expect(new Set(all).size).toBe(requests.length);
    expect(fingerprintDocumentChange(save)).toBe(fingerprintDocumentChange({ ...save }));
  });

  it('covers every action', () => {
    expect(new Set(requests.map((request) => request.action))).toEqual(
      new Set(DOCUMENT_CHANGE_ACTIONS),
    );
  });

  it.each([
    ['save documentId', { ...save, documentId: 'other' }],
    ['save content', { ...save, content: 'other' }],
    ['save expectedRevision', { ...save, expectedRevision: 'other' }],
    ['create path', { ...create, documents: [{ path: 'b.md', type: 'behaviour', content: 'x' }] }],
    ['create type', { ...create, documents: [{ path: 'a.md', type: 'notes', content: 'x' }] }],
    ['create no type', { ...create, documents: [{ path: 'a.md', content: 'x' }] }],
    [
      'create content',
      { ...create, documents: [{ path: 'a.md', type: 'behaviour', content: 'y' }] },
    ],
    [
      'create template id',
      {
        ...create,
        documents: [{ path: 'a.md', type: 'behaviour', content: 'x', templateId: 't' }],
      },
    ],
    ['create folders', { ...create, folders: ['g'] }],
  ] as const)('changes with %s', (_name, changed) => {
    expect(fingerprintDocumentChange(changed as DocumentChangeRequest)).not.toBe(
      fingerprintDocumentChange(_name.startsWith('save') ? save : create),
    );
  });

  it('changes with every field of the structural actions', () => {
    const base = {
      action: 'move',
      target: { kind: 'document', documentId: 'a' },
      targetFolder: 'b',
      expectedRevision: 'r',
    } as const;
    const variants: DocumentChangeRequest[] = [
      { ...base, target: { kind: 'document', documentId: 'z' } },
      { ...base, target: { kind: 'folder', path: 'a' } },
      { ...base, targetFolder: 'c' },
      { ...base, expectedRevision: 's' },
      { action: 'rename', target: base.target, name: 'b', expectedRevision: 'r' },
    ];
    const seen = new Set([fingerprintDocumentChange(base)]);
    for (const variant of variants) {
      seen.add(fingerprintDocumentChange(variant));
    }

    expect(seen.size).toBe(variants.length + 1);
  });

  it('ignores the order of a batch save and the catalogue revision, keeps the order of a create', () => {
    const a = { documentId: 'a', content: 'x', expectedRevision: 'r' };
    const b = { documentId: 'b', content: 'y', expectedRevision: 's' };
    expect(fingerprintDocumentChange({ action: 'save-all', documents: [a, b] })).toBe(
      fingerprintDocumentChange({ action: 'save-all', documents: [b, a] }),
    );
    expect(fingerprintDocumentChange({ ...create, catalogueRevision: 'one' })).toBe(
      fingerprintDocumentChange({ ...create, catalogueRevision: 'two' }),
    );
    const first = { path: 'a.md', content: 'x' };
    const second = { path: 'b.md', content: 'y' };
    expect(
      fingerprintDocumentChange({ action: 'create', documents: [first, second], folders: [] }),
    ).not.toBe(
      fingerprintDocumentChange({ action: 'create', documents: [second, first], folders: [] }),
    );
    expect(
      fingerprintDocumentChange({ action: 'create', documents: [], folders: ['b', 'a', 'a'] }),
    ).toBe(fingerprintDocumentChange({ action: 'create', documents: [], folders: ['a', 'b'] }));
  });

  it('identifies a template entry by the template, so a replay without the rendering matches', () => {
    const entry = { path: 'a.md', type: 'behaviour', templateId: 'tpl' };
    expect(
      fingerprintDocumentChange({
        action: 'create',
        documents: [{ ...entry, content: 'rendered 1' }],
        folders: [],
      }),
    ).toBe(
      fingerprintDocumentChange({
        action: 'create',
        documents: [{ ...entry, content: 'rendered 2' }],
        folders: [],
      }),
    );
  });
});

describe('claims', () => {
  const journal = buildJournal('queued');

  it('claims the scoped checkout resource only, for an operation and for its batch', () => {
    expect(resourcesForDocumentChange(journal)).toEqual([`checkout-scoped:${TEST_WORKSPACE_ID}`]);
  });

  it('coexists with other document operations and with Create, and excludes Close', () => {
    const mine = resourcesForDocumentChange(journal);
    expect(overlaps(mine, mine)).toBe(false);
    expect(overlaps(mine, ['spec:x', `checkout-scoped:${TEST_WORKSPACE_ID}`])).toBe(false);
    expect(overlaps(mine, [`checkout:${TEST_WORKSPACE_ID}`])).toBe(true);
    expect(overlaps([`checkout:${TEST_WORKSPACE_ID}`], mine)).toBe(true);
    expect(overlaps(mine, ['checkout:11111111-1111-4111-8111-111111111111'])).toBe(false);
  });

  it('conflicts only with stages that hold the claim', () => {
    const close = [`checkout:${TEST_WORKSPACE_ID}`];
    for (const stage of DOCUMENT_CHANGE_STAGES) {
      const record = buildJournal(stage);
      const run = () => assertDocumentChangeClaimsAvailable([record], close, undefined);
      if (documentChangeHoldsClaim(record)) {
        expect(run, stage).toThrow(SharedResourceError);
      } else {
        expect(run, stage).not.toThrow();
      }
    }

    expect(
      DOCUMENT_CHANGE_STAGES.filter((stage) => documentChangeHoldsClaim({ stage })).sort(),
    ).toEqual([
      'commit-failed',
      'committing',
      'files-writing',
      'queued',
      'recovery-required',
      'reserved',
    ]);
  });

  it('never conflicts with itself or with a request for the scoped resource', () => {
    expect(() =>
      assertDocumentChangeClaimsAvailable([journal], [`checkout:${TEST_WORKSPACE_ID}`], {
        kind: 'document-change',
        operationId: journal.operationId,
      }),
    ).not.toThrow();
    expect(() =>
      assertDocumentChangeClaimsAvailable(
        [journal],
        resourcesForDocumentChange(journal),
        undefined,
      ),
    ).not.toThrow();
  });
});

describe('commit info', () => {
  const now = Date.parse('2026-10-24T10:00:30.000Z');

  it('derives a contract-valid state for every stage', () => {
    for (const stage of DOCUMENT_CHANGE_STAGES) {
      const info = commitInfoOfJournal(buildJournal(stage), now);
      expect(Value.Check(CommitInfoSchema, info), stage).toBe(true);
      expect(COMMIT_STATES as readonly string[]).toContain(info.state);
    }
  });

  it('maps the stages to the documented states', () => {
    const state = (stage: (typeof DOCUMENT_CHANGE_STAGES)[number], overrides = {}) =>
      commitInfoOfJournal(buildJournal(stage, overrides), now).state;
    expect(Object.keys(COMMIT_STATE_OF_STAGE).sort()).toEqual([...DOCUMENT_CHANGE_STAGES].sort());
    expect(state('reserved')).toBe('pending');
    expect(state('queued')).toBe('pending');
    expect(state('committing')).toBe('pending');
    expect(state('commit-failed')).toBe('failed');
    expect(state('recovery-required')).toBe('failed');
    expect(
      state('completed', { outcome: 'uncommitted', reason: 'abandoned', sha: undefined }),
    ).toBe('uncommitted');
    expect(state('completed')).toBe('committed');
    expect(
      state('completed', {
        outcome: 'not-applicable',
        reason: 'git-disabled',
        sha: undefined,
        commit: undefined,
      }),
    ).toBe('not-applicable');
  });

  it('reports waiting, retry timing, overdue and recovery', () => {
    expect(commitInfoOfJournal(buildJournal('reserved'), now).reason).toBe('writing');
    const queued = commitInfoOfJournal(
      buildJournal('queued', {
        attempts: 2,
        reason: 'git-busy',
        nextAttemptAt: '2026-10-24T10:01:00.000Z',
      }),
      now,
    );
    expect(queued).toMatchObject({
      attempts: 2,
      reason: 'git-busy',
      nextAttemptAt: '2026-10-24T10:01:00.000Z',
      overdue: false,
    });
    expect(
      commitInfoOfJournal(buildJournal('queued'), Date.parse('2026-10-24T10:06:00.000Z')).overdue,
    ).toBe(true);
    expect(commitInfoOfJournal(buildJournal('recovery-required'), now).recoveryRequired).toBe(true);
    expect(
      commitInfoOfJournal(buildJournal('commit-failed'), now).recoveryRequired,
    ).toBeUndefined();
    expect(commitInfoOfJournal(buildJournal('commit-failed'), now).attempts).toBeUndefined();
  });

  it('knows which failure reasons need the operator', () => {
    expect(Object.keys(RECOVERY_REQUIRED_BY_FAILURE_REASON).sort()).toEqual(
      [...COMMIT_FAILURE_REASONS].sort(),
    );
    expect(
      COMMIT_FAILURE_REASONS.filter((reason) => RECOVERY_REQUIRED_BY_FAILURE_REASON[reason]).sort(),
    ).toEqual(['history-changed', 'uncertain']);
  });
});

describe('per-path inspection', () => {
  const state = (content: string): FileState => ({
    sha256: sha256Hex(content),
    bytes: content.length,
  });
  const expectation = { path: 'p', pre: state('before'), post: state('after') };
  const classify = (working: FileState, headHoldsPost = false) =>
    classifyBatchPath({ path: 'p', working, headHoldsPost }, expectation);

  it('judges a path against its recorded states', () => {
    expect(classify(state('after'))).toBe('at-post');
    expect(classify(state('before'))).toBe('at-pre');
    expect(classify(state('someone else'))).toBe('foreign');
    expect(classify(null)).toBe('foreign');
    expect(classify(state('after'), true)).toBe('committed');
    // A later edit does not undo the fact that HEAD already holds the batch result.
    expect(classify(state('someone else'), true)).toBe('committed');
  });

  it('judges deletions and creations', () => {
    const removed = { path: 'p', pre: state('before'), post: null };
    expect(classifyBatchPath({ path: 'p', working: null, headHoldsPost: false }, removed)).toBe(
      'at-post',
    );
    expect(
      classifyBatchPath({ path: 'p', working: state('before'), headHoldsPost: false }, removed),
    ).toBe('at-pre');
    const created = { path: 'p', pre: null, post: state('after') };
    expect(classifyBatchPath({ path: 'p', working: null, headHoldsPost: false }, created)).toBe(
      'at-pre',
    );
  });

  it('decides what a whole batch means for a replay', () => {
    const other = { path: 'q', pre: state('x'), post: state('y') };
    const inspect = (observed: [FileState, boolean][]) =>
      decideBatchReplay(
        inspectBatchPaths(
          observed.map(([working, headHoldsPost], index) => ({
            path: index === 0 ? 'p' : 'q',
            working,
            headHoldsPost,
          })),
          [expectation, other],
        ),
      );
    expect(
      inspect([
        [state('after'), true],
        [state('y'), true],
      ]),
    ).toBe('done');
    expect(
      inspect([
        [state('after'), false],
        [state('x'), false],
      ]),
    ).toBe('pending');
    expect(
      inspect([
        [state('after'), true],
        [state('x'), false],
      ]),
    ).toBe('recovery-required');
    expect(
      inspect([
        [state('zzz'), false],
        [state('x'), false],
      ]),
    ).toBe('recovery-required');
  });

  it('refuses to judge a path nobody observed', () => {
    expect(() => inspectBatchPaths([], [expectation])).toThrow();
  });
});
