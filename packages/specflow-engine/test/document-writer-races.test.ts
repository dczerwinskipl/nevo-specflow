// Integration (real project, real files): who owns a write, what a foreign edit does to it and what is
// left behind. Compare-and-replace takeover of the executor, the clean refusal while nothing is on
// disk, the recovery mapping once something is, the hard-link check of a replacement, the mode of a
// replaced file, stage-file cleanup, the sweep of orphan payloads and the mapping of stray errors.
import { randomUUID } from 'node:crypto';
import { chmod, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hardLinksAvailable, onPosix } from './support/platform';

import { sha256Hex } from '../src/hash';
import { payloadDirectory } from '../src/specs/durable';
import { applyDocumentChange, documentWriteDependencies } from '../src/specs/documents/api';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../src/specs/documents/changes/journal/kind';
import type { ProcessTable } from '../src/specs/documents/write/executor-identity';
import {
  WriterInterrupted,
  nodeDocumentFileOps,
  type DocumentFileOps,
} from '../src/specs/documents/write/file-effects';
import {
  JournalMovedError,
  findDocumentChangeJournal,
  readSettledDocumentChangeJournal,
} from '../src/specs/documents/write/journal-store';
import { claimWrite } from '../src/specs/documents/write/write-phase';
import { createWriteRuntime } from '../src/specs/documents/write/writer';
import { failure, removeTrackedRoots } from './support/documents-fixture';
import {
  activeJournals,
  checkoutClaimFree,
  errnoError,
  noSleep,
  notesPath,
  notesRevision,
  notesText,
  saveNotes,
  strayStageFiles,
  text,
  writableProject,
} from './support/document-writes';
import { commitStaged, git } from './support/git-project';

afterEach(removeTrackedRoots);

const FAST = { sleep: noSleep, retries: { count: 0, delayMs: 0 } } as const;

describe('a foreign edit found right after files-writing, with nothing of the write on disk', () => {
  it('is a refusal without a claim, not a wedged document', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'mine\n'), {
        ...FAST,
        hooks: {
          afterJournalWrite: async (stage) => {
            if (stage === 'files-writing') {
              await writeFile(join(project.dir, notesPath(2)), 'edited by someone\n');
            }
          },
        },
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
    expect(
      await readSettledDocumentChangeJournal(project.engine.context, operationId),
    ).toMatchObject({ stage: 'failed', reason: 'revision-conflict' });

    // The refusal is the answer of that id; a new id with the revision just read goes through.
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
      FAST,
    );
    expect(fresh.stage).toBe('completed');
  });

  it('also ends a write-phase recovery whose retry finds the file edited and nothing changed', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'mine\n');
    const failing: DocumentFileOps = {
      ...nodeDocumentFileOps,
      writeStaged: () => Promise.reject(errnoError('ENOSPC')),
    };
    expect(
      await failure(
        applyDocumentChange(project.engine, project.specId, operationId, request, {
          ...FAST,
          files: failing,
        }),
      ),
    ).toMatchObject({ code: 'DOCUMENT_WRITE_FAILED', details: { cause: 'no-space' } });
    expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'recovery-required',
    );
    expect(await checkoutClaimFree(project)).toBe(false);

    await writeFile(join(project.dir, notesPath(2)), 'edited by someone\n');
    expect(
      await failure(
        applyDocumentChange(project.engine, project.specId, operationId, request, FAST),
      ),
    ).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
    expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'failed',
    );
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await text(project, notesPath(2))).toBe('edited by someone\n');
  });
});

