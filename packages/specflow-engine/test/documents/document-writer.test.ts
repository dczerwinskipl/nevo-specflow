// Integration (real project, real files): the writer of document changes. Reservation, the order of
// the file effects, the acknowledgement, the Git-disabled path, idempotent replay and the refusals.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import {
  SharedResourceError,
  payloadDirectory,
  publishJournal,
  withJournalLock,
} from '../../src/specs/durable';
import { buildJournal } from '../../src/specs/documents/changes/test-support';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../src/specs/documents/changes/journal/kind';
import { fingerprintDocumentChange } from '../../src/specs/documents/changes/fingerprint';
import { encodePlan } from '../../src/specs/documents/changes/plan/codec';
import type { DocumentChangePlan } from '../../src/specs/documents/changes/plan/model';
import { applyDocumentChange, documentWriteDependencies } from '../../src/specs/documents/api';
import {
  readDocumentChangeJournal,
  readSettledDocumentChangeJournal,
} from '../../src/specs/documents/write/journal-store';
import type { BatchPathView } from '../../src/specs/documents/write/reservation-guard';
import {
  WriterInterrupted,
  type PathEffectEvent,
} from '../../src/specs/documents/write/file-effects';
import type { ProcessTable } from '../../src/specs/documents/write/executor-identity';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import {
  activeJournals,
  checkoutClaimFree,
  noSleep,
  notesPath,
  notesRevision,
  notesText,
  saveNotes,
  strayStageFiles,
  text,
  writableProject,
} from '../support/document-writes';
import { git } from '../support/git-project';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

describe('a save without Git', () => {
  it('writes at once, completes as not-applicable and leaves only the plan file', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const result = await applyDocumentChange(
      project.engine,
      project.specId,
      operationId,
      saveNotes(2, 'changed\n'),
      { sleep: noSleep },
    );

    expect(result).toMatchObject({
      operationId,
      action: 'save',
      stage: 'completed',
      replayed: false,
      commit: { state: 'not-applicable', reason: 'git-disabled' },
      documents: [{ id: 'notes-2', path: notesPath(2), sha256: sha256Hex('changed\n') }],
    });
    expect(await text(project, notesPath(2))).toBe('changed\n');
    expect(await text(project, notesPath(3))).toBe(notesText(3));
    expect(await strayStageFiles(project.dir)).toEqual([]);

    // Not active: no claim, no listing; kept for replay together with its plan file.
    expect(await activeJournals(project.engine)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
    const settled = await readSettledDocumentChangeJournal(project.engine.context, operationId);
    expect(settled).toMatchObject({ stage: 'completed', outcome: 'not-applicable', sequence: 1 });
    expect(settled?.executor).toBeUndefined();
    expect(
      await readdir(
        payloadDirectory(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId),
      ),
    ).toEqual([settled?.plan.sha256]);
  });
});

