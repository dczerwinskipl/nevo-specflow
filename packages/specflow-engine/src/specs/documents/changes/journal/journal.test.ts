import { describe, expect, it } from 'vitest';

import { classifyJournalText } from '../../../durable/unsupported';
import { DocumentError } from '../../../document-rules';
import { DOCUMENT_JOURNAL_MAX_BYTES } from '../limits';
import {
  TEST_BATCH_ID,
  TEST_CONTEXT,
  TEST_EXECUTOR,
  TEST_LATER,
  TEST_NOW,
  TEST_OPERATION_ID,
  buildJournal,
} from '../test-support';
import {
  encodeDocumentChangeJournal,
  parseDocumentChangeJournal,
  type DocumentChangeJournal,
} from './index';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from './kind';
import {
  DOCUMENT_CHANGE_STAGES,
  DOCUMENT_CHANGE_TRANSITIONS,
  type DocumentChangeStage,
} from './stages';
import { transitionDocumentChange, type DocumentChangeTransitionPatch } from './transition';

function parse(value: unknown, operationId = TEST_OPERATION_ID): DocumentChangeJournal {
  return parseDocumentChangeJournal(TEST_CONTEXT, value, operationId);
}

function rejection(value: unknown): DocumentError {
  try {
    parse(value);
  } catch (error) {
    if (error instanceof DocumentError) return error;
    throw error;
  }
  throw new Error('expected the journal to be rejected');
}

