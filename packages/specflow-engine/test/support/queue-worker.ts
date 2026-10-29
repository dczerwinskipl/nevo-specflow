import { access, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { threadId } from 'node:worker_threads';

import { it } from 'vitest';

import { openSpecFlowEngine } from '../../src/testing';
import { SettleLedger } from '../../src/specs/documents/queue/settle-ledger';
import type { QueueHooks } from '../../src/specs/documents/queue/types';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';

/** Announce the cut point and never return: the test kills this process there. */
async function hang(signal: string, stage: string): Promise<never> {
  await writeFile(signal, JSON.stringify({ stage, pid: process.pid, threadId }));

  return new Promise<never>(() => undefined);
}

/** Announce the process and go on: the test kills it later, from the outside. */
async function announce(signal: string): Promise<void> {
  await writeFile(signal, JSON.stringify({ stage: 'announced', pid: process.pid, threadId }));
}

/** The hooks that stop the queue at one named point. */
function hooksFor(cut: string, signal: string): QueueHooks {
  const at = (name: string) => async () => {
    if (cut === name) {
      await hang(signal, cut);
    }
  };

  return {
    inClaimAfterLease: at('in-claim-after-lease'),
    inClaimAfterRecord: at('in-claim-after-record'),
    inResumeAfterRecord: at('in-resume-after-record'),
    afterMemberClaimed: async (claimed: number) => {
      if (cut === `member-claimed-${claimed}`) {
        await hang(signal, cut);
      }
    },
    afterClaim: at('after-claim'),
    beforeCommit: async () => {
      if (cut === 'announce-before-commit') {
        await announce(signal);
      } else if (cut === 'before-commit') {
        await hang(signal, cut);
      }
    },
    afterCommit: at('after-commit'),
    afterBatchRecorded: at('after-batch-recorded'),
    afterMembersCompleted: at('after-members-completed'),
    afterSettled: at('after-settled'),
  };
}

async function waitFor(path: string): Promise<void> {
  for (let tries = 0; tries < 1500; tries += 1) {
    try {
      await access(path);

      return;
    } catch {
      await sleep(40);
    }
  }

  throw new Error('The awaited checkpoint never appeared: ' + path);
}

/**
 * Defines the test of a queue worker process (or thread) that a test drives through the environment
 * variables `<prefix>`, `<prefix>_HOME`, `<prefix>_SIGNAL`, `<prefix>_CUT` and, optionally,
 * `<prefix>_AFTER` (a file to wait for before it starts) and `<prefix>_CONFIRM` (operator assertion).
 */
export function defineQueueWorker(prefix: string): void {
  const enabled = process.env[prefix] === '1';
  it.skipIf(!enabled)(
    'runs the document queue once and stops at the cut point until it is killed',
    async () => {
      const root = process.env[`${prefix}_HOME`]!;
      const signal = process.env[`${prefix}_SIGNAL`]!;
      const cut = process.env[`${prefix}_CUT`] ?? '';
      const after = process.env[`${prefix}_AFTER`];
      if (after !== undefined) {
        await waitFor(after);
      }

      const engine = await openSpecFlowEngine({ cwd: root });
      const result = await runQueueOnce(
        engine,
        { ledger: new SettleLedger(), hooks: hooksFor(cut, signal) },
        undefined,
        {
          flush: true,
          ...(process.env[`${prefix}_CONFIRM`] === '1' ? { confirmExecutorStopped: true } : {}),
        },
      );
      if (cut !== '') {
        throw new Error('The queue worker unexpectedly returned: ' + cut);
      }

      // A run without a cut reports its result and ends normally.
      await writeFile(
        signal,
        JSON.stringify({ stage: 'result', pid: process.pid, threadId, result }),
      );
    },
    60000,
  );
}