describe('a save with Git', () => {
  it('acknowledges at queued with the commit pending and the branch pinned, and commits nothing', async () => {
    const project = await writableProject({ git: true });
    const head = git(project.root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const result = await applyDocumentChange(
      project.engine,
      project.specId,
      operationId,
      saveNotes(1, 'changed\n'),
    );

    expect(result.stage).toBe('queued');
    expect(result.commit).toMatchObject({ state: 'pending', attempts: 0 });
    expect(result.commit.queuedAt).toBeDefined();
    expect(await text(project, notesPath(1))).toBe('changed\n');
    // The queue is not this task's: nothing was committed, the change waits in its journal.
    expect(git(project.root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(project.root, 'status', '--porcelain')).toContain('notes-1.md');

    const [journal] = await activeJournals(project.engine);
    expect(journal).toMatchObject({
      operationId,
      stage: 'queued',
      sequence: 1,
      commit: { branch: 'feature/work' },
      attempts: 0,
    });
    expect(journal?.executor).toBeUndefined();
    expect(await checkoutClaimFree(project)).toBe(false);
    // The content is gone from the payload; the plan file stays until the operation settles.
    expect(
      await readdir(
        payloadDirectory(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId),
      ),
    ).toEqual([journal?.plan.sha256]);

    const second = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(2, 'again\n'),
    );
    expect(second.stage).toBe('queued');
    const sequences = (await activeJournals(project.engine)).map((item) => item.sequence).sort();
    expect(sequences).toEqual([1, 2]);
  });
});

describe('the order of the file effects', () => {
  it('writes documents first and the manifest last, and writes a move before removing its origin', async () => {
    const project = await writableProject();
    const events: PathEffectEvent[] = [];
    await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      {
        action: 'rename',
        target: { kind: 'document', documentId: 'notes-1' },
        name: 'renamed.md',
        expectedRevision: notesRevision(1),
      },
      {
        sleep: noSleep,
        hooks: {
          onPathEffect: (event) => {
            events.push(event);
            return Promise.resolve();
          },
        },
      },
    );

    const order = events
      .filter((event) => event.kind === 'replaced' || event.kind === 'removed')
      .map((event) => `${event.kind}:${event.path.split('/').pop()}`);
    expect(order).toEqual([
      'replaced:renamed.md',
      'removed:notes-1.md',
      'replaced:specification.yaml',
    ]);
    expect(await text(project, 'renamed.md')).toBe(notesText(1));
    expect(existsSync(join(project.dir, notesPath(1)))).toBe(false);
    expect(await readFile(join(project.dir, 'specification.yaml'), 'utf8')).toContain('renamed.md');
    expect(await strayStageFiles(project.dir)).toEqual([]);
  });

  it('creates documents in new folders together with the registry', async () => {
    const project = await writableProject();
    const result = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      {
        action: 'create',
        documents: [{ path: 'deep/er/new.md', type: 'notes', content: 'new\n' }],
        folders: ['empty'],
      },
      { sleep: noSleep },
    );
    expect(await text(project, 'deep/er/new.md')).toBe('new\n');
    expect(result.folders).toContain('empty');
    expect(result.documents).toHaveLength(1);
    expect(await readFile(join(project.dir, 'specification.yaml'), 'utf8')).toContain(
      'deep/er/new.md',
    );
  });
});

describe('idempotent replay', () => {
  it('returns the stored result and writes nothing more, also after the journal settled', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'once\n');
    const first = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      sleep: noSleep,
    });
    const effects: string[] = [];
    const replay = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      hooks: {
        onPathEffect: (event) => {
          effects.push(event.kind);
          return Promise.resolve();
        },
        beforeJournalWrite: (stage) => {
          effects.push('journal:' + stage);
          return Promise.resolve();
        },
      },
    });
    expect(effects).toEqual([]);
    expect(replay).toEqual({ ...first, replayed: true });
  });

  it('reports the CURRENT commit state of a queued operation', async () => {
    const project = await writableProject({ git: true });
    const operationId = randomUUID();
    const request = saveNotes(2, 'once\n');
    const first = await applyDocumentChange(project.engine, project.specId, operationId, request);
    expect(first.commit.state).toBe('pending');

    // The queue (not part of the writer) records its outcome in the journal.
    const { transitionDocumentChangeJournal } =
      await import('../../src/specs/documents/write/journal-store');
    const sha = 'e'.repeat(40);
    const committing = await transitionDocumentChangeJournal(
      project.engine.context,
      operationId,
      ['queued'],
      'committing',
      { batchId: randomUUID() },
      new Date().toISOString(),
    );
    expect(committing.stage).toBe('committing');
    await transitionDocumentChangeJournal(
      project.engine.context,
      operationId,
      ['committing'],
      'completed',
      { outcome: 'committed', sha, coalescedWith: 0 },
      new Date().toISOString(),
    );
    const replay = await applyDocumentChange(project.engine, project.specId, operationId, request);
    expect(replay).toMatchObject({
      replayed: true,
      stage: 'completed',
      commit: { state: 'committed', sha },
    });
  });

  it('refuses a different body and a different Specification as an operation conflict', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    await applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'a\n'), {
      sleep: noSleep,
    });
    expect(
      await failure(
        applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'b\n')),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_CONFLICT' });
    expect(
      await failure(
        applyDocumentChange(project.engine, randomUUID(), operationId, saveNotes(2, 'a\n')),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_CONFLICT' });
    expect(await text(project, notesPath(2))).toBe('a\n');
  });

  it('refuses an operation id that is not a UUID', async () => {
    const project = await writableProject();
    expect(
      await failure(
        applyDocumentChange(project.engine, project.specId, 'nope', saveNotes(2, 'a\n')),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_INVALID' });
  });
});

