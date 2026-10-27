// Integration (real project, real Git): the manual commit (ADR 0018 decision 8). With auto-commit off
// the Engine commits exactly the ledger paths of a scope, with the person's message and its own
// trailers, through the same port, lease and claims as the document queue, and never anything else.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS, symlinksAvailable } from './support/platform';

import { DocumentError } from '../src/specs/document-rules/errors';
import {
  markLeaseActive,
  markLeaseIdle,
  recordLedgerEntries,
  withLedgerLock,
  writeCheckoutLease,
} from '../src/specs/durable';
import { applyDocumentChange } from '../src/specs/documents/api';
import { findDocumentChangeJournal } from '../src/specs/documents/write/journal-store';
import { abandonDocumentCommit } from '../src/specs/documents/queue/actions';
import { flushDocumentCommits } from '../src/specs/documents/queue/flush';
import {
  listDocumentOperationRows,
  readDocumentOperationStatus,
  readSpecificationDocumentTree,
  readSpecificationUncommitted,
} from '../src/specs/documents/reading';
import { manualCommit, readUncommittedScope } from '../src/specs/documents/manual-commit';
import { previewCloseOperation, reserveCloseOperation } from '../src/testing';
import { listManualCommitJournals } from '../src/specs/manual-commit';
import { sha256Hex } from '../src/hash';
import { GIT_OFF, failure, removeTrackedRoots } from './support/documents-fixture';
import { GIT_ON, ledgerOf, ledgerPaths, setLocalAutoCommit } from './support/document-writes';
import {
  commitCount,
  committedPaths,
  editNotesByHand,
  isolatedQueue,
  queueRecords,
  queueSave,
  trailersOf,
  workingTreeClean,
  type QueueProject,
} from './support/document-queue';
import { commitStaged, git } from './support/git-project';
import {
  commitUncommitted,
  headCount,
  journalOf,
  ledgerRevisionOf,
  manualCommits,
  manualModeProject,
  manualOptions,
  messageOf,
  saveAllUncommitted,
  saveUncommitted,
  specPath,
} from './support/manual-commit';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;

/** The code (and details) of a document error a promise rejects with. */
async function refusal(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DocumentError);
  const { code, details } = error as DocumentError;
  return { code, details };
}

