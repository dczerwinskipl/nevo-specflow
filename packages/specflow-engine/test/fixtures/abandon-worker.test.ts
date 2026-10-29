import { writeFile } from 'node:fs/promises';

import { it } from 'vitest';

import { abandonDocumentCommit } from '../../src/specs/documents/queue/actions';
import { openSpecFlowEngine } from '../../src/testing';

const enabled = process.env.NEVO_ABANDON_WORKER === '1';

/** Announce the cut point and never return: the test kills this process there. */
async function hang(signal: string, stage: string): Promise<never> {
  await writeFile(signal, JSON.stringify({ stage, pid: process.pid }));
  return new Promise<never>(() => undefined);
}

it.skipIf(!enabled)(
  'abandons a failed commit and stops between the ledger write and the completion until it is killed',
  async () => {
    const engine = await openSpecFlowEngine({ cwd: process.env.NEVO_ABANDON_WORKER_HOME! });
    const signal = process.env.NEVO_ABANDON_WORKER_SIGNAL!;
    await abandonDocumentCommit(engine, process.env.NEVO_ABANDON_WORKER_OPERATION!, {
      hooks: { afterLedgerWrite: () => hang(signal, 'after-ledger-write') },
    });
    throw new Error('The abandon worker unexpectedly returned.');
  },
  60000,
);