describe('a foreign edit', () => {
  it('between admission and reservation refuses with the current revision, holds no claim and replays as the same refusal', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const hooks = {
      afterAdmission: async () => {
        await writeFile(join(project.dir, notesPath(2)), 'edited by someone\n');
      },
    };
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'mine\n'), {
        sleep: noSleep,
        hooks,
      }),
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_REVISION_CONFLICT',
      details: {
        conflicts: [{ documentId: 'notes-2', revision: sha256Hex('edited by someone\n') }],
      },
    });
    expect(await text(project, notesPath(2))).toBe('edited by someone\n');
    expect(await activeJournals(project.engine)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await strayStageFiles(project.dir)).toEqual([]);
    const stored = await readSettledDocumentChangeJournal(project.engine.context, operationId);
    expect(stored).toMatchObject({ stage: 'failed', reason: 'revision-conflict' });

    // The stored refusal is the answer of the same operation id; a new id with the right revision works.
    expect(
      await failure(
        applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'mine\n')),
      ),
    ).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
    const fresh = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      {
        action: 'save',
        documentId: 'notes-2',
        content: 'mine\n',
        expectedRevision: sha256Hex('edited by someone\n'),
      },
      { sleep: noSleep },
    );
    expect(fresh.stage).toBe('completed');
  });

  it('in the middle of a batch leaves the claim and a recoverable write, and a retry completes after the file is restored', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = {
      action: 'save-all' as const,
      documents: [
        { documentId: 'notes-1', content: 'one\n', expectedRevision: notesRevision(1) },
        { documentId: 'notes-2', content: 'two\n', expectedRevision: notesRevision(2) },
      ],
    };
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        sleep: noSleep,
        hooks: {
          onPathEffect: async (event) => {
            if (event.kind === 'replaced' && event.index === 0) {
              await writeFile(join(project.dir, notesPath(2)), 'edited by someone\n');
            }
          },
        },
      }),
    );
    // Something is already in place, so this is no refusal: it needs recovery (503), not a 409, and
    // the client keeps its draft. The conflicting document is still named.
    expect(error).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
      details: {
        cause: 'write-conflict',
        conflicts: [{ documentId: 'notes-2', revision: sha256Hex('edited by someone\n') }],
      },
    });

    // Not a plain failure: the first file is in place, the operation holds the claim.
    const [journal] = await activeJournals(project.engine);
    expect(journal).toMatchObject({
      stage: 'recovery-required',
      recoveryPhase: 'write',
      reason: 'content-changed',
    });
    expect(await checkoutClaimFree(project)).toBe(false);
    expect(await text(project, notesPath(1))).toBe('one\n');
    expect(await text(project, notesPath(2))).toBe('edited by someone\n');

    // The same request keeps answering the same recovery while the foreign edit is there.
    expect(
      await failure(applyDocumentChange(project.engine, project.specId, operationId, request)),
    ).toMatchObject({ code: 'DOCUMENT_RECOVERY_REQUIRED', details: { cause: 'write-conflict' } });

    await writeFile(join(project.dir, notesPath(2)), notesText(2));
    const done = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      sleep: noSleep,
    });
    expect(done).toMatchObject({ stage: 'completed', replayed: true });
    expect(await text(project, notesPath(2))).toBe('two\n');
    expect(await checkoutClaimFree(project)).toBe(true);
  });
});