describe('a manual commit with auto-commit off', () => {
  it('commits exactly the ledger paths with the message, the trailers and the ledger pruned', async () => {
    const project = await manualModeProject();
    const first = await saveUncommitted(project, 1, 'first change\n');
    const second = await saveUncommitted(project, 2, 'second change\n');
    const before = headCount(project);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(
      (await readSpecificationDocumentTree(project.engine, project.specId)).commits,
    ).toMatchObject({
      uncommitted: 2,
      policy: 'manual',
    });

    const operationId = randomUUID();
    const result = await commitUncommitted(project, {
      operationId,
      message: 'Update the notes\n\nBecause the first draft was wrong.\nSecond line of the body.',
    });

    expect(result.commit.state).toBe('committed');
    expect(result.paths).toEqual([specPath(1), specPath(2)]);
    expect(result.replayed).toBe(false);
    expect(result.remaining.entries).toBe(0);
    const sha = result.commit.sha!;
    expect(headCount(project)).toBe(before + 1);
    expect(git(project.root, 'rev-parse', 'HEAD')).toBe(sha);
    expect(committedPaths(project, sha)).toEqual([specPath(1), specPath(2)]);
    expect(messageOf(project, sha)).toBe(
      [
        'Update the notes',
        '',
        'Because the first draft was wrong.',
        'Second line of the body.',
        '',
        'Nevo-Operation: ' + operationId,
        'Nevo-Kind: manual-commit',
        'Nevo-Action: manual-commit',
        'Nevo-Scope: specification',
        'Nevo-Spec: ' + project.specId,
        'Nevo-Documents: notes-1.md,notes-2.md',
      ].join('\n'),
    );
    expect(trailersOf(project, sha)['Nevo-Operation']).toBe(operationId);
    // The Engine is the committer; the person (or the Engine, without an identity) is the author.
    expect(git(project.root, 'log', '-1', '--format=%ce', sha)).toBe('engine@nevo.invalid');

    // The ledger is pruned, the tree is committed and clean, the checkout has nothing left over.
    expect(await ledgerOf(project)).toBeUndefined();
    expect(workingTreeClean(project)).toBe(true);
    expect(
      (await readSpecificationDocumentTree(project.engine, project.specId)).commits,
    ).toMatchObject({
      uncommitted: 0,
    });
    const uncommitted = await readSpecificationUncommitted(project.engine, project.specId);
    expect(uncommitted.entries).toEqual([]);
    expect(result.remaining.ledgerRevision).toBe(uncommitted.ledgerRevision);

    // The journal ended settled, the claim and the lease are gone, the saves stay completed.
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha,
      pathCount: 2,
    });
    expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(await readDocumentOperationStatus(project.engine, first)).toMatchObject({
      commit: { state: 'uncommitted' },
    });
    expect(second).not.toBe(first);
  });

  it('uses the default message of the Specification when none is given', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'changed\n');

    const result = await commitUncommitted(project);

    expect(messageOf(project, result.commit.sha!).split('\n')[0]).toBe(
      'spec(docs): manual commit hand',
    );
  });

  it('replays the stored result by operation id and refuses another body under it', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'changed\n');
    const operationId = randomUUID();
    const first = await commitUncommitted(project, { operationId, message: 'One commit' });
    const count = headCount(project);

    const again = await commitUncommitted(project, { operationId, message: 'One commit' });
    expect(again).toMatchObject({ replayed: true, commit: first.commit, paths: first.paths });
    expect(headCount(project)).toBe(count);

    expect(
      await refusal(commitUncommitted(project, { operationId, message: 'Another message' })),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_CONFLICT' });
    expect(headCount(project)).toBe(count);
  });

  it('never touches an unrelated change: other files, the staged hunks and untracked files stay', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'engine change\n');
    // Someone else works in the same folder and elsewhere: a modified file, a staged edit of another
    // file, an untracked file and a staged new file.
    await appendFile(join(project.dir, 'notes-2.md'), 'a person edited this\n');
    await appendFile(join(project.dir, 'notes-3.md'), 'a person staged this\n');
    git(project.root, 'add', specPath(3));
    await writeFile(join(project.dir, 'scratch.md'), 'untracked\n');
    await writeFile(join(project.root, 'elsewhere.md'), 'staged new\n');
    git(project.root, 'add', 'elsewhere.md');

    const result = await commitUncommitted(project, { message: 'Only the engine change' });

    expect(result.paths).toEqual([specPath(1)]);
    expect(committedPaths(project, result.commit.sha!)).toEqual([specPath(1)]);
    const status = git(project.root, 'status', '--porcelain=v1', '--untracked-files=all')
      .split('\n')
      .sort();
    expect(status).toEqual(
      [
        ` M ${specPath(2)}`,
        `M  ${specPath(3)}`,
        'A  elsewhere.md',
        `?? specs/active/hand/scratch.md`,
      ].sort(),
    );
  });

  it('commits a path the Engine removed together with the registry change', async () => {
    const project = await manualModeProject();
    const operationId = randomUUID();
    await applyDocumentChange(project.engine, project.specId, operationId, {
      action: 'delete',
      target: { kind: 'document', documentId: 'notes-4' },
      expectedRevision: sha256Hex('notes 4\n'),
    });
    expect(await ledgerPaths(project)).toEqual(
      expect.arrayContaining([specPath(4), 'specs/active/hand/specification.yaml']),
    );

    const result = await commitUncommitted(project, { message: 'Remove notes 4' });

    expect(result.paths).toEqual([specPath(4), 'specs/active/hand/specification.yaml'].sort());
    expect(git(project.root, 'ls-files', '--', specPath(4))).toBe('');
    expect(await ledgerOf(project)).toBeUndefined();
    expect(workingTreeClean(project)).toBe(true);
  });
});