describe('journal codec', () => {
  it.each(DOCUMENT_CHANGE_STAGES)('round-trips a valid journal in stage %s', (stage) => {
    const journal = buildJournal(stage);
    const text = encodeDocumentChangeJournal(TEST_CONTEXT, journal);
    expect(parse(JSON.parse(text))).toEqual(journal);
  });

  it('classifies an unparsable file as unsupported, like Create does', () => {
    expect(classifyJournalText('not json').kind).toBe('unsupported');
    expect(classifyJournalText(JSON.stringify(buildJournal('queued'))).kind).toBe('current');
  });

  it('answers a corrupt current-format file and an unsupported one with distinct recovery causes', () => {
    expect(rejection({ ...buildJournal('queued'), extra: 1 }).details?.cause).toBe(
      'journal-corrupt',
    );
    const unsupported = DOCUMENT_CHANGE_JOURNAL_KIND.errors.unsupported() as DocumentError;
    expect(unsupported.code).toBe('DOCUMENT_RECOVERY_REQUIRED');
    expect(unsupported.details?.cause).toBe('journal-unsupported');
    expect((DOCUMENT_CHANGE_JOURNAL_KIND.errors.invalidOperationId() as DocumentError).code).toBe(
      'DOCUMENT_OPERATION_INVALID',
    );
  });

  it.each([
    ['an unknown key', { extra: true }],
    ['another version', { version: 2 }],
    ['another project', { projectId: '11111111-1111-4111-8111-111111111111' }],
    ['another operation id', { operationId: '11111111-1111-4111-8111-111111111111' }],
    ['a bad fingerprint', { inputFingerprint: 'xyz' }],
    ['a zero sequence', { sequence: 0 }],
    ['a fractional sequence', { sequence: 1.5 }],
    ['an unknown action', { action: 'publish' }],
    ['an unknown stage', { stage: 'done' }],
    ['a bad slug', { slug: 'Not A Slug' }],
    ['a bad date', { updatedAt: 'yesterday' }],
    ['negative attempts', { attempts: -1 }],
    [
      'a plan with too many paths',
      { plan: { sha256: 'd'.repeat(64), bytes: 1, pathCount: 201, documentCount: 1 } },
    ],
    [
      'a plan with an extra key',
      { plan: { sha256: 'd'.repeat(64), bytes: 1, pathCount: 1, documentCount: 1, x: 1 } },
    ],
    ['an empty branch', { commit: { branch: '' } }],
    ['a non kebab reason', { reason: 'Not Kebab' }],
  ])('rejects %s', (_name, patch) => {
    expect(rejection({ ...buildJournal('queued'), ...patch }).code).toBe(
      'DOCUMENT_RECOVERY_REQUIRED',
    );
  });

  it('pins the commit mode: auto carries its branch, manual never queues and has none', () => {
    const manual = buildJournal('files-writing', { commit: undefined, commitMode: 'manual' });
    expect(parse(JSON.parse(JSON.stringify(manual)))).toEqual(manual);
    const auto = buildJournal('queued', { commitMode: 'auto' });
    expect(parse(JSON.parse(JSON.stringify(auto)))).toEqual(auto);
    for (const bad of [
      buildJournal('queued', { commitMode: 'auto', commit: undefined }),
      buildJournal('files-writing', { commitMode: 'manual' }),
      buildJournal('queued', { commit: undefined, commitMode: 'manual' }),
      buildJournal('commit-failed', { commit: undefined, commitMode: 'manual' }),
      buildJournal('queued', { commitMode: 'sometimes' }),
    ]) {
      expect(rejection(bad).code).toBe('DOCUMENT_RECOVERY_REQUIRED');
    }
  });

  it('completes uncommitted only with a ledger reason and without a commit', () => {
    const completed = (patch: Record<string, unknown>) =>
      buildJournal('completed', {
        outcome: 'uncommitted',
        sha: undefined,
        reason: 'auto-commit-off',
        ...patch,
      });
    for (const reason of ['auto-commit-off', 'abandoned']) {
      const journal = completed({ reason });
      expect(parse(JSON.parse(JSON.stringify(journal)))).toEqual(journal);
    }
    for (const bad of [
      completed({ reason: undefined }),
      completed({ reason: 'git-disabled' }),
      completed({ sha: 'b'.repeat(40) }),
    ]) {
      expect(rejection(bad).code).toBe('DOCUMENT_RECOVERY_REQUIRED');
    }
  });

  it('rejects a journal whose fields do not fit its stage', () => {
    const stage = (name: DocumentChangeStage, patch: Record<string, unknown>) => ({
      ...buildJournal(name),
      ...patch,
    });
    const cases: unknown[] = [
      // the writer exists only while writing
      stage('queued', { executor: TEST_EXECUTOR }),
      { ...buildJournal('reserved'), executor: undefined },
      // an acknowledgement time exists from `queued` on
      stage('reserved', { queuedAt: TEST_NOW }),
      { ...buildJournal('queued'), queuedAt: undefined },
      // a queued operation has no batch; a committing one must
      stage('queued', { batchId: TEST_BATCH_ID }),
      { ...buildJournal('committing'), batchId: undefined },
      { ...buildJournal('committing'), commit: undefined },
      // retry timing only while queued
      stage('committing', { nextAttemptAt: TEST_LATER }),
      // failures need a reason; a blocker needs a reason
      { ...buildJournal('commit-failed'), reason: undefined },
      { ...buildJournal('failed'), reason: undefined },
      stage('queued', { blockedBy: 'index-locked' }),
      // recovery needs its phase, and only recovery has one
      { ...buildJournal('recovery-required'), recoveryPhase: undefined },
      stage('queued', { recoveryPhase: 'write' }),
      stage('recovery-required', { recoveryPhase: 'later' }),
      // a settlement needs an outcome, a sha, a time and the commit it names
      { ...buildJournal('completed'), outcome: undefined },
      { ...buildJournal('completed'), sha: undefined },
      { ...buildJournal('completed'), settledAt: undefined },
      { ...buildJournal('completed'), commit: undefined },
      stage('completed', { outcome: 'not-applicable', reason: undefined, sha: undefined }),
      stage('completed', { outcome: 'not-applicable', reason: 'git-disabled' }),
      stage('queued', { sha: 'b'.repeat(40) }),
      stage('queued', { outcome: 'committed' }),
      stage('queued', { coalescedWith: 1 }),
    ];
    for (const value of cases) {
      expect(() => parse(value)).toThrow(DocumentError);
    }
  });

  it('accepts a completion without a commit when Git was disabled', () => {
    const journal = buildJournal('completed', {
      outcome: 'not-applicable',
      reason: 'git-disabled',
      sha: undefined,
      commit: undefined,
    });
    expect(parse(JSON.parse(JSON.stringify(journal))).outcome).toBe('not-applicable');
  });

  it('keeps the worst case journal far below its cap whatever the operation touches', () => {
    const worst = buildJournal('completed', {
      workspaceRoot: 'w'.repeat(1024),
      commit: { branch: 'b'.repeat(240) },
      plan: {
        sha256: 'd'.repeat(64),
        bytes: Number.MAX_SAFE_INTEGER,
        pathCount: 200,
        documentCount: 200,
      },
      reason: 'r'.repeat(64),
      blockedBy: 'b'.repeat(64),
      coalescedWith: 49,
      batchId: TEST_BATCH_ID,
    });
    const size = Buffer.byteLength(encodeDocumentChangeJournal(TEST_CONTEXT, worst), 'utf8');
    expect(size).toBeLessThan(DOCUMENT_JOURNAL_MAX_BYTES / 4);
  });

  it('refuses to encode a journal over the cap', () => {
    // The cap is checked on the serialised record; a record padded past it never decodes.
    const padded = {
      ...buildJournal('queued'),
      workspaceRoot: 'w'.repeat(DOCUMENT_JOURNAL_MAX_BYTES),
    };
    expect(() => encodeDocumentChangeJournal(TEST_CONTEXT, padded)).toThrow(DocumentError);
  });

  it('marks only the retention-deletable stages as settled for the durable store', () => {
    const settled = DOCUMENT_CHANGE_STAGES.filter((stage) =>
      DOCUMENT_CHANGE_JOURNAL_KIND.isSettled(buildJournal(stage)),
    );
    expect(settled.sort()).toEqual(['completed', 'failed']);
    expect(DOCUMENT_CHANGE_JOURNAL_KIND.relativeDir).toBe('engine/operations/documents');
    expect(DOCUMENT_CHANGE_JOURNAL_KIND.maxBytes).toBe(DOCUMENT_JOURNAL_MAX_BYTES);
  });
});