describe('the manifest changing between planning and reservation', () => {
  const create = {
    action: 'create' as const,
    documents: [{ path: 'fresh.md', content: 'fresh\n' }],
    folders: [],
  };
  const touchManifest = async (dir: string): Promise<void> => {
    await appendFile(join(dir, 'specification.yaml'), '# touched\n');
  };

  it('re-plans once and writes against the new manifest', async () => {
    const project = await writableProject();
    const attempts: number[] = [];
    const result = await applyDocumentChange(project.engine, project.specId, randomUUID(), create, {
      sleep: noSleep,
      hooks: {
        afterAdmission: async (attempt) => {
          attempts.push(attempt);
          if (attempt === 1) await touchManifest(project.dir);
        },
      },
    });
    expect(attempts).toEqual([1, 2]);
    expect(result.stage).toBe('completed');
    expect(await text(project, 'fresh.md')).toBe('fresh\n');
  });

  it('answers SPEC_BUSY (manifest-changed) when it moved again, with nothing reserved or written', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, create, {
        sleep: noSleep,
        hooks: { afterAdmission: () => touchManifest(project.dir) },
      }),
    );
    expect(error).toMatchObject({
      code: 'SPEC_BUSY',
      details: { reason: 'busy', cause: 'manifest-changed', retryAfterMs: 1000 },
    });
    expect(existsSync(join(project.dir, 'fresh.md'))).toBe(false);
    expect(await activeJournals(project.engine)).toEqual([]);
    expect(
      await readSettledDocumentChangeJournal(project.engine.context, operationId),
    ).toBeUndefined();
  });
});

describe('the reservation refuses what it must', () => {
  async function publishWriter(
    project: Awaited<ReturnType<typeof writableProject>>,
    stage: 'reserved' | 'files-writing' | 'recovery-required',
    pathName: string,
  ): Promise<string> {
    const operationId = randomUUID();
    const plan: DocumentChangePlan = {
      version: 1,
      action: 'save',
      specId: project.specId,
      slug: 'hand',
      directory: 'specs/active/hand',
      paths: [
        {
          path: `specs/active/hand/${pathName}`,
          role: 'document',
          pre: { sha256: 'a'.repeat(64), bytes: 1 },
          post: { sha256: 'b'.repeat(64), bytes: 1 },
          source: { kind: 'payload' },
        },
      ],
      documents: [],
      removedDocumentIds: [],
      folders: [],
      allocatedIds: [],
      templates: [],
    };
    const encoded = encodePlan(plan);
    const { writePayload } = await import('../../src/specs/durable');
    await withJournalLock(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
      await writePayload(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
        { sha256: encoded.sha256, content: encoded.text },
      ]);
      await publishJournal(
        project.engine.context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        buildJournal(stage, {
          operationId,
          projectId: project.engine.context.project.projectId,
          specId: project.specId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          plan: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 1, documentCount: 0 },
          sequence: 5,
          ...(stage === 'recovery-required' ? { recoveryPhase: 'write' } : {}),
        }),
      );
    });
    return operationId;
  }

  it('waits and then refuses a path another operation is still writing, but not another path', async () => {
    const project = await writableProject();
    await publishWriter(project, 'files-writing', notesPath(2));
    const slept: number[] = [];
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), saveNotes(2, 'x\n'), {
        busyWaitMs: 300,
        sleep: (ms) => {
          slept.push(ms);
          return new Promise((resolve) => setTimeout(resolve, ms));
        },
      }),
    );
    expect(error).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'write-in-progress' },
    });
    expect(slept.length).toBeGreaterThan(0);
    expect(await text(project, notesPath(2))).toBe(notesText(2));

    const other = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(3, 'y\n'),
      { sleep: noSleep },
    );
    expect(other.stage).toBe('completed');
    // The sequence continues after the highest of the checkout.
    expect((await activeJournals(project.engine)).map((item) => item.sequence)).toContain(5);
  });

  it('refuses at once a path whose earlier write needs recovery', async () => {
    const project = await writableProject();
    await publishWriter(project, 'recovery-required', notesPath(2));
    const slept: number[] = [];
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), saveNotes(2, 'x\n'), {
        sleep: (ms) => {
          slept.push(ms);
          return Promise.resolve();
        },
      }),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'recovery-required' } });
    expect(slept).toEqual([]);
  });

  it('refuses a path of a claimed batch after the bounded wait, and ignores other checkouts and unclaimed batches', async () => {
    const project = await writableProject();
    const batch = (
      state: BatchPathView['state'],
      workspaceId = project.workspaceId,
    ): BatchPathView => ({
      batchId: randomUUID(),
      workspaceId,
      state,
      paths: new Set([`specs/active/hand/${notesPath(2)}`]),
    });
    const withBatches = (batches: BatchPathView[]) => ({
      sleep: noSleep,
      busyWaitMs: 0,
      batches: { list: () => Promise.resolve(batches) },
    });

    const error = await failure(
      applyDocumentChange(
        project.engine,
        project.specId,
        randomUUID(),
        saveNotes(2, 'x\n'),
        withBatches([batch('committing')]),
      ),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'commit-in-progress' } });
    expect(await activeJournals(project.engine)).toEqual([]);

    const free = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(2, 'x\n'),
      withBatches([batch('formed'), batch('committing', randomUUID())]),
    );
    expect(free.stage).toBe('completed');
  });

  it('refuses while a Close or Create holds the checkout, writing nothing', async () => {
    const project = await writableProject();
    const claims = {
      assertClaims: () => Promise.reject(new SharedResourceError('RESOURCE_CONFLICT', 'held')),
    };
    const { writeDocumentChange } = await import('../../src/specs/documents/write');
    const error = await failure(
      writeDocumentChange(
        project.engine,
        claims,
        project.specId,
        randomUUID(),
        saveNotes(2, 'x\n'),
        {
          sleep: noSleep,
        },
      ),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'create-or-close' } });
    expect(await text(project, notesPath(2))).toBe(notesText(2));
    expect(await activeJournals(project.engine)).toEqual([]);
  });

  it('keeps the real claim check wired: dependencies expose the shared claim assertion', () => {
    expect(typeof documentWriteDependencies.assertClaims).toBe('function');
  });
});

