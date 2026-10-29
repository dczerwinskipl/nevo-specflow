// Integration (real project, real Git): Close flushes the document commits of the checkouts it owns
// before it takes the control lock, and its errors have a fixed precedence
// (DOCUMENT_COMMITS_PENDING, then the claim conflict, then the preflight).
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import type { CommitPort } from '../../src/version-control/commits/port';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { DocumentError } from '../../src/specs/document-rules/errors';
import { abandonDocumentCommit } from '../../src/specs/documents/queue/actions';
import {
  DOCUMENT_FLUSH_WAIT_CAP_MS,
  flushDocumentCommits,
} from '../../src/specs/documents/queue/flush';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { readCloseJournal } from '../../src/specs/lifecycle/journal/store';
import {
  CloseOperationError,
  previewCloseOperation,
  reserveCloseOperation,
} from '../../src/testing';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import {
  GIT_ON,
  ledgerOf,
  notesText,
  setLocalAutoCommit,
  writableProject,
} from '../support/document-writes';
import {
  commitCount,
  editNotesByHand,
  engineCommits,
  isolatedQueue,
  manualClock,
  queueProject,
  queueSave,
  stageOf,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import { commitStaged, git } from '../support/git-project';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

/** A project whose Close can be admitted: the integration target is pinned to the branch it is on. */
async function closeProject(): Promise<QueueProject> {
  const project = await queueProject();
  const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(project.root, '.nevo/config.yaml'),
    GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
  );
  git(project.root, 'add', '.nevo/config.yaml');
  commitStaged(project.root, 'pin the integration target');

  return project;
}

function closeRequest(project: QueueProject) {
  return {
    kind: 'specification-close' as const,
    operationId: randomUUID(),
    specId: project.specId,
  };
}

/** Flush options with a ledger of their own and a clock the test owns. */
function flushOptions(overrides: Record<string, unknown> = {}) {
  return { queue: isolatedQueue(), ...overrides };
}

describe('Close flushes document commits first', () => {
  it('commits what waits in the queue and then admits the Close', async () => {
    const project = await closeProject();
    const id = await queueSave(project, 1, 'saved shortly before the Close\n');
    expect(workingTreeClean(project)).toBe(false);
    const before = commitCount(project);

    const admitted = await reserveCloseOperation(project.engine, closeRequest(project), {
      flush: flushOptions(),
    });

    expect(admitted.existing).toBe(false);
    expect(admitted.journal.stage).toBe('reserved');
    expect(commitCount(project)).toBe(before + 1);
    expect(workingTreeClean(project)).toBe(true);
    expect((await stageOf(project, id))?.stage).toBe('completed');
  });

  it('keeps the preview pure: it neither flushes nor commits', async () => {
    const project = await closeProject();
    const id = await queueSave(project, 1, 'waiting\n');
    const before = commitCount(project);

    const error = await failure(previewCloseOperation(project.engine, closeRequest(project)));
    expect(error).toBeInstanceOf(CloseOperationError);
    expect((error as CloseOperationError).code).toBe('CLOSE_PREFLIGHT');
    expect(commitCount(project)).toBe(before);
    expect((await stageOf(project, id))?.stage).toBe('queued');
  });

  it('refuses with DOCUMENT_COMMITS_PENDING (commit-failed) before the dirty tree is a preflight error', async () => {
    const project = await closeProject();
    const id = await queueSave(project, 1, 'will fail\n');
    await editNotesByHand(project, 1, 'a person typed this\n');

    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), { flush: flushOptions() }),
    );
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-failed' },
    });
    expect((await stageOf(project, id))?.stage).toBe('commit-failed');
    expect(engineCommits(project)).toEqual([]);
  });

  it('refuses an abandoned commit (the ledger holds its path) as well', async () => {
    const project = await closeProject();
    const id = await queueSave(project, 1, 'abandoned\n');
    await editNotesByHand(project, 1, 'a person typed this\n');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, { flush: true });
    await abandonDocumentCommit(project.engine, id);
    expect(await stageOf(project, id)).toMatchObject({
      stage: 'completed',
      outcome: 'uncommitted',
    });

    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), { flush: flushOptions() }),
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });
  });

  it('lets a save that slips in after the flush meet the claim conflict inside the lock', async () => {
    const project = await closeProject();
    await queueSave(project, 1, 'first\n');

    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), {
        flush: flushOptions(),
        hooks: {
          afterFlush: async () => {
            await queueSave(project, 2, 'slipped in between the flush and the lock\n');
          },
        },
      }),
    );
    expect(error).toBeInstanceOf(CloseOperationError);
    expect((error as CloseOperationError).code).toBe('CLOSE_CONFLICT');
  });

  it('reports a still-pending commit when another executor keeps the queue past the wait cap', async () => {
    const project = await closeProject();
    await queueSave(project, 1, 'held\n');
    const release: { open?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      void runQueueOnce(
        project.engine,
        isolatedQueue({
          hooks: {
            beforeCommit: async () => {
              resolve();
              await gate;
            },
          },
        }),
        undefined,
        { flush: true },
      ).catch(() => undefined);
    });
    await reached;

    const clock = manualClock();
    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), {
        flush: flushOptions({
          clock,
          sleep: (ms: number) => {
            clock.advance(ms);

            return Promise.resolve();
          },
        }),
      }),
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-pending' },
    });
    release.open?.();
  });
});