describe.skipIf(!hardLinksAvailable)(
  'a write that lands in place at the moment of the replacement',
  () => {
    const inPlace = (project: { dir: string }, index: number, atPath: number) => ({
      onPathEffect: async (event: { kind: string; index: number }) => {
        if (event.kind === 'before-replace' && event.index === atPath) {
          await writeFile(join(project.dir, notesPath(index)), 'foreign bytes\n');
        }
      },
    });

    it('is kept and refused when nothing else of the write is on disk', async () => {
      const project = await writableProject();
      const error = await failure(
        applyDocumentChange(project.engine, project.specId, randomUUID(), saveNotes(2, 'mine\n'), {
          ...FAST,
          hooks: inPlace(project, 2, 0),
        }),
      );
      expect(error).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
      expect(await text(project, notesPath(2))).toBe('foreign bytes\n');
      expect(await checkoutClaimFree(project)).toBe(true);
      expect(await strayStageFiles(project.dir)).toEqual([]);
    });

    it('is kept and needs recovery when an earlier file of the write is already in place', async () => {
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
          ...FAST,
          hooks: inPlace(project, 2, 1),
        }),
      );
      expect(error).toMatchObject({
        code: 'DOCUMENT_RECOVERY_REQUIRED',
        details: { cause: 'write-conflict' },
      });
      expect(await text(project, notesPath(1))).toBe('one\n');
      expect(await text(project, notesPath(2))).toBe('foreign bytes\n');
      expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
        'recovery-required',
      );
      expect(await checkoutClaimFree(project)).toBe(false);
      expect(await strayStageFiles(project.dir)).toEqual([]);
    });
  },
);

describe.skipIf(!hardLinksAvailable)('a writer that died right after the replacement', () => {
  it('does not delete a foreign write that only the backup link holds: it goes back as the document', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'mine\n');
    // A foreign in-place write lands after the second hash, then the writer dies after the rename and
    // before it looks at the backup.
    let replaced = false;
    const dying: DocumentFileOps = {
      ...nodeDocumentFileOps,
      rename: async (from, to) => {
        await nodeDocumentFileOps.rename(from, to);
        if (!replaced && to.endsWith(notesPath(2))) {
          replaced = true;
          throw new WriterInterrupted('after-replace');
        }
      },
    };
    await expect(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        ...FAST,
        files: dying,
        hooks: {
          onPathEffect: async (event) => {
            if (event.kind === 'before-replace') {
              await writeFile(join(project.dir, notesPath(2)), 'foreign bytes\n');
            }
          },
        },
      }),
    ).rejects.toBeInstanceOf(WriterInterrupted);
    expect(await text(project, notesPath(2))).toBe('mine\n');

    const error = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, FAST),
    );
    // Nothing else of the write is in place, so it is a refusal; the foreign bytes are the document.
    expect(error).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
    expect(await text(project, notesPath(2))).toBe('foreign bytes\n');
    expect(await strayStageFiles(project.dir)).toEqual([]);
  });
});

describe.skipIf(!onPosix)('the mode of a document that is saved', () => {
  it('keeps the executable bit, so the commit shows no mode change', async () => {
    const project = await writableProject({ git: true });
    await chmod(join(project.dir, notesPath(3)), 0o755);
    git(project.root, 'add', 'specs');
    commitStaged(project.root, 'executable');
    expect((await stat(join(project.dir, notesPath(3)))).mode & 0o111).not.toBe(0);

    await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(3, 'changed\n'),
    );
    expect((await stat(join(project.dir, notesPath(3)))).mode & 0o777).toBe(0o755);
    expect(git(project.root, 'diff', '--summary')).toBe('');
    expect(await text(project, notesPath(3))).toBe('changed\n');
  });

  it('carries the executable bit of a script to the path it is renamed to', async () => {
    const project = await writableProject({ git: true });
    await chmod(join(project.dir, notesPath(3)), 0o755);
    git(project.root, 'add', 'specs');
    commitStaged(project.root, 'executable');

    await applyDocumentChange(project.engine, project.specId, randomUUID(), {
      action: 'rename',
      target: { kind: 'document', documentId: 'notes-3' },
      name: 'renamed.md',
      expectedRevision: notesRevision(3),
    });
    expect((await stat(join(project.dir, 'renamed.md'))).mode & 0o777).toBe(0o755);
  });
});

