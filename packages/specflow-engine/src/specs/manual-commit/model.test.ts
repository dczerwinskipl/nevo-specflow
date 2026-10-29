import { describe, expect, it } from 'vitest';

import { MANUAL_COMMIT_ERROR_MAP, MANUAL_COMMIT_CAUSES, manualCommitError } from './errors';
import { DOCUMENT_ERROR_CODES } from '@nevo/specflow-contracts/documents';
import { parseManualCommitJournal } from './codec';
import {
  MANUAL_COMMIT_JOURNAL_VERSION,
  MANUAL_COMMIT_STAGES,
  MANUAL_COMMIT_STAGE_FACTS,
  MANUAL_COMMIT_TRANSITIONS,
  canTransitionManualCommit,
  type ManualCommitJournal,
} from './model';
import { transitionManualCommit } from './transition';

const PROJECT = { project: { projectId: 'project-1' } };
const ID = '3f2b8c1e-5a7d-4e90-8b6a-1c2d3e4f5a6b';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const SHA = 'f'.repeat(40);
const HASH = 'a'.repeat(64);
const NOW = '2026-10-27T10:00:00.000Z';
const LATER = '2026-10-27T10:00:05.000Z';
const EXECUTOR = { pid: 4242, hostId: 'host-1' };

const reserved: ManualCommitJournal = {
  version: MANUAL_COMMIT_JOURNAL_VERSION,
  projectId: 'project-1',
  operationId: ID,
  workspaceId: WORKSPACE,
  workspaceRoot: '/work/project',
  scope: 'specification',
  specId: '22222222-2222-4222-8222-222222222222',
  owners: ['specification-22222222-2222-4222-8222-222222222222'],
  inputFingerprint: HASH,
  stage: 'reserved',
  branch: 'feature/work',
  snapshot: { sha256: HASH, bytes: 100, pathCount: 2 },
  message: { sha256: HASH, bytes: 40 },
  createdAt: NOW,
  updatedAt: NOW,
};

describe('the manual commit state machine', () => {
  it('has a row for every stage and only legal stages as successors', () => {
    for (const stage of MANUAL_COMMIT_STAGES) {
      expect(MANUAL_COMMIT_TRANSITIONS).toHaveProperty(stage);
      expect(MANUAL_COMMIT_STAGE_FACTS).toHaveProperty(stage);
      for (const next of MANUAL_COMMIT_TRANSITIONS[stage]) {
        expect(MANUAL_COMMIT_STAGES).toContain(next);
      }
    }
  });

  it('lists exactly the edges of the design', () => {
    const edges = MANUAL_COMMIT_STAGES.flatMap((from) =>
      MANUAL_COMMIT_STAGES.filter((to) => canTransitionManualCommit(from, to)).map(
        (to) => `${from}>${to}`,
      ),
    );
    expect(edges.sort()).toEqual(
      [
        'reserved>committing',
        'reserved>failed',
        'committing>committing',
        'committing>completed',
        'committing>failed',
        'committing>recovery-required',
        'recovery-required>committing',
        'recovery-required>completed',
        'recovery-required>failed',
      ].sort(),
    );
  });

  it('never leaves a final stage and holds the claim exactly while it is unfinished', () => {
    for (const stage of ['completed', 'failed'] as const) {
      expect(MANUAL_COMMIT_TRANSITIONS[stage]).toEqual([]);
      expect(MANUAL_COMMIT_STAGE_FACTS[stage]).toMatchObject({
        holdsClaim: false,
        active: false,
        settled: true,
      });
    }
    for (const stage of ['reserved', 'committing', 'recovery-required'] as const) {
      expect(MANUAL_COMMIT_STAGE_FACTS[stage]).toMatchObject({
        holdsClaim: true,
        active: true,
        settled: false,
      });
    }
  });
});