/** A patch that makes each legal transition decode; the table tells which transitions exist. */
function patchFor(
  from: DocumentChangeStage,
  to: DocumentChangeStage,
): DocumentChangeTransitionPatch {
  switch (to) {
    case 'reserved':
    case 'files-writing':
      return { executor: TEST_EXECUTOR };
    case 'queued':
      return from === 'committing'
        ? { attempts: 1, reason: 'git-busy', nextAttemptAt: TEST_LATER }
        : {};
    case 'committing':
      return { batchId: TEST_BATCH_ID };
    case 'completed':
      if (from === 'queued') return { outcome: 'not-applicable', reason: 'git-disabled' };
      if (from === 'files-writing') return { outcome: 'uncommitted', reason: 'auto-commit-off' };
      return { outcome: 'committed', sha: 'b'.repeat(40) };
    case 'failed':
    case 'commit-failed':
      return { reason: 'content-changed' };
    case 'recovery-required':
      return { reason: 'uncertain', recoveryPhase: from === 'reserved' ? 'write' : 'commit' };
  }
}

describe('transitionDocumentChange', () => {
  it('moves along every legal transition and returns a journal that decodes', () => {
    for (const from of DOCUMENT_CHANGE_STAGES) {
      for (const to of DOCUMENT_CHANGE_TRANSITIONS[from]) {
        // `committed`/`not-applicable` completions of a Git-disabled journal carry no commit.
        const journal = buildJournal(from);
        const patch = patchFor(from, to);
        const source =
          to === 'completed' && patch.outcome === 'not-applicable' && from === 'queued'
            ? { ...journal, commit: undefined }
            : journal;
        const next = transitionDocumentChange(source, to, patch, TEST_LATER);
        expect(next.stage, `${from} -> ${to}`).toBe(to);
        expect(next.updatedAt).toBe(TEST_LATER);
        expect(parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
      }
    }
  });

  it('refuses every illegal transition and leaves the input untouched', () => {
    for (const from of DOCUMENT_CHANGE_STAGES) {
      for (const to of DOCUMENT_CHANGE_STAGES) {
        if ((DOCUMENT_CHANGE_TRANSITIONS[from] as readonly DocumentChangeStage[]).includes(to)) {
          continue;
        }
        const journal = buildJournal(from);
        const snapshot = JSON.stringify(journal);
        expect(() => transitionDocumentChange(journal, to, patchFor(from, to), TEST_LATER)).toThrow(
          DocumentError,
        );
        expect(JSON.stringify(journal)).toBe(snapshot);
      }
    }
  });

  it('records the acknowledgement once and drops the writer and the stage facts', () => {
    const written = transitionDocumentChange(
      buildJournal('reserved'),
      'files-writing',
      {},
      TEST_NOW,
    );
    expect(written.executor).toEqual(TEST_EXECUTOR);
    const queued = transitionDocumentChange(written, 'queued', {}, TEST_LATER);
    expect(queued.executor).toBeUndefined();
    expect(queued.queuedAt).toBe(TEST_LATER);
    const committing = transitionDocumentChange(
      queued,
      'committing',
      { batchId: TEST_BATCH_ID },
      TEST_LATER,
    );
    // A transient blocker goes back to queued: the batch id leaves, the acknowledgement stays.
    const again = transitionDocumentChange(
      committing,
      'queued',
      {
        attempts: 1,
        reason: 'index-locked',
        blockedBy: 'index-locked',
        nextAttemptAt: '2026-10-24T10:00:06.000Z',
      },
      '2026-10-24T10:00:06.000Z',
    );
    expect(again.queuedAt).toBe(TEST_LATER);
    expect(again.batchId).toBeUndefined();
    expect(again.attempts).toBe(1);
    // The reason is a fact of one stage: a later transition does not inherit it.
    const retried = transitionDocumentChange(
      again,
      'committing',
      { batchId: TEST_BATCH_ID },
      TEST_LATER,
    );
    expect(retried.reason).toBeUndefined();
    expect(retried.nextAttemptAt).toBeUndefined();
    expect(retried.attempts).toBe(1);
  });

  it('hands a write to a new executor, from files-writing and from a write-phase recovery', () => {
    const next = { ...TEST_EXECUTOR, pid: 777, processStartTime: '99' };
    const taken = transitionDocumentChange(
      buildJournal('files-writing'),
      'files-writing',
      { executor: next },
      TEST_LATER,
    );
    expect(taken).toMatchObject({ stage: 'files-writing', executor: next, updatedAt: TEST_LATER });
    const resumed = transitionDocumentChange(
      buildJournal('recovery-required', { recoveryPhase: 'write', reason: 'write-io-error' }),
      'files-writing',
      { executor: next },
      TEST_LATER,
    );
    expect(resumed.executor).toEqual(next);
    expect(resumed.recoveryPhase).toBeUndefined();
    expect(resumed.reason).toBeUndefined();
  });

  it('refuses a failure without a reason from files-writing and drops the writer', () => {
    const failed = transitionDocumentChange(
      buildJournal('files-writing'),
      'failed',
      { reason: 'revision-conflict' },
      TEST_LATER,
    );
    expect(failed.executor).toBeUndefined();
    expect(() =>
      transitionDocumentChange(buildJournal('files-writing'), 'failed', {}, TEST_LATER),
    ).toThrow(DocumentError);
  });

  it('settles with the time of the transition and the commit it names', () => {
    const done = transitionDocumentChange(
      buildJournal('committing'),
      'completed',
      { outcome: 'committed', sha: 'b'.repeat(40), coalescedWith: 2 },
      TEST_LATER,
    );
    expect(done).toMatchObject({
      stage: 'completed',
      settledAt: TEST_LATER,
      coalescedWith: 2,
      batchId: TEST_BATCH_ID,
    });
  });

  it('refuses a result that would not decode, for example a failure without a reason', () => {
    expect(() =>
      transitionDocumentChange(buildJournal('committing'), 'commit-failed', {}, TEST_LATER),
    ).toThrow(DocumentError);
  });
});