describe('taking the write over', () => {
  const identity = (pid: number, start: string) => ({
    pid,
    hostId: 'host-1',
    pidNamespaceId: 'pid:[1]',
    processStartTime: start,
    bootId: 'boot-1',
  });
  const statOf = (pid: number, start: string): string =>
    `${pid} (node) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${start} 0 0`;
  const processes = (running: Record<number, string>): ProcessTable => ({
    pid: 1,
    hostId: () => 'host-1',
    readText: (path) => {
      const pid = /^\/proc\/(\d+)\/stat$/u.exec(path)?.[1];
      const start = pid === undefined ? undefined : running[Number(pid)];
      return Promise.resolve(start === undefined ? undefined : statOf(Number(pid), start));
    },
    readLink: () => Promise.resolve(undefined),
  });

  async function stopped() {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'taken over\n');
    await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        executor: identity(4001, '10'),
        hooks: { onPathEffect: () => Promise.reject(new WriterInterrupted('first')) },
      }),
    );
    const journal = (await findDocumentChangeJournal(project.engine.context, operationId))!;
    expect(journal.stage).toBe('files-writing');
    return { project, operationId, request, journal };
  }

  it('is one compare-and-replace: the second replayer that proved the same executor dead is refused', async () => {
    const { project, operationId, request, journal } = await stopped();
    const runtimeOf = (pid: number) =>
      createWriteRuntime(project.engine, documentWriteDependencies, {
        executor: identity(pid, String(pid)),
      });

    const taken = await claimWrite(runtimeOf(4002), journal);
    expect(taken.executor).toEqual(identity(4002, '4002'));
    await expect(claimWrite(runtimeOf(4003), journal)).rejects.toBeInstanceOf(JournalMovedError);
    expect(
      (await findDocumentChangeJournal(project.engine.context, operationId))?.executor?.pid,
    ).toBe(4002);

    // And a replay by the loser now sees a live writer: busy, nothing written.
    const busy = await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        executor: identity(4003, '4003'),
        processTable: processes({ 4002: '4002' }),
        sleep: noSleep,
      }),
    );
    expect(busy).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'write-in-progress' } });
    expect(await text(project, notesPath(2))).toBe(notesText(2));
  });

  it('is taken back from a write-phase recovery only while it is still that recovery', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const failing: DocumentFileOps = {
      ...nodeDocumentFileOps,
      writeStaged: () => Promise.reject(errnoError('EIO')),
    };
    await failure(
      applyDocumentChange(project.engine, project.specId, operationId, saveNotes(2, 'x\n'), {
        ...FAST,
        files: failing,
      }),
    );
    const recovery = (await findDocumentChangeJournal(project.engine.context, operationId))!;
    expect(recovery.stage).toBe('recovery-required');
    const first = createWriteRuntime(project.engine, documentWriteDependencies, {
      executor: identity(4002, '2'),
    });
    expect((await claimWrite(first, recovery)).stage).toBe('files-writing');
    await expect(
      claimWrite(
        createWriteRuntime(project.engine, documentWriteDependencies, {
          executor: identity(4003, '3'),
        }),
        recovery,
      ),
    ).rejects.toBeInstanceOf(JournalMovedError);
  });
});

describe('stage files', () => {
  it('are removed when the replay finds the path edited by someone else', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'mine\n');
    await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        hooks: {
          onPathEffect: (event) =>
            event.kind === 'staged'
              ? Promise.reject(new WriterInterrupted('staged'))
              : Promise.resolve(),
        },
      }),
    );
    expect(await strayStageFiles(project.dir)).toHaveLength(1);
    await writeFile(join(project.dir, notesPath(2)), 'edited by someone\n');

    expect(
      await failure(applyDocumentChange(project.engine, project.specId, operationId, request)),
    ).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
    expect(await strayStageFiles(project.dir)).toEqual([]);
  });

  it('left by another executor of the operation are removed by pattern when the write continues', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'mine\n');
    await failure(
      applyDocumentChange(project.engine, project.specId, operationId, request, {
        hooks: {
          onPathEffect: (event) =>
            event.kind === 'staged'
              ? Promise.reject(new WriterInterrupted('staged'))
              : Promise.resolve(),
        },
      }),
    );
    const [left] = await strayStageFiles(project.dir);
    expect(left).toBeDefined();
    const result = await applyDocumentChange(
      project.engine,
      project.specId,
      operationId,
      request,
      FAST,
    );
    expect(result.stage).toBe('completed');
    expect(await strayStageFiles(project.dir)).toEqual([]);
  });
});

