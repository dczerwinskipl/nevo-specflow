import { writeFile } from 'node:fs/promises';

import { it } from 'vitest';

import { openSpecFlowEngine } from '../../src/testing';
import { applyDocumentChange, resumeDocumentChange } from '../../src/specs/documents/api';
import type { DocumentChangeRequest } from '../../src/specs/documents/changes/plan/request';
import type { DocumentWriteHooks } from '../../src/specs/documents/write';

const enabled = process.env.NEVO_DOCUMENT_CRASH_WORKER === '1';

/** Announce the cut point and never return: the test kills this process there. */
async function hang(signal: string, stage: string): Promise<never> {
  await writeFile(signal, JSON.stringify({ stage, pid: process.pid }));
  return new Promise<never>(() => undefined);
}

/** The hooks that stop the write at one named point. */
function hooksFor(cut: string, last: number, signal: string): DocumentWriteHooks {
  return {
    beforeReservationPublish: async () => {
      if (cut === 'before-reservation-publish') await hang(signal, cut);
    },
    afterLedgerWrite: async () => {
      if (cut === 'after-ledger-write') await hang(signal, cut);
    },
    afterPayloadReleased: async () => {
      if (cut === 'after-payload-released') await hang(signal, cut);
    },
    afterJournalWrite: async (stage) => {
      if (cut === 'after-reserved' && stage === 'reserved') await hang(signal, cut);
      if (cut === 'after-queued' && stage === 'queued') await hang(signal, cut);
    },
    beforeJournalWrite: async (stage) => {
      if (cut === 'before-queued' && stage === 'queued') await hang(signal, cut);
    },
    onPathEffect: async (event) => {
      if (cut === 'staged' && event.kind === 'staged' && event.index === 0) {
        await hang(signal, cut);
      }
      if (cut === 'mid-files' && event.kind === 'replaced' && event.index === 0) {
        await hang(signal, cut);
      }
      if (cut === 'before-manifest' && event.kind === 'before-replace' && event.index === last) {
        await hang(signal, cut);
      }
      if (cut === 'after-manifest' && event.kind === 'replaced' && event.index === last) {
        await hang(signal, cut);
      }
    },
  };
}

it.skipIf(!enabled)(
  'writes a document change and stops at the cut point until it is killed',
  async () => {
    const root = process.env.NEVO_DOCUMENT_CRASH_HOME!;
    const signal = process.env.NEVO_DOCUMENT_CRASH_SIGNAL!;
    const cut = process.env.NEVO_DOCUMENT_CRASH_CUT!;
    const last = Number(process.env.NEVO_DOCUMENT_CRASH_LAST_INDEX);
    const request = JSON.parse(process.env.NEVO_DOCUMENT_CRASH_REQUEST!) as DocumentChangeRequest;
    const engine = await openSpecFlowEngine({ cwd: root });
    if (process.env.NEVO_DOCUMENT_CRASH_MODE === 'replay') {
      // A second process continuing the operation of a writer that is gone, paused at the cut.
      await resumeDocumentChange(engine, process.env.NEVO_DOCUMENT_CRASH_OPERATION!, {
        hooks: hooksFor(cut, last, signal),
      });
      throw new Error('The document crash barrier unexpectedly returned.');
    }
    await applyDocumentChange(
      engine,
      process.env.NEVO_DOCUMENT_CRASH_SPEC!,
      process.env.NEVO_DOCUMENT_CRASH_OPERATION!,
      request,
      { hooks: hooksFor(cut, last, signal) },
    );
    throw new Error('The document crash barrier unexpectedly returned.');
  },
  60000,
);
