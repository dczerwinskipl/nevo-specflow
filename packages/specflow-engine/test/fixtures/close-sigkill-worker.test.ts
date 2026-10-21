import { writeFileSync } from 'node:fs';
import { channel } from 'node:diagnostics_channel';
import { writeFile } from 'node:fs/promises';

import { it } from 'vitest';

import { executeGitMutation } from '../../src/git/mutation';

import {
  archiveSpecificationWithCommit,
  inspectCloseOperation,
  openSpecFlowEngine,
  publishDivergentCloseCandidate,
  prepareDivergentCloseCandidate,
  rebindVerifiedClose,
  disposeReboundWorktree,
  publishCloseGitFastForward,
} from '../../src/testing';

const enabled = process.env.NEVO_CLOSE_SIGKILL_WORKER === '1';

it.skipIf(!enabled)(
  'actual OS-process termination after durable Close Git intent',
  async () => {
    const root = process.env.NEVO_CLOSE_SIGKILL_ROOT!;
    const operationId = process.env.NEVO_CLOSE_SIGKILL_OPERATION!;
    const signalPath = process.env.NEVO_CLOSE_SIGKILL_SIGNAL!;
    const stage = process.env.NEVO_CLOSE_SIGKILL_STAGE!;
    const engine = await openSpecFlowEngine({ cwd: root });

    const checkpoint = async () => {
      await writeFile(signalPath, JSON.stringify({ pid: process.pid, stage, operationId }));
      // Parent test sends SIGKILL to this exact OS process. No completion.
      await new Promise<void>(() => undefined);
    };
    if (stage === 'scratch-intent') {
      await prepareDivergentCloseCandidate(engine, operationId, checkpoint);
    } else if (stage === 'publish-intent') {
      await publishDivergentCloseCandidate(engine, operationId, checkpoint);
    } else if (stage === 'archive-commit') {
      await archiveSpecificationWithCommit(engine, operationId, undefined, checkpoint);
    } else if (stage === 'archive-before-move') {
      await archiveSpecificationWithCommit(engine, operationId, checkpoint);
    } else if (stage === 'archive-after-move') {
      await archiveSpecificationWithCommit(engine, operationId, undefined, undefined, checkpoint);
    } else if (stage === 'archive-after-staging') {
      await archiveSpecificationWithCommit(
        engine,
        operationId,
        undefined,
        undefined,
        undefined,
        checkpoint,
      );
    } else if (stage === 'rebind-cas') {
      await rebindVerifiedClose(engine, operationId, checkpoint);
    } else if (stage === 'disposal-intent') {
      await disposeReboundWorktree(engine, operationId, checkpoint);
    } else if (stage === 'removed-pre-retirement') {
      await disposeReboundWorktree(engine, operationId, undefined, checkpoint);
    } else if (stage === 'publish-complete-before-proof') {
      await publishCloseGitFastForward(engine, operationId, undefined, checkpoint);
    } else if (stage === 'torn-publish-head') {
      await publishCloseGitFastForward(engine, operationId, async () => {
        const journal = await inspectCloseOperation(engine, operationId);
        const source = journal?.integration?.sourceCommit;
        if (!source) throw new Error('Pinned source commit is unavailable.');
        // A REAL git update-ref advances the checked-out branch without
        // updating its index or physical working tree. Kill the worker before
        // the ordinary fast-forward child can run. This probes the torn state,
        // not a claim about the exact internal scheduling of git merge.
        const change = await executeGitMutation(root, ['update-ref', 'HEAD', source]);
        if (change.exitCode !== 0) throw new Error('Failed to materialize torn Git ref.');
        await checkpoint();
      });
    } else if (stage === 'live-merge-child') {
      const pidSignal = process.env.NEVO_CLOSE_GIT_PID_SIGNAL!;
      const outcomeSignal = process.env.NEVO_CLOSE_GIT_OUTCOME_SIGNAL!;
      const processChannel = channel('nevo.specflow.engine.git-process');
      const observe = (payload: unknown) => {
        const data = payload as { readonly args?: readonly string[]; readonly pid?: number };
        if (data.args?.includes('merge') && data.args.includes('--ff-only') && data.pid) {
          // Report the actual spawned git.exe PID, not the Engine worker PID.
          writeFileSync(pidSignal, JSON.stringify({ pid: data.pid, args: data.args }));
        }
      };
      processChannel.subscribe(observe);
      try {
        await publishCloseGitFastForward(engine, operationId);
        throw new Error('Interrupted merge unexpectedly completed.');
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'CLOSE_RECOVERY_REQUIRED'
        ) {
          throw error;
        }
        await writeFile(outcomeSignal, JSON.stringify({ result: 'recovery-required' }));
        return;
      } finally {
        processChannel.unsubscribe(observe);
      }
    } else {
      throw new Error('Unknown Close SIGKILL checkpoint.');
    }
    throw new Error('Close crash barrier unexpectedly returned.');
  },
  90000,
);