describe('payloads that belong to no journal', () => {
  it('are swept after the retention, and a payload of a live operation never is', async () => {
    const project = await writableProject();
    const context = project.engine.context;
    const orphan = randomUUID();
    await failure(
      applyDocumentChange(project.engine, project.specId, orphan, saveNotes(1, 'a\n'), {
        hooks: { beforeReservationPublish: () => Promise.reject(new WriterInterrupted('plan')) },
      }),
    );
    const orphanDir = payloadDirectory(context, DOCUMENT_CHANGE_JOURNAL_KIND, orphan);
    expect((await stat(orphanDir)).isDirectory()).toBe(true);

    // Younger than the retention: kept (a retry of the same id would replace it anyway).
    await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(2, 'b\n'),
      FAST,
    );
    expect((await stat(orphanDir)).isDirectory()).toBe(true);

    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(orphanDir, old, old);
    const live = randomUUID();
    await applyDocumentChange(project.engine, project.specId, live, saveNotes(3, 'c\n'), FAST);
    await expect(stat(orphanDir)).rejects.toThrow();
    // The plan file of the settled operation stays for its replay window.
    expect(
      (await stat(payloadDirectory(context, DOCUMENT_CHANGE_JOURNAL_KIND, live))).isDirectory(),
    ).toBe(true);
  });
});

describe("errors that are not the write's own", () => {
  it('a stray error of the journal path is DOCUMENT_WRITE_FAILED (io-error), never a raw one', async () => {
    const project = await writableProject();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), saveNotes(2, 'x\n'), {
        ...FAST,
        hooks: { beforeJournalWrite: () => Promise.reject(new Error('boom')) },
      }),
    );
    expect(error).toMatchObject({ code: 'DOCUMENT_WRITE_FAILED', details: { cause: 'io-error' } });
  });

  it('keep their own meaning when they come from admission', async () => {
    const project = await writableProject();
    expect(
      await failure(
        applyDocumentChange(project.engine, randomUUID(), randomUUID(), saveNotes(2, 'x\n'), FAST),
      ),
    ).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });
});

describe('two copies of the module in one process', () => {
  it('still write one operation at a time', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const request = saveNotes(2, 'once\n');
    vi.resetModules();
    const copy = await import('../src/specs/documents/api');
    expect(copy.applyDocumentChange).not.toBe(applyDocumentChange);

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const effects: string[] = [];
    const first = applyDocumentChange(project.engine, project.specId, operationId, request, {
      ...FAST,
      hooks: {
        afterJournalWrite: async (stage) => {
          if (stage === 'reserved') await gate;
        },
        onPathEffect: (event) => {
          effects.push('first:' + event.kind);
          return Promise.resolve();
        },
      },
    });
    // Wait until the first copy holds the reservation.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await findDocumentChangeJournal(project.engine.context, operationId)) !== undefined)
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const second = copy.applyDocumentChange(project.engine, project.specId, operationId, request, {
      ...FAST,
      hooks: {
        onPathEffect: (event) => {
          effects.push('second:' + event.kind);
          return Promise.resolve();
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(effects).toEqual([]);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.stage).toBe('completed');
    expect(b).toMatchObject({ stage: 'completed', replayed: true });
    expect(effects.every((effect) => effect.startsWith('first:'))).toBe(true);
    expect(await text(project, notesPath(2))).toBe('once\n');
  });
});