describe('the subset of a manual commit', () => {
  it('commits a subset of independent saves and leaves the rest in the ledger', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await saveUncommitted(project, 2, 'two\n');

    const result = await commitUncommitted(project, { paths: [specPath(2)] });

    expect(result.paths).toEqual([specPath(2)]);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect(result.remaining.entries).toBe(1);
    expect(git(project.root, 'status', '--porcelain=v1')).toBe(`M ${specPath(1)}`);
  });

  it('refuses a subset that splits an operation and names the closure', async () => {
    const project = await manualModeProject();
    await saveAllUncommitted(
      project,
      new Map([
        [1, 'one\n'],
        [2, 'two\n'],
      ]),
    );
    await saveUncommitted(project, 3, 'three\n');
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project, { paths: [specPath(1)] }));

    expect(refused.code).toBe('MANUAL_COMMIT_SUBSET_INVALID');
    expect(refused.details).toMatchObject({ paths: [specPath(1), specPath(2)] });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toHaveLength(3);
    expect(await listManualCommitJournals(project.engine.context)).toEqual([]);

    // The closure is accepted, with or without the independent save.
    const ok = await commitUncommitted(project, { paths: [specPath(2), specPath(1)] });
    expect(ok.paths).toEqual([specPath(1), specPath(2)]);
    expect(await ledgerPaths(project)).toEqual([specPath(3)]);
  });

  it('refuses a partial subset once a path forgot older operation ids, and takes the whole scope', async () => {
    const project = await manualModeProject();
    await saveAllUncommitted(
      project,
      new Map([
        [1, 'one\n'],
        [2, 'two\n'],
      ]),
    );
    // 50 later saves of notes-2 push the shared operation out of its newest-50 ids.
    for (let round = 0; round < 50; round += 1) await saveUncommitted(project, 2, `two ${round}\n`);
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project, { paths: [specPath(1)] }));

    expect(refused.code).toBe('MANUAL_COMMIT_SUBSET_INVALID');
    expect(refused.details).toMatchObject({ paths: [specPath(1), specPath(2)] });
    expect(headCount(project)).toBe(before);

    const all = await commitUncommitted(project, { paths: [specPath(1), specPath(2)] });
    expect(all.paths).toEqual([specPath(1), specPath(2)]);
    expect(await ledgerPaths(project)).toEqual([]);
  });

  it('refuses a path that is not an uncommitted path of the scope', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');

    const refused = await refusal(
      commitUncommitted(project, { paths: [specPath(1), specPath(5), '.nevo/config.yaml'] }),
    );

    expect(refused.code).toBe('MANUAL_COMMIT_SUBSET_INVALID');
    expect(refused.details).toMatchObject({
      cause: 'path-not-in-ledger',
      paths: ['.nevo/config.yaml', specPath(5)],
    });
  });
});