describe('transitionManualCommit', () => {
  const committing = transitionManualCommit(
    reserved,
    'committing',
    { executor: EXECUTOR, parentHead: SHA },
    LATER,
  );

  it('moves reserved to committing with the executor and the parent', () => {
    expect(committing).toMatchObject({
      stage: 'committing',
      executor: EXECUTOR,
      parentHead: SHA,
      updatedAt: LATER,
      createdAt: NOW,
    });
    expect(committing.settledAt).toBeUndefined();
    expect(() => parseManualCommitJournal(PROJECT, committing, ID)).not.toThrow();
  });

  it('records the start of the commit without losing the parent or the executor', () => {
    const started = transitionManualCommit(
      committing,
      'committing',
      { commitStartedAt: LATER },
      LATER,
    );
    expect(started).toMatchObject({ commitStartedAt: LATER, parentHead: SHA, executor: EXECUTOR });
    const again = transitionManualCommit(
      started,
      'committing',
      { parentHead: 'e'.repeat(40) },
      LATER,
    );
    expect(again.commitStartedAt).toBe(LATER);
  });

  it('completes with the commit and drops the executor', () => {
    const done = transitionManualCommit(
      committing,
      'completed',
      { outcome: 'committed', sha: SHA, pathCount: 2 },
      LATER,
    );
    expect(done).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha: SHA,
      pathCount: 2,
    });
    expect(done.executor).toBeUndefined();
    expect(done.settledAt).toBe(LATER);
    expect(() => parseManualCommitJournal(PROJECT, done, ID)).not.toThrow();
  });

  it('completes without a commit when there was nothing to commit', () => {
    const done = transitionManualCommit(
      committing,
      'completed',
      { outcome: 'not-applicable', reason: 'nothing-to-commit', sha: SHA },
      LATER,
    );
    expect(done.sha).toBeUndefined();
    expect(done.reason).toBe('nothing-to-commit');
    expect(() => parseManualCommitJournal(PROJECT, done, ID)).not.toThrow();
  });

  it('keeps the reason of a refusal and settles it', () => {
    const failed = transitionManualCommit(
      committing,
      'failed',
      { reason: 'branch-protected', blockedBy: 'branch-protected' },
      LATER,
    );
    expect(failed).toMatchObject({ stage: 'failed', reason: 'branch-protected', settledAt: LATER });
    expect(() => parseManualCommitJournal(PROJECT, failed, ID)).not.toThrow();
  });

  it('forgets the reason of a recovery that is resumed', () => {
    const recovery = transitionManualCommit(
      committing,
      'recovery-required',
      { reason: 'uncertain' },
      LATER,
    );
    expect(recovery.executor).toBeUndefined();
    expect(() => parseManualCommitJournal(PROJECT, recovery, ID)).not.toThrow();
    const resumed = transitionManualCommit(recovery, 'committing', { executor: EXECUTOR }, LATER);
    expect(resumed.reason).toBeUndefined();
    expect(resumed.parentHead).toBe(SHA);
  });

  it('refuses every illegal edge with operation-state-invalid', () => {
    for (const from of MANUAL_COMMIT_STAGES) {
      for (const to of MANUAL_COMMIT_STAGES) {
        if (canTransitionManualCommit(from, to)) continue;
        const source = { ...reserved, stage: from };
        expect(() => transitionManualCommit(source, to, {}, LATER)).toThrow(
          expect.objectContaining({ code: 'DOCUMENT_OPERATION_STATE_INVALID' }),
        );
      }
    }
  });
});

