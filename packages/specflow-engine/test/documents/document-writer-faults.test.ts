// Integration (real project, real files, injected faults): the writer under failure. A fault at every
// journal write and every file effect, a crash simulated at every point of the write followed by the
// replay, and the invariants that hold in between:
//   - every change that reached the disk is journaled;
//   - every path is at its pre or its post state;
//   - the claim is held until the operation is queued (or completed);
//   - the same operation id, retried, completes the write.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { applyDocumentChange, resumeDocumentChange } from '../../src/specs/documents/api';
import type { DocumentChangeRequest } from '../../src/specs/documents/changes/plan/request';
import type { DocumentChangeStage } from '../../src/specs/documents/changes/journal/stages';
import {
  WriterInterrupted,
  nodeDocumentFileOps,
  type DocumentFileOps,
  type PathEffectEvent,
} from '../../src/specs/documents/write/file-effects';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import type { DocumentWriteOptions } from '../../src/specs/documents/write';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
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
  type WritableProject,
} from '../support/document-writes';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const FAST: DocumentWriteOptions = { sleep: noSleep };

const isStageFileName = (path: string): boolean => /[\\/]\.n[vb][0-9a-f]{13}$/u.test(path);

/** The file operations of the writer with a counter and an optional fault. */
function countingOps(fault?: {
  readonly at: number;
  readonly persistent: boolean;
  readonly code: string;
}) {
  const state = { calls: 0, healed: false };
  const wrap =
    <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      state.calls += 1;
      if (
        fault !== undefined &&
        !state.healed &&
        (state.calls === fault.at || (fault.persistent && state.calls > fault.at))
      ) {
        return Promise.reject(errnoError(fault.code));
      }
      return run(...args);
    };
  const ops: DocumentFileOps = {
    verified: nodeDocumentFileOps.verified,
    mkdir: wrap((path: string) => nodeDocumentFileOps.mkdir(path)),
    writeStaged: wrap((path: string, bytes: Uint8Array) =>
      nodeDocumentFileOps.writeStaged(path, bytes),
    ),
    rename: wrap((from: string, to: string) => nodeDocumentFileOps.rename(from, to)),
    // Removing a stage or backup file is housekeeping and is not counted; removing a document is.
    remove: (path: string) =>
      isStageFileName(path)
        ? nodeDocumentFileOps.remove(path)
        : wrap((target: string) => nodeDocumentFileOps.remove(target))(path),
    syncDirectory: wrap((path: string) => nodeDocumentFileOps.syncDirectory(path)),
    link: wrap((existing: string, created: string) => nodeDocumentFileOps.link(existing, created)),
    chmod: (path: string, mode: number) => nodeDocumentFileOps.chmod(path, mode),
    list: (path: string) => nodeDocumentFileOps.list(path),
  };
  return { ops, state };
}

interface Case {
  readonly name: string;
  /** The request on documents of `slot` (each iteration uses its own, still untouched documents). */
  readonly request: (slot: number) => DocumentChangeRequest;
  /** The path -> [pre, post] text of every file the request changes (post `null`: removed). */
  readonly files: (slot: number) => Record<string, readonly [string | null, string | null]>;
}

const DOCS_PER_SLOT = 3;
const docsOf = (slot: number): number[] =>
  Array.from({ length: DOCS_PER_SLOT }, (_, offset) => slot * DOCS_PER_SLOT + offset + 1);

const CASES: readonly Case[] = [
  {
    name: 'a batch save of three documents',
    request: (slot) => ({
      action: 'save-all',
      documents: docsOf(slot).map((index) => ({
        documentId: `notes-${index}`,
        content: `batch ${index}\n`,
        expectedRevision: notesRevision(index),
      })),
    }),
    files: (slot) =>
      Object.fromEntries(
        docsOf(slot).map((index) => [notesPath(index), [notesText(index), `batch ${index}\n`]]),
      ),
  },
  {
    name: 'a rename (a move, a removal and the manifest)',
    request: (slot) => ({
      action: 'rename',
      target: { kind: 'document', documentId: `notes-${docsOf(slot)[0]}` },
      name: `renamed-${slot}.md`,
      expectedRevision: notesRevision(docsOf(slot)[0]!),
    }),
    files: (slot) => ({
      [notesPath(docsOf(slot)[0]!)]: [notesText(docsOf(slot)[0]!), null],
      [`renamed-${slot}.md`]: [null, notesText(docsOf(slot)[0]!)],
    }),
  },
];