describe('what refuses a manual commit', () => {
  it('refuses when nobody wrote anything uncommitted', async () => {
    const project = await manualModeProject();

    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'MANUAL_COMMIT_UNAVAILABLE',
      details: { cause: 'ledger-empty' },
    });
  });

  it('refuses a path someone edited since the Engine wrote it, committing nothing', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'engine content\n');
    await saveUncommitted(project, 2, 'second\n');
    await editNotesByHand(project, 1, 'a person typed this\n');
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project, { message: 'Not under my name' }));

    expect(refused).toMatchObject({
      code: 'MANUAL_COMMIT_CONFLICT',
      details: { paths: [specPath(1)] },
    });
    expect(headCount(project)).toBe(before);
    expect(manualCommits(project)).toEqual([]);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(await readFile(join(project.dir, 'notes-1.md'), 'utf8')).toBe('a person typed this\n');
    expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
  });

  it('refuses a path the Engine removed when a person put a file back', async () => {
    const project = await manualModeProject();
    await applyDocumentChange(project.engine, project.specId, randomUUID(), {
      action: 'delete',
      target: { kind: 'document', documentId: 'notes-4' },
      expectedRevision: sha256Hex('notes 4\n'),
    });
    await writeFile(join(project.dir, 'notes-4.md'), 'back again\n');

    const refused = await refusal(commitUncommitted(project));

    expect(refused.code).toBe('MANUAL_COMMIT_CONFLICT');
    expect(refused.details?.paths).toEqual([specPath(4)]);
  });

  it.skipIf(!symlinksAvailable)(
    'refuses a path replaced by a link to a file with the same content and commits nothing',
    async () => {
      const project = await manualModeProject();
      await saveUncommitted(project, 1, 'v1\n');
      await writeFile(join(project.root, 'target.txt'), 'v1\n');
      await rm(join(project.dir, 'notes-1.md'));
      await symlink(join(project.root, 'target.txt'), join(project.dir, 'notes-1.md'));
      const before = headCount(project);

      const refused = await refusal(commitUncommitted(project));

      expect(refused).toMatchObject({
        code: 'MANUAL_COMMIT_CONFLICT',
        details: { paths: [specPath(1)] },
      });
      expect(headCount(project)).toBe(before);
      expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
    },
  );

  it('commits the Engine content of a path saved again while Git was disabled', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'v1\n');
    await writeFile(join(project.root, '.nevo/config.yaml'), GIT_OFF);
    await saveUncommitted(project, 1, 'v2 while Git is off\n');
    await writeFile(join(project.root, '.nevo/config.yaml'), GIT_ON);

    const result = await commitUncommitted(project, { message: 'After Git is back' });

    expect(result.paths).toEqual([specPath(1)]);
    expect(await ledgerPaths(project)).toEqual([]);
    expect(git(project.root, 'show', 'HEAD:' + specPath(1))).toBe('v2 while Git is off');
  });

  it('refuses when the checkout is on another branch than the ledger pinned', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    git(project.root, 'checkout', '-q', '-b', 'feature/other');
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project));

    expect(refused).toMatchObject({
      code: 'MANUAL_COMMIT_CONFLICT',
      details: { cause: 'branch-changed' },
    });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
  });

  it('refuses a stale ledger revision and accepts the current one', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const seen = await ledgerRevisionOf(project);
    await saveUncommitted(project, 2, 'two\n');

    expect(await refusal(commitUncommitted(project, { ledgerRevision: seen }))).toMatchObject({
      code: 'MANUAL_COMMIT_STALE',
    });
    const current = await ledgerRevisionOf(project);
    expect(current).not.toBe(seen);
    const ok = await commitUncommitted(project, { ledgerRevision: current });
    expect(ok.paths).toHaveLength(2);
  });

  it('refuses a protected branch with nothing reserved, though the saves were allowed on it', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      GIT_ON + '  commits:\n    protectedBranches:\n      - feature/work\n',
    );
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project));

    expect(refused).toMatchObject({
      code: 'BRANCH_PROTECTED',
      details: { reason: 'branch-protected' },
    });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('refuses a detached HEAD', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    git(project.root, 'checkout', '-q', '--detach');

    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'detached' },
    });
  });

  it('refuses an invalid message before anything else', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');

    for (const [message, cause] of [
      ['   ', 'empty'],
      ['x'.repeat(101), 'subject-too-long'],
      ['s\n\n' + 'b'.repeat(2001), 'body-too-long'],
      ['s\u0000t', 'contains-nul'],
    ] as const) {
      expect(await refusal(commitUncommitted(project, { message }))).toMatchObject({
        code: 'MANUAL_COMMIT_MESSAGE_INVALID',
        details: { cause },
      });
    }
    expect(manualCommits(project)).toEqual([]);
  });

  it('refuses the definitions scope unless the caller is the command line', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');

    expect(
      await refusal(
        manualCommit(project.engine, { operationId: randomUUID(), scope: 'definitions' }),
      ),
    ).toMatchObject({
      code: 'DOCUMENT_OPERATION_INVALID',
      details: { cause: 'scope-not-allowed' },
    });
  });

  it('refuses a manual commit while Git is disabled', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: false\n',
    );

    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'MANUAL_COMMIT_UNAVAILABLE',
      details: { cause: 'git-disabled' },
    });
  });
});

