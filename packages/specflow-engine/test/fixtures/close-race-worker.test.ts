import { access, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { it } from 'vitest';

import {
  disposeReboundWorktree,
  openSpecFlowEngine,
  prepareCloseGitIntegration,
  prepareDivergentCloseCandidate,
  publishDivergentCloseCandidate,
  rebindVerifiedClose,
  reserveCloseOperation,
} from '../../src/testing';

const enabled = process.env.NEVO_CLOSE_RACE_WORKER === '1';

it.skipIf(!enabled)(
  'independent OS process reserves or publishes shared lifecycle resources',
  async () => {
    const root = process.env.NEVO_CLOSE_RACE_ROOT!;
    const ready = process.env.NEVO_CLOSE_RACE_READY!;
    const start = process.env.NEVO_CLOSE_RACE_START!;
    const result = process.env.NEVO_CLOSE_RACE_RESULT!;
    const request = JSON.parse(process.env.NEVO_CLOSE_RACE_REQUEST!) as {
      kind: 'specification-close' | 'worktree-close';
      operationId: string;
      specId: string;
    };
    const engine = await openSpecFlowEngine({ cwd: root });
    await writeFile(ready, 'ready');
    const deadline = Date.now() + 60000;
    while (true) {
      try {
        await access(start);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error('Close race start barrier timed out.');
        await sleep(25);
      }
    }
    try {
      const reserved = await reserveCloseOperation(engine, request);
      if (process.env.NEVO_CLOSE_RACE_MODE === 'publish-divergent') {
        if (request.kind !== 'worktree-close') throw new Error('Expected Worktree Close.');
        const prepared = await prepareCloseGitIntegration(engine, request.operationId);
        if (prepared.integration?.relationship !== 'divergent') {
          throw new Error('Race fixture did not create divergent Git history.');
        }
        const candidate = await prepareDivergentCloseCandidate(engine, request.operationId);
        if (candidate.stage !== 'integration-scratch-candidate') {
          throw new Error('Verified divergent candidate was not prepared.');
        }
        await writeFile(
          process.env.NEVO_CLOSE_RACE_PUBLISH_READY!,
          JSON.stringify({ pid: process.pid, stage: 'candidate-prepared' }),
        );
        const publishRelease = process.env.NEVO_CLOSE_RACE_PUBLISH_RELEASE!;
        while (true) {
          try {
            await access(publishRelease);
            break;
          } catch {
            if (Date.now() > deadline) throw new Error('Publish release barrier timed out.');
            await sleep(25);
          }
        }
        const published = await publishDivergentCloseCandidate(engine, request.operationId);
        if (published.stage !== 'integration-verified') {
          throw new Error('Divergent Git publication was not verified.');
        }
        await rebindVerifiedClose(engine, request.operationId);
        const final = await disposeReboundWorktree(engine, request.operationId);
        if (final.stage !== 'completed') throw new Error('Disposal not completed.');
        await writeFile(
          result,
          JSON.stringify({
            result: 'published',
            operationId: request.operationId,
            commit: published.integration?.publishedCommit,
          }),
        );
        return;
      }
      await writeFile(
        result,
        JSON.stringify({
          result: 'reserved',
          operationId: reserved.journal.plan.operationId,
          stage: reserved.journal.stage,
        }),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'CLOSE_CONFLICT'
      ) {
        await writeFile(result, JSON.stringify({ result: 'conflict' }));
        return;
      }
      throw error;
    }
  },
  120000,
);