const SLOTS = 20;
const project = (git: boolean): Promise<WritableProject> =>
  writableProject({ git, notes: SLOTS * DOCS_PER_SLOT });

async function fileText(p: WritableProject, path: string): Promise<string | null> {
  try {
    return await readFile(join(p.dir, path), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The invariant that must hold at every point of a write, before any replay: each path is at its pre
 * or post state, and if anything of the operation is on the disk the operation has a journal, which
 * holds the claim while it is not yet queued.
 */
async function assertWriteInvariant(
  p: WritableProject,
  operationId: string,
  files: Record<string, readonly [string | null, string | null]>,
): Promise<DocumentChangeStage | undefined> {
  let changed = false;
  for (const [path, [pre, post]] of Object.entries(files)) {
    const now = await fileText(p, path);
    expect([pre, post], `${path} is at neither its pre nor its post state`).toContain(now);
    if (now !== pre) changed = true;
  }
  const journal = await findDocumentChangeJournal(p.engine.context, operationId);
  if (changed) {
    expect(journal, 'a change is on disk without a journal').toBeDefined();
  }
  if (journal !== undefined) {
    const active = (await activeJournals(p.engine)).some(
      (item) => item.operationId === operationId,
    );
    if (journal.stage === 'reserved' || journal.stage === 'files-writing') {
      expect(await checkoutClaimFree(p), 'the claim is not held while writing').toBe(false);
    }
    if (journal.stage === 'recovery-required') {
      expect(journal.recoveryPhase).toBe('write');
      expect(await checkoutClaimFree(p)).toBe(false);
    }
    if (!active) expect(['completed', 'failed']).toContain(journal.stage);
  }
  return journal?.stage;
}

async function assertFinished(
  p: WritableProject,
  git: boolean,
  files: Record<string, readonly [string | null, string | null]>,
  operationId: string,
): Promise<void> {
  for (const [path, [, post]] of Object.entries(files)) {
    expect(await fileText(p, path), path).toBe(post);
  }
  expect(await strayStageFiles(p.dir)).toEqual([]);
  const journal = await findDocumentChangeJournal(p.engine.context, operationId);
  expect(journal?.stage).toBe(git ? 'queued' : 'completed');
  expect(await checkoutClaimFree(p)).toBe(!git);
}

describe.each([false, true])('a fault at every journal write (Git enabled: %s)', (git) => {
  const stages: DocumentChangeStage[] = git
    ? ['reserved', 'files-writing', 'queued']
    : ['reserved', 'files-writing', 'queued', 'completed'];
  const faults = [
    { name: 'a full disk before the write', hook: 'beforeJournalWrite', throws: 'enospc' },
    { name: 'a crash before the write', hook: 'beforeJournalWrite', throws: 'crash' },
    { name: 'a crash after the write', hook: 'afterJournalWrite', throws: 'crash' },
  ] as const;

  for (const [stageIndex, stage] of stages.entries()) {
    for (const fault of faults) {
      it(`${fault.name} of the ${stage} journal: the replay completes, the invariant holds`, async () => {
        const p = await project(git);
        const slot = stageIndex;
        const fixture = CASES[0]!;
        const operationId = randomUUID();
        const request = fixture.request(slot);
        const files = fixture.files(slot);
        const inject = (at: DocumentChangeStage): Promise<void> => {
          if (at !== stage) return Promise.resolve();
          return Promise.reject(
            fault.throws === 'enospc' ? errnoError('ENOSPC') : new WriterInterrupted(stage),
          );
        };

        const error = await failure(
          applyDocumentChange(p.engine, p.specId, operationId, request, {
            ...FAST,
            hooks: { [fault.hook]: inject },
          }),
        );
        if (fault.throws === 'enospc') {
          expect(error).toMatchObject({
            code: 'DOCUMENT_WRITE_FAILED',
            details: { cause: 'no-space' },
          });
        } else {
          expect(error).toBeInstanceOf(WriterInterrupted);
        }
        await assertWriteInvariant(p, operationId, files);

        const result = await applyDocumentChange(p.engine, p.specId, operationId, request, FAST);
        // A replay of a change that was never reserved is a fresh write; otherwise it continues.
        const neverReserved = stage === 'reserved' && fault.hook === 'beforeJournalWrite';
        expect(result.replayed).toBe(!neverReserved);
        await assertFinished(p, git, files, operationId);
        expect(result.stage).toBe(git ? 'queued' : 'completed');
      });
    }
  }
});

describe.each([false, true])('a fault at every file effect (Git enabled: %s)', (git) => {
  for (const fixture of CASES) {
    describe(fixture.name, () => {
      it('is repeated once on a full disk or an I/O error and then succeeds', async () => {
        const p = await project(git);
        const counter = countingOps();
        await applyDocumentChange(p.engine, p.specId, randomUUID(), fixture.request(0), {
          ...FAST,
          files: counter.ops,
        });
        const total = counter.state.calls;
        expect(total).toBeGreaterThan(5);
        expect(total).toBeLessThan(SLOTS);

        for (let at = 1; at <= total; at += 1) {
          const slot = at;
          const operationId = randomUUID();
          const faulty = countingOps({
            at,
            persistent: false,
            code: at % 2 === 0 ? 'EIO' : 'ENOSPC',
          });
          const result = await applyDocumentChange(
            p.engine,
            p.specId,
            operationId,
            fixture.request(slot),
            { ...FAST, files: faulty.ops },
          );
          expect(result.stage).toBe(git ? 'queued' : 'completed');
          await assertFinished(p, git, fixture.files(slot), operationId);
        }
      });

      it('rolls forward under the claim when it keeps failing, answers 503 and completes on the retry', async () => {
        const p = await project(git);
        const counter = countingOps();
        await applyDocumentChange(p.engine, p.specId, randomUUID(), fixture.request(0), {
          ...FAST,
          files: counter.ops,
        });
        const total = counter.state.calls;
        expect(total).toBeLessThan(SLOTS);

        for (let at = 1; at <= total; at += 1) {
          const slot = at;
          const operationId = randomUUID();
          const request = fixture.request(slot);
          const files = fixture.files(slot);
          const code = at % 3 === 0 ? 'EIO' : 'ENOSPC';
          const faulty = countingOps({ at, persistent: true, code });

          const error = await failure(
            applyDocumentChange(p.engine, p.specId, operationId, request, {
              ...FAST,
              files: faulty.ops,
            }),
          );
          expect(error, `fault at effect ${at}`).toMatchObject({
            code: 'DOCUMENT_WRITE_FAILED',
            details: { cause: code === 'EIO' ? 'io-error' : 'no-space' },
          });
          // Not a plain failure: the journal holds the claim and every path is at pre or post.
          expect(await assertWriteInvariant(p, operationId, files)).toBe('recovery-required');
          const [stored] = (await activeJournals(p.engine)).filter(
            (item) => item.operationId === operationId,
          );
          expect(stored).toMatchObject({ recoveryPhase: 'write' });

          // The client retries the SAME operation id, with the disk healthy again.
          faulty.state.healed = true;
          const result = await applyDocumentChange(p.engine, p.specId, operationId, request, {
            ...FAST,
            files: faulty.ops,
          });
          expect(result.replayed).toBe(true);
          await assertFinished(p, git, files, operationId);
        }
      });
    });
  }
});

describe.each([false, true])('a crash at every effect of the write (Git enabled: %s)', (git) => {
  for (const fixture of CASES) {
    it(`${fixture.name}: the replay finishes it and removes what the crash left`, async () => {
      const p = await project(git);
      const seen: PathEffectEvent[] = [];
      await applyDocumentChange(p.engine, p.specId, randomUUID(), fixture.request(0), {
        ...FAST,
        hooks: {
          onPathEffect: (event) => {
            seen.push(event);
            return Promise.resolve();
          },
        },
      });
      expect(seen.length).toBeGreaterThanOrEqual(6);
      expect(seen.length).toBeLessThan(SLOTS);

      for (let cut = 0; cut < seen.length; cut += 1) {
        const slot = cut + 1;
        const operationId = randomUUID();
        const request = fixture.request(slot);
        const files = fixture.files(slot);
        let count = 0;
        const error = await failure(
          applyDocumentChange(p.engine, p.specId, operationId, request, {
            ...FAST,
            hooks: {
              onPathEffect: (event) => {
                if (count++ === cut) {
                  return Promise.reject(new WriterInterrupted(`${event.kind}:${event.index}`));
                }
                return Promise.resolve();
              },
            },
          }),
        );
        expect(error).toBeInstanceOf(WriterInterrupted);
        const stage = await assertWriteInvariant(p, operationId, files);
        expect(stage, `cut at effect ${cut}`).toBe('files-writing');

        const result = await resumeDocumentChange(p.engine, operationId, FAST);
        expect(result.replayed).toBe(true);
        await assertFinished(p, git, files, operationId);
      }
    });
  }
});

describe('the cut points around the acknowledgement', () => {
  it('after queued, before the payload is released: the replay releases it and answers', async () => {
    const p = await project(true);
    const operationId = randomUUID();
    const request = saveNotes(1, 'a\n');
    const error = await failure(
      applyDocumentChange(p.engine, p.specId, operationId, request, {
        hooks: {
          afterJournalWrite: (stage) =>
            stage === 'queued'
              ? Promise.reject(new WriterInterrupted('queued'))
              : Promise.resolve(),
        },
      }),
    );
    expect(error).toBeInstanceOf(WriterInterrupted);
    const { readdir } = await import('node:fs/promises');
    const { payloadDirectory } = await import('../../src/specs/durable');
    const { DOCUMENT_CHANGE_JOURNAL_KIND } =
      await import('../../src/specs/documents/changes/journal/kind');
    const directory = payloadDirectory(p.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
    expect((await readdir(directory)).length).toBe(2);

    const replay = await applyDocumentChange(p.engine, p.specId, operationId, request);
    expect(replay).toMatchObject({ replayed: true, stage: 'queued', commit: { state: 'pending' } });
    expect((await readdir(directory)).length).toBe(1);
    expect(await text(p, notesPath(1))).toBe('a\n');
  });

  it('between the plan and the journal: nothing is journaled and the retry writes', async () => {
    const p = await project(false);
    const operationId = randomUUID();
    const request = saveNotes(1, 'a\n');
    const error = await failure(
      applyDocumentChange(p.engine, p.specId, operationId, request, {
        ...FAST,
        hooks: { beforeReservationPublish: () => Promise.reject(new WriterInterrupted('plan')) },
      }),
    );
    expect(error).toBeInstanceOf(WriterInterrupted);
    expect(await findDocumentChangeJournal(p.engine.context, operationId)).toBeUndefined();
    expect(await text(p, notesPath(1))).toBe(notesText(1));
    expect(await checkoutClaimFree(p)).toBe(true);

    const result = await applyDocumentChange(p.engine, p.specId, operationId, request, FAST);
    expect(result).toMatchObject({ replayed: false, stage: 'completed' });
    expect(await text(p, notesPath(1))).toBe('a\n');
  });

  it('a payload that cannot be proven keeps the operation recovery-required, never invents content', async () => {
    const p = await project(false);
    const operationId = randomUUID();
    const request = saveNotes(1, 'a\n');
    await failure(
      applyDocumentChange(p.engine, p.specId, operationId, request, {
        ...FAST,
        hooks: {
          onPathEffect: () => Promise.reject(new WriterInterrupted('first')),
        },
      }),
    );
    const { payloadDirectory } = await import('../../src/specs/durable');
    const { DOCUMENT_CHANGE_JOURNAL_KIND } =
      await import('../../src/specs/documents/changes/journal/kind');
    const { rm } = await import('node:fs/promises');
    const journal = await findDocumentChangeJournal(p.engine.context, operationId);
    const { sha256Hex } = await import('../../src/hash');
    await rm(
      join(
        payloadDirectory(p.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId),
        sha256Hex('a\n'),
      ),
    );
    expect(journal?.stage).toBe('files-writing');

    const error = await failure(
      applyDocumentChange(p.engine, p.specId, operationId, request, FAST),
    );
    expect(error).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
      details: { cause: 'payload-unprovable' },
    });
    expect((await findDocumentChangeJournal(p.engine.context, operationId))?.stage).toBe(
      'recovery-required',
    );
    expect(await text(p, notesPath(1))).toBe(notesText(1));
    expect(await checkoutClaimFree(p)).toBe(false);
  });
});