describe('a message that tries to be an Engine trailer', () => {
  it('quotes the lines, so the operation of another commit is never claimed', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const stolen = randomUUID();
    const operationId = randomUUID();

    const result = await commitUncommitted(project, {
      operationId,
      message: [
        'Looks harmless',
        '',
        'Nevo-Operation: ' + stolen,
        'nevo-kind: document-change\r',
        '  Nevo-Coalesced: ' + stolen + '\u0007',
        'Nevo-Documents : a.md',
      ].join('\n'),
    });

    const message = messageOf(project, result.commit.sha!);
    expect(message).toContain('> Nevo-Operation: ' + stolen);
    expect(message).toContain('> nevo-kind: document-change');
    expect(message).toContain('> Nevo-Coalesced: ' + stolen);
    expect(message.includes('\r') || message.includes('\u0007')).toBe(false);
    expect(trailersOf(project, result.commit.sha!)['Nevo-Operation']).toBe(operationId);
    expect(
      git(project.root, 'log', '--all', '--format=%H', '--grep=^Nevo-Operation: ' + stolen),
    ).toBe('');
  });
});

describe('a hand commit meanwhile', () => {
  it('completes as nothing to commit when a person already committed the same content', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    git(project.root, 'add', specPath(1));
    git(project.root, ...HUMAN, 'commit', '-qm', 'I committed the engine change myself');
    const before = headCount(project);

    const result = await commitUncommitted(project);

    expect(result.commit).toMatchObject({ state: 'not-applicable', reason: 'nothing-to-commit' });
    expect(result.paths).toEqual([]);
    expect(headCount(project)).toBe(before);
    expect(await ledgerOf(project)).toBeUndefined();
    expect(manualCommits(project)).toEqual([]);
  });

  it('commits what is left when a person committed one of two paths', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await saveUncommitted(project, 2, 'two\n');
    git(project.root, 'add', specPath(1));
    git(project.root, ...HUMAN, 'commit', '-qm', 'only the first');

    const result = await commitUncommitted(project);

    expect(result.paths).toEqual([specPath(2)]);
    expect(await ledgerOf(project)).toBeUndefined();
    expect(workingTreeClean(project)).toBe(true);
  });
});

describe('with auto-commit on', () => {
  it('is unavailable while a batch failed, and adopts the entries an abandon left', async () => {
    const project = await manualModeProject();
    // Auto-commit back on: the save is queued, then its path becomes ignored so the batch fails.
    await setLocalAutoCommit(project, undefined);
    const id = await queueSave(project, 1, 'queued content\n');
    await appendFile(join(project.root, '.gitignore'), specPath(1) + '\n');
    await flushDocumentCommits(project.engine, project.engine.workspace, {
      queue: isolatedQueue(),
    });
    expect((await journalStage(project, id))?.stage).toBe('commit-failed');

    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'MANUAL_COMMIT_UNAVAILABLE',
      details: { cause: 'queue-not-empty' },
    });

    // The person abandons the failed batch: the content stays on disk, recorded in the ledger.
    await abandonDocumentCommit(project.engine, id);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    // The ignore rule is still there: the port refuses the path.
    expect(await refusal(commitUncommitted(project))).toMatchObject({ code: 'COMMIT_BLOCKED' });
    await writeFile(join(project.root, '.gitignore'), '.nevo/local/\n');

    const result = await commitUncommitted(project, { message: 'Adopt the abandoned change' });
    expect(result.paths).toEqual([specPath(1)]);
    expect(await ledgerOf(project)).toBeUndefined();
    expect(workingTreeClean(project)).toBe(true);
  });

  it('commits the queued work first and then has nothing left to commit', async () => {
    const project = await manualModeProject();
    await setLocalAutoCommit(project, undefined);
    await queueSave(project, 1, 'queued\n');
    const before = commitCount(project);

    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'MANUAL_COMMIT_UNAVAILABLE',
      details: { cause: 'ledger-empty' },
    });
    // The flush that the request made committed the queued save.
    expect(commitCount(project)).toBe(before + 1);
  });
});