describe('flushDocumentCommits', () => {
  it('stops waiting at the cap and says so', async () => {
    const project = await closeProject();
    await queueSave(project, 1, 'held\n');
    const release: { open?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      void runQueueOnce(
        project.engine,
        isolatedQueue({
          hooks: {
            beforeCommit: async () => {
              resolve();
              await gate;
            },
          },
        }),
        undefined,
        { flush: true },
      ).catch(() => undefined);
    });
    await reached;

    const clock = manualClock();
    const slept: number[] = [];
    const outcome = await flushDocumentCommits(
      project.engine,
      { workspaceId: project.workspaceId, root: project.root },
      {
        queue: isolatedQueue(),
        clock,
        sleep: (ms) => {
          slept.push(ms);
          clock.advance(ms);

          return Promise.resolve();
        },
      },
    );
    expect(outcome.timedOut).toBe(true);
    expect(outcome.remaining?.cause).toBe('commit-pending');
    expect(slept.reduce((sum, ms) => sum + ms, 0)).toBe(DOCUMENT_FLUSH_WAIT_CAP_MS);
    release.open?.();
  });

  it('runs no Git for a project with Git turned off: nothing is ever queued', async () => {
    const project = await writableProject();
    await applyDocumentChange(project.engine, project.specId, randomUUID(), {
      action: 'save',
      documentId: 'notes-1',
      content: 'no git\n',
      expectedRevision: sha256Hex(notesText(1)),
    });
    const refusing = {
      head: () => Promise.reject(new Error('Git must not be asked.')),
    } as unknown as CommitPort;
    const outcome = await flushDocumentCommits(
      project.engine,
      { workspaceId: project.workspaceId, root: project.root },
      { queue: isolatedQueue({ commits: refusing }) },
    );
    expect(outcome).toEqual({ remaining: undefined, timedOut: false });
  });

  it('returns at once for a checkout with nothing queued', async () => {
    const project = await closeProject();
    let slept = false;
    const outcome = await flushDocumentCommits(
      project.engine,
      { workspaceId: project.workspaceId, root: project.root },
      {
        queue: isolatedQueue(),
        sleep: () => {
          slept = true;

          return Promise.resolve();
        },
      },
    );
    expect(outcome).toEqual({ remaining: undefined, timedOut: false });
    expect(slept).toBe(false);
  });
});

describe('Close and the uncommitted-changes ledger', () => {
  const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;

  it('refuses while auto-commit off left changes, then admits once a hand commit holds them', async () => {
    const project = await closeProject();
    await setLocalAutoCommit(project, false);
    const id = await queueSave(project, 1, 'written, not committed\n');
    expect(await stageOf(project, id)).toMatchObject({
      stage: 'completed',
      outcome: 'uncommitted',
    });
    const before = commitCount(project);

    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), { flush: flushOptions() }),
    );
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });
    // The Engine committed nothing on its own.
    expect(commitCount(project)).toBe(before);
    expect(await ledgerOf(project)).toBeDefined();

    git(project.root, 'add', 'specs');
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'by hand');
    const admitted = await reserveCloseOperation(project.engine, closeRequest(project), {
      flush: flushOptions(),
    });
    expect(admitted.existing).toBe(false);
    expect(await ledgerOf(project)).toBeUndefined();
  });

  it('judges a manual-mode save that lands between the flush and the lock inside the lock and reserves nothing', async () => {
    const project = await closeProject();
    await setLocalAutoCommit(project, false);
    const request = closeRequest(project);

    const error = await failure(
      reserveCloseOperation(project.engine, request, {
        flush: flushOptions(),
        hooks: {
          afterFlush: async () => {
            await queueSave(project, 1, 'saved after the flush\n');
          },
        },
      }),
    );

    expect(error).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });
    expect(await readCloseJournal(project.engine.context, request.operationId)).toBeUndefined();
  });

  it('keeps refusing a ledger whose files were changed again after the hand commit', async () => {
    const project = await closeProject();
    await setLocalAutoCommit(project, false);
    await queueSave(project, 1, 'first\n');
    git(project.root, 'add', 'specs');
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'by hand');
    await queueSave(project, 1, 'second\n');
    const error = await failure(
      reserveCloseOperation(project.engine, closeRequest(project), { flush: flushOptions() }),
    );
    expect(error).toMatchObject({ details: { cause: 'commit-uncommitted' } });
    expect((await ledgerOf(project))?.entries).toHaveLength(1);
  });
});