describe('the journal codec', () => {
  it('accepts a reserved journal and rejects what this Engine did not write', () => {
    expect(parseManualCommitJournal(PROJECT, reserved, ID)).toEqual(reserved);
    const bad: unknown[] = [
      null,
      [],
      { ...reserved, extra: 1 },
      { ...reserved, version: 2 },
      { ...reserved, projectId: 'other' },
      { ...reserved, operationId: WORKSPACE },
      { ...reserved, workspaceId: 'x' },
      { ...reserved, scope: 'everything' },
      { ...reserved, owners: [] },
      { ...reserved, owners: ['specification-not-a-uuid'] },
      { ...reserved, owners: ['definitions', 'definitions'] },
      { ...reserved, inputFingerprint: 'short' },
      { ...reserved, stage: 'queued' },
      { ...reserved, branch: '' },
      { ...reserved, snapshot: { sha256: HASH, bytes: 1 } },
      { ...reserved, message: { sha256: 'x', bytes: 1 } },
      { ...reserved, createdAt: 'yesterday' },
      { ...reserved, parentHead: 'nothex' },
      { ...reserved, executor: { pid: 0, hostId: 'h' } },
      { ...reserved, reason: 'Not Kebab' },
      { ...reserved, sha: SHA },
      { ...reserved, executor: EXECUTOR },
    ];
    for (const value of bad) {
      expect(() => parseManualCommitJournal(PROJECT, value, ID)).toThrow(
        expect.objectContaining({ code: 'DOCUMENT_RECOVERY_REQUIRED' }),
      );
    }
  });

  it('requires what each stage requires', () => {
    const committing = { ...reserved, stage: 'committing' as const };
    expect(() => parseManualCommitJournal(PROJECT, committing, ID)).toThrow();
    expect(() =>
      parseManualCommitJournal(PROJECT, { ...committing, executor: EXECUTOR, parentHead: SHA }, ID),
    ).not.toThrow();
    const completed = { ...reserved, stage: 'completed' as const, settledAt: NOW };
    expect(() => parseManualCommitJournal(PROJECT, completed, ID)).toThrow();
    expect(() =>
      parseManualCommitJournal(PROJECT, { ...completed, outcome: 'committed' }, ID),
    ).toThrow();
    expect(() =>
      parseManualCommitJournal(
        PROJECT,
        { ...completed, outcome: 'committed', sha: SHA, pathCount: 1 },
        ID,
      ),
    ).not.toThrow();
    const failed = { ...reserved, stage: 'failed' as const, settledAt: NOW };
    expect(() => parseManualCommitJournal(PROJECT, failed, ID)).toThrow();
    expect(() =>
      parseManualCommitJournal(PROJECT, { ...failed, reason: 'conflict' }, ID),
    ).not.toThrow();
  });

  it('is bounded to 16 KiB', () => {
    const many = Array.from(
      { length: 64 },
      (_, index) => `specification-${String(index).padStart(8, '0')}-2222-4222-8222-222222222222`,
    );
    expect(() =>
      parseManualCommitJournal(PROJECT, { ...reserved, owners: many }, ID),
    ).not.toThrow();
    expect(() =>
      parseManualCommitJournal(
        PROJECT,
        {
          ...reserved,
          workspaceRoot: 'x'.repeat(4096),
          specId: 'y'.repeat(200),
          owners: many,
          reason: 'z'.repeat(60),
        },
        ID,
      ),
    ).not.toThrow();
    expect(() =>
      parseManualCommitJournal(PROJECT, { ...reserved, owners: [...many, ...many] }, ID),
    ).toThrow();
  });
});

describe('the error vocabulary', () => {
  it('maps every cause to a contract code', () => {
    for (const cause of MANUAL_COMMIT_CAUSES) {
      expect(DOCUMENT_ERROR_CODES).toContain(MANUAL_COMMIT_ERROR_MAP[cause].code);
    }
    expect(Object.keys(MANUAL_COMMIT_ERROR_MAP).sort()).toEqual([...MANUAL_COMMIT_CAUSES].sort());
  });

  it('reaches every manual commit code of the contract', () => {
    const reached = new Set<string>(
      MANUAL_COMMIT_CAUSES.map((cause) => MANUAL_COMMIT_ERROR_MAP[cause].code),
    );
    for (const code of DOCUMENT_ERROR_CODES.filter((candidate) =>
      candidate.startsWith('MANUAL_COMMIT_'),
    )) {
      expect(reached.has(code)).toBe(true);
    }
  });

  it('carries the paths of a refusal, at most 25, and never a message path', () => {
    const paths = Array.from({ length: 40 }, (_, index) => `specs/active/x/${String(index)}.md`);
    const error = manualCommitError('conflict', 'edited', { paths });
    expect(error.details?.paths).toHaveLength(25);
    expect(error.message).not.toContain('specs/');
    expect(manualCommitError('branch-changed', 'x').details).toEqual({ cause: 'branch-changed' });
    expect(
      manualCommitError('busy-commit-in-progress', 'x', { retryAfterMs: 1000 }).details,
    ).toEqual({ reason: 'busy', cause: 'commit-in-progress', retryAfterMs: 1000 });
    expect(manualCommitError('message-invalid', 'x', { cause: 'empty' }).details).toEqual({
      cause: 'empty',
    });
  });
});