describe('the lease and the claims', () => {
  it('is busy while a process that may still run holds the lease, and leaves no journal behind', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await writeCheckoutLease(
      project.engine.context,
      {
        workspaceId: project.workspaceId,
        executor: { pid: 4242, hostId: 'some-other-host' },
        batchId: randomUUID(),
        acquiredAt: new Date().toISOString(),
      },
      { invalid: () => new Error('invalid') },
    );
    const before = headCount(project);

    const refused = await refusal(commitUncommitted(project));

    expect(refused).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'commit-in-progress' } });
    expect(headCount(project)).toBe(before);
    expect(await listManualCommitJournals(project.engine.context)).toEqual([]);

    // The operator asserts that holder has stopped: the lease is taken over.
    const result = await commitUncommitted(project, {}, { confirmExecutorStopped: true });
    expect(result.paths).toEqual([specPath(1)]);
    expect((await queueRecords(project)).lease).toBe(false);
  });

  it('does not start beside a queue run of the same process', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    expect(markLeaseActive(project.workspaceId)).toBe(true);
    try {
      expect(await refusal(commitUncommitted(project))).toMatchObject({ code: 'SPEC_BUSY' });
    } finally {
      markLeaseIdle(project.workspaceId);
    }
    expect((await commitUncommitted(project)).paths).toEqual([specPath(1)]);
  });

  it('holds the paths from the reservation: a save of one of them is refused while it commits', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    let during: unknown;

    await commitUncommitted(
      project,
      {},
      {
        deps: {
          hooks: {
            beforeCommit: async () => {
              during = await failure(saveUncommitted(project, 1, 'a racing save\n'));
              // A save of a path outside the commit is not held back.
              await saveUncommitted(project, 2, 'unrelated\n');
            },
          },
        },
      },
    );

    expect(during).toBeInstanceOf(DocumentError);
    expect(during).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'commit-in-progress' } });
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);
  });

  it('keeps Close out while a manual commit has not ended, and lets it in once the ledger is committed', async () => {
    const project = await manualModeProject();
    const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
    await saveUncommitted(project, 1, 'one\n');
    // Close needs a pinned integration target on a clean checkout of committed config.
    await mkdir(join(project.root, '.nevo'), { recursive: true });
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(project.root, 'add', '.nevo/config.yaml');
    commitStaged(project.root, 'pin the integration target');
    const request = {
      kind: 'specification-close' as const,
      operationId: randomUUID(),
      specId: project.specId,
    };

    // The Engine's uncommitted content is a reason of its own: Close never commits it by itself.
    expect(
      await refusal(
        reserveCloseOperation(project.engine, request, { flush: { queue: isolatedQueue() } }),
      ),
    ).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });

    await commitUncommitted(project, { message: 'Commit before the Close' });

    const admitted = await reserveCloseOperation(project.engine, request, {
      flush: { queue: isolatedQueue() },
    });
    expect(admitted.existing).toBe(false);
    await previewCloseOperation(project.engine, request);
  });
});

describe('the reads of a manual commit', () => {
  it('serves the status of a completed manual commit as a document operation, never in the list', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    const result = await commitUncommitted(project, { operationId });

    const status = await readDocumentOperationStatus(project.engine, operationId, {
      specId: project.specId,
    });

    expect(status).toMatchObject({
      operationId,
      specId: project.specId,
      action: 'manual-commit',
      stage: 'completed',
      commit: { state: 'committed', sha: result.commit.sha },
      actions: { recover: { available: false } },
    });
    expect(
      await failure(
        readDocumentOperationStatus(project.engine, operationId, { specId: randomUUID() }),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_NOT_FOUND' });
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);
  });
});

function journalStage(project: QueueProject, operationId: string) {
  return findDocumentChangeJournal(project.engine.context, operationId);
}

