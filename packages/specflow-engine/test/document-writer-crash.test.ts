// Integration (Linux only: real SIGKILL, /proc dead proof): a writer killed at a cut point of the
// write leaves a journal and files that a later process recovers by retrying the same operation id.
// Every path is at its pre or post state at the cut; nothing changed on disk is unjournaled; the claim
// is held until the operation is queued; a live writer is never taken over.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from './support/platform';

import { applyDocumentChange } from '../src/specs/documents/api';
import type { DocumentChangeRequest } from '../src/specs/documents/changes/plan/request';
import { findDocumentChangeJournal } from '../src/specs/documents/write/journal-store';
import { failure, removeTrackedRoots } from './support/documents-fixture';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
  type IndependentVitestWorker,
} from './support/process-worker';
import {
  checkoutClaimFree,
  notesPath,
  notesRevision,
  notesText,
  strayStageFiles,
  text,
  writableProject,
  type WritableProject,
} from './support/document-writes';
import { git } from './support/git-project';

const workers: IndependentVitestWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await removeTrackedRoots();
});

/** A rename: the moved file, the removal of its origin and the manifest (last). */
const RENAME: DocumentChangeRequest = {
  action: 'rename',
  target: { kind: 'document', documentId: 'notes-1' },
  name: 'renamed.md',
  expectedRevision: notesRevision(1),
};
const LAST_INDEX = 2;

const CUTS = [
  { cut: 'after-reserved', stage: 'reserved' },
  { cut: 'staged', stage: 'files-writing' },
  { cut: 'mid-files', stage: 'files-writing' },
  { cut: 'before-manifest', stage: 'files-writing' },
  { cut: 'after-manifest', stage: 'files-writing' },
  { cut: 'before-queued', stage: 'files-writing' },
  { cut: 'after-queued', stage: 'queued' },
  { cut: 'after-payload-released', stage: 'queued' },
] as const;

/** What the disk holds of the rename at each cut: the moved file and the origin. */
const DISK_AT_CUT: Record<(typeof CUTS)[number]['cut'], { moved: boolean; origin: boolean }> = {
  'after-reserved': { moved: false, origin: true },
  staged: { moved: false, origin: true },
  'mid-files': { moved: true, origin: true },
  'before-manifest': { moved: true, origin: false },
  'after-manifest': { moved: true, origin: false },
  'before-queued': { moved: true, origin: false },
  'after-queued': { moved: true, origin: false },
  'after-payload-released': { moved: true, origin: false },
};

function spawnWriter(
  project: WritableProject,
  operationId: string,
  cut: string,
  mode: 'write' | 'replay' = 'write',
) {
  const signal = join(project.root, 'worker-' + randomUUID() + '.checkpoint');
  const worker = spawnVitestWorker(
    'test/fixtures/crash-document-worker.test.ts',
    {
      NEVO_DOCUMENT_CRASH_WORKER: '1',
      NEVO_DOCUMENT_CRASH_HOME: project.root,
      NEVO_DOCUMENT_CRASH_SIGNAL: signal,
      NEVO_DOCUMENT_CRASH_CUT: cut,
      NEVO_DOCUMENT_CRASH_MODE: mode,
      NEVO_DOCUMENT_CRASH_LAST_INDEX: String(LAST_INDEX),
      NEVO_DOCUMENT_CRASH_REQUEST: JSON.stringify(RENAME),
      NEVO_DOCUMENT_CRASH_SPEC: project.specId,
      NEVO_DOCUMENT_CRASH_OPERATION: operationId,
    },
    60000,
  );
  workers.push(worker);
  return { signal, worker };
}

async function renamedState(
  project: WritableProject,
): Promise<{ moved: boolean; origin: boolean }> {
  const exists = async (path: string): Promise<boolean> => {
    try {
      await text(project, path);
      return true;
    } catch {
      return false;
    }
  };
  return { moved: await exists('renamed.md'), origin: await exists(notesPath(1)) };
}