describe('journal reads', () => {
  it('finds an active journal and nothing for an unknown id', async () => {
    const project = await writableProject({ git: true });
    const operationId = randomUUID();
    await applyDocumentChange(project.engine, project.specId, operationId, saveNotes(1, 'a\n'));
    expect((await readDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'queued',
    );
    expect(await readDocumentChangeJournal(project.engine.context, randomUUID())).toBeUndefined();
    expect((await readdir(project.dir)).sort()).toContain('specification.yaml');
  });
});

describe('taking over a writer that stopped', () => {
  const identity = (pid: number, start: string, namespace = 'pid:[1]') => ({
    pid,
    hostId: 'host-1',
    pidNamespaceId: namespace,
    processStartTime: start,
    bootId: 'boot-1',
  });
  const statOf = (pid: number, start: string): string =>
    `${pid} (node) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${start} 0 0`;
  const processes = (running: Record<number, string>): ProcessTable => ({
    pid: 4002,
    hostId: () => 'host-1',
    readText: (path) => {
      const pid = /^\/proc\/(\d+)\/stat$/u.exec(path)?.[1];
      return Promise.resolve(
        pid !== undefined && running[Number(pid)] !== undefined
          ? statOf(Number(pid), running[Number(pid)]!)
          : undefined,
      );
    },
    readLink: () => Promise.resolve(undefined),
  });
  const request = saveNotes(2, 'taken over\n');

  /** A write cut after its first file, by a writer that called itself `writer`. */
  async function stoppedWriter(writer: ReturnType<typeof identity>) {
    const project = await writableProject();
    const operationId = randomUUID();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        executor: writer,
        hooks: { onPathEffect: () => Promise.reject(new WriterInterrupted('first')) },
      }),
    );
    expect(error).toBeInstanceOf(WriterInterrupted);
    const journal = await readDocumentChangeJournal(project.engine.context, operationId);
    expect(journal).toMatchObject({ stage: 'files-writing', executor: writer });
    return { project, operationId };
  }

  it('continues a write whose process is gone, and the record names the new writer only while writing', async () => {
    const { project, operationId } = await stoppedWriter(identity(4001, '10'));
    const result = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      executor: identity(4002, '20'),
      processTable: processes({}),
      sleep: noSleep,
    });
    expect(result).toMatchObject({ replayed: true, stage: 'completed' });
    expect(await text(project, notesPath(2))).toBe('taken over\n');
    expect(
      (await readSettledDocumentChangeJournal(project.engine.context, operationId))?.executor,
    ).toBeUndefined();
  });

  it('continues when the PID is running with another start time (the number was reused)', async () => {
    const { project, operationId } = await stoppedWriter(identity(4001, '10'));
    const result = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      executor: identity(4002, '20'),
      processTable: processes({ 4001: '999' }),
      sleep: noSleep,
    });
    expect(result.stage).toBe('completed');
  });

  it('never takes over a writer that is alive or cannot be proven stopped, unless the operator asserts it', async () => {
    const alive = await stoppedWriter(identity(4001, '10'));
    const options = {
      executor: identity(4002, '20'),
      processTable: processes({ 4001: '10' }),
      sleep: noSleep,
    };
    expect(
      await failure(
        applyDocumentChange(
          alive.project.engine,
          alive.project.specId,
          alive.operationId,
          request,
          options,
        ),
      ),
    ).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'write-in-progress', retryAfterMs: 1000 },
    });
    expect(await text(alive.project, notesPath(2))).toBe(notesText(2));

    const elsewhere = await stoppedWriter(identity(4001, '10', 'pid:[7]'));
    const foreign = {
      executor: identity(4002, '20'),
      processTable: processes({}),
      sleep: noSleep,
    };
    expect(
      await failure(
        applyDocumentChange(
          elsewhere.project.engine,
          elsewhere.project.specId,
          elsewhere.operationId,
          request,
          foreign,
        ),
      ),
    ).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'write-in-progress' } });

    const asserted = await applyDocumentChange(
      elsewhere.project.engine,
      elsewhere.project.specId,
      elsewhere.operationId,
      request,
      { ...foreign, confirmWriterStopped: true },
    );
    expect(asserted.stage).toBe('completed');
  });
});