describe('the scopes', () => {
  const DEFINITION = '.nevo/definitions/archetypes/demo.yaml';

  /** An interrupted `definitions install` leaves a file the ledger of the definitions names. */
  async function leaveDefinitionsUncommitted(project: QueueProject, content: string) {
    await mkdir(join(project.root, '.nevo/definitions/archetypes'), { recursive: true });
    await writeFile(join(project.root, DEFINITION), content);
    await withLedgerLock(project.engine.context, () =>
      recordLedgerEntries(
        project.engine.context,
        {
          projectId: project.engine.context.project.projectId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          owner: { kind: 'definitions' },
        },
        {
          operationId: randomUUID(),
          reason: 'abandoned',
          recordedAt: new Date().toISOString(),
          branch: 'feature/work',
          head: git(project.root, 'rev-parse', 'HEAD'),
          paths: [{ path: DEFINITION, postSha256: sha256Hex(content) }],
        },
      ),
    );
  }

  it('commits the definitions on their own, from the command line', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'a spec change\n');
    await leaveDefinitionsUncommitted(project, 'id: demo\n');

    const result = await manualCommit(
      project.engine,
      { operationId: randomUUID(), scope: 'definitions' },
      manualOptions({ allowDefinitions: true }),
    );

    expect(result.paths).toEqual([DEFINITION]);
    expect(messageOf(project, result.commit.sha!)).toContain('definitions: manual commit');
    expect(messageOf(project, result.commit.sha!)).toContain('Nevo-Scope: definitions');
    expect(messageOf(project, result.commit.sha!)).not.toContain('Nevo-Spec:');
    // The Specification's change is still uncommitted; the ledger of the definitions is empty.
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect(
      (
        await readUncommittedScope(
          project.engine,
          { scope: 'definitions' },
          { allowDefinitions: true },
        )
      ).entries,
    ).toEqual([]);
  });

  it('commits every owner of the checkout with the scope all, one commit', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'a spec change\n');
    await leaveDefinitionsUncommitted(project, 'id: demo\n');
    const before = headCount(project);

    const result = await manualCommit(
      project.engine,
      { operationId: randomUUID(), scope: 'all', specId: project.specId },
      manualOptions({ allowDefinitions: true }),
    );

    expect(result.paths).toEqual([DEFINITION, specPath(1)]);
    expect(headCount(project)).toBe(before + 1);
    expect(messageOf(project, result.commit.sha!)).toContain('Nevo-Scope: all');
    expect(messageOf(project, result.commit.sha!)).toContain('Nevo-Spec: ' + project.specId);
    expect(messageOf(project, result.commit.sha!)).toMatch(/Nevo-Documents: notes-1\.md$/u);
    expect(result.remaining.entries).toBe(0);
  });

  it('leaves the definitions out of the scope all of a caller that is not the command line', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'a spec change\n');
    await leaveDefinitionsUncommitted(project, 'id: demo\n');

    const result = await manualCommit(
      project.engine,
      { operationId: randomUUID(), scope: 'all', specId: project.specId },
      manualOptions(),
    );

    expect(result.paths).toEqual([specPath(1)]);
    expect(result.remaining.entries).toBe(0);
    const left = await readUncommittedScope(
      project.engine,
      { scope: 'definitions' },
      { allowDefinitions: true },
    );
    expect(left.entries.map((entry) => entry.path)).toEqual([DEFINITION]);
  });

  it('shows the ledger of a scope the way the Specification read does', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'a spec change\n');
    const view = await readUncommittedScope(project.engine, {
      scope: 'specification',
      specId: project.specId,
    });
    const http = await readSpecificationUncommitted(project.engine, project.specId);

    expect(view.ledgerRevision).toBe(http.ledgerRevision);
    expect(view.policy).toEqual(http.policy);
    expect(view.queue).toEqual(http.queue);
    expect(view.entries.map(({ owner: _owner, ...entry }) => entry)).toEqual(http.entries);
    const all = await readUncommittedScope(project.engine, { scope: 'all' });
    expect(all.ledgerRevision).toBe(http.ledgerRevision);
    expect(all.entries.map((entry) => entry.path)).toEqual([specPath(1)]);
  });
});