describe.skipIf(!onLinux)('a writer killed with SIGKILL', () => {
  for (const { cut, stage } of CUTS) {
    for (const withGit of [false, true]) {
      it(`at ${cut} (Git ${withGit ? 'on' : 'off'}): the same operation id completes it`, async () => {
        const project = await writableProject({ git: withGit });
        const head = withGit ? git(project.root, 'rev-parse', 'HEAD') : '';
        const operationId = randomUUID();
        const { signal, worker } = spawnWriter(project, operationId, cut);
        await awaitProcessMarker(signal, worker, 45000, 30);
        const checkpoint = await readProcessCheckpoint(signal, cut);

        // While the writer is alive nobody takes it over: its PID runs with the recorded start time.
        if (cut === 'mid-files') {
          expect(
            await failure(applyDocumentChange(project.engine, project.specId, operationId, RENAME)),
          ).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'write-in-progress' } });
        }
        await terminateCheckpointPid(checkpoint.pid, worker);

        // At the cut: pre or post for every path, a journal, the claim held (also once queued).
        const journal = await findDocumentChangeJournal(project.engine.context, operationId);
        expect(journal?.stage).toBe(stage);
        expect(await renamedState(project)).toEqual(DISK_AT_CUT[cut]);
        expect(await checkoutClaimFree(project)).toBe(false);
        if (stage !== 'queued') expect(journal?.executor?.pid).toBe(checkpoint.pid);

        const result = await applyDocumentChange(
          project.engine,
          project.specId,
          operationId,
          RENAME,
        );
        expect(result.replayed).toBe(true);
        expect(result.stage).toBe(withGit ? 'queued' : 'completed');
        expect(await renamedState(project)).toEqual({ moved: true, origin: false });
        expect(await text(project, 'renamed.md')).toBe(notesText(1));
        expect(await text(project, 'specification.yaml')).toContain('renamed.md');
        expect(await strayStageFiles(project.dir)).toEqual([]);
        expect(await checkoutClaimFree(project)).toBe(!withGit);
        if (withGit) expect(git(project.root, 'rev-parse', 'HEAD')).toBe(head);
      }, 120000);
    }
  }
});

describe.skipIf(!onLinux)('a second process that continues the operation of a dead writer', () => {
  it('is the only writer: a third replayer is refused while it lives, and its stage file is cleaned after it dies', async () => {
    const project = await writableProject();
    const operationId = randomUUID();
    const manifest = await text(project, 'specification.yaml');

    const first = spawnWriter(project, operationId, 'after-reserved');
    await awaitProcessMarker(first.signal, first.worker, 45000, 30);
    await terminateCheckpointPid(
      (await readProcessCheckpoint(first.signal, 'after-reserved')).pid,
      first.worker,
    );

    // The second process proves the first dead, takes the write over and pauses with a stage file made.
    const second = spawnWriter(project, operationId, 'staged', 'replay');
    await awaitProcessMarker(second.signal, second.worker, 45000, 30);
    const paused = await readProcessCheckpoint(second.signal, 'staged');
    const journal = await findDocumentChangeJournal(project.engine.context, operationId);
    expect(journal).toMatchObject({ stage: 'files-writing' });
    expect(journal?.executor?.pid).toBe(paused.pid);
    expect(await strayStageFiles(project.dir)).toHaveLength(1);

    // A third one finds a live writer in the record and does not write; the targets are untouched.
    expect(
      await failure(applyDocumentChange(project.engine, project.specId, operationId, RENAME)),
    ).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'write-in-progress' } });
    expect(await text(project, 'specification.yaml')).toBe(manifest);
    expect(await renamedState(project)).toEqual({ moved: false, origin: true });

    await terminateCheckpointPid(paused.pid, second.worker);
    const done = await applyDocumentChange(project.engine, project.specId, operationId, RENAME);
    expect(done).toMatchObject({ stage: 'completed', replayed: true });
    expect(await renamedState(project)).toEqual({ moved: true, origin: false });
    expect(await strayStageFiles(project.dir)).toEqual([]);
  }, 120000);
});