describe('a journaled plan that names one file twice', () => {
  /** Runs `run` as if the process ran on `platform` (the Engine decides case handling by platform). */
  async function onPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
      return await run();
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
  }

  it('is never applied where the file system ignores case: the file stays and the write needs recovery', async () => {
    // A case-only rename journaled by a writer from before the planner refused it on Windows. Applied
    // there, the write of `Notes-1.md` finds `notes-1.md` already "in place" and the removal of
    // `notes-1.md` then deletes the only copy.
    const project = await writableProject();
    const operationId = randomUUID();
    const request = {
      action: 'rename',
      target: { kind: 'document', documentId: 'notes-1' },
      name: 'Notes-1.md',
      expectedRevision: notesRevision(1),
    } as const;
    const state = { sha256: notesRevision(1), bytes: Buffer.byteLength(notesText(1)) };
    const plan: DocumentChangePlan = {
      version: 1,
      action: 'rename',
      specId: project.specId,
      slug: 'hand',
      directory: 'specs/active/hand',
      paths: [
        {
          path: 'specs/active/hand/Notes-1.md',
          role: 'document',
          pre: null,
          post: state,
          source: { kind: 'moved-from', path: 'specs/active/hand/notes-1.md' },
        },
        {
          path: 'specs/active/hand/notes-1.md',
          role: 'document',
          pre: state,
          post: null,
          source: { kind: 'none' },
        },
      ],
      documents: [],
      removedDocumentIds: [],
      folders: [],
      allocatedIds: [],
      templates: [],
    };
    const encoded = encodePlan(plan);
    const { writePayload } = await import('../../src/specs/durable');
    await withJournalLock(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
      await writePayload(project.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
        { sha256: encoded.sha256, content: encoded.text },
      ]);
      await publishJournal(
        project.engine.context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        buildJournal('recovery-required', {
          operationId,
          action: 'rename',
          inputFingerprint: fingerprintDocumentChange(request),
          projectId: project.engine.context.project.projectId,
          specId: project.specId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          plan: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 2, documentCount: 0 },
          sequence: 5,
          recoveryPhase: 'write',
        }),
      );
    });

    const error = await onPlatform('win32', () =>
      failure(
        applyDocumentChange(project.engine, project.specId, operationId, request, {
          sleep: noSleep,
        }),
      ),
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
      details: { cause: 'plan-invalid' },
    });
    expect(await text(project, notesPath(1))).toBe(notesText(1));
    expect((await readDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'recovery-required',
    );
    expect(await strayStageFiles(project.dir)).toEqual([]);
  });
});
