import { writeFile } from 'node:fs/promises';
import { threadId } from 'node:worker_threads';

import { it } from 'vitest';

import { manualCommit } from '../../src/specs/documents/manual-commit';
import type { ManualCommitHooks } from '../../src/specs/manual-commit';
import { openSpecFlowEngine } from '../../src/testing';

const enabled = process.env.NEVO_MANUAL_COMMIT_WORKER === '1';

/** Announce the cut point and never return: the test kills this process there. */
async function hang(signal: string, stage: string): Promise<never> {
  await writeFile(signal, JSON.stringify({ stage, pid: process.pid, threadId }));
  return new Promise<never>(() => undefined);
}

/** Announce the process and go on: the test kills it later, from the outside. */
async function announce(signal: string): Promise<void> {
  await writeFile(signal, JSON.stringify({ stage: 'announced', pid: process.pid, threadId }));
}

/** The hooks that stop the manual commit at one named point. */
function hooksFor(cut: string, signal: string): ManualCommitHooks {
  const at = (name: string) => async () => {
    if (cut === name) await hang(signal, cut);
  };
  return {
    afterReserved: at('after-reserved'),
    inClaimAfterLease: at('in-claim-after-lease'),
    afterClaim: at('after-claim'),
    beforeCommit: async () => {
      if (cut === 'announce-before-commit') await announce(signal);
      else if (cut === 'before-commit') await hang(signal, cut);
    },
    afterCommit: at('after-commit'),
    afterVerify: at('after-verify'),
    afterLedgerPruned: at('after-ledger-pruned'),
    afterCompleted: at('after-completed'),
  };
}

/**
 * The test of a manual commit process that a test drives through the environment variables
 * `NEVO_MANUAL_COMMIT_WORKER`, `_HOME`, `_SIGNAL`, `_CUT`, `_SPEC` and `_OPERATION`: it commits the
 * ledger of the Specification and stops at the cut point until it is killed.
 */
it.skipIf(!enabled)(
  'runs a manual commit and stops at the cut point until it is killed',
  async () => {
    const engine = await openSpecFlowEngine({ cwd: process.env.NEVO_MANUAL_COMMIT_WORKER_HOME! });
    const signal = process.env.NEVO_MANUAL_COMMIT_WORKER_SIGNAL!;
    const cut = process.env.NEVO_MANUAL_COMMIT_WORKER_CUT ?? '';
    const result = await manualCommit(
      engine,
      {
        operationId: process.env.NEVO_MANUAL_COMMIT_WORKER_OPERATION!,
        scope: 'specification',
        specId: process.env.NEVO_MANUAL_COMMIT_WORKER_SPEC!,
        message: 'Committed by a process that is killed',
      },
      { deps: { hooks: hooksFor(cut, signal) } },
    );
    if (cut !== '') throw new Error('The manual commit worker unexpectedly returned: ' + cut);
    await writeFile(signal, JSON.stringify({ stage: 'result', pid: process.pid, result }));
  },
  60000,
);
