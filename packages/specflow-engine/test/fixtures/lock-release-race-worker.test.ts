import { access, open, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { it } from 'vitest';

import { openSpecFlowEngine } from '../../src/testing';
import { withProjectControlLock } from '../../src/project/control-lock';

const enabled = process.env.NEVO_LOCK_RACE_WORKER === '1';

/**
 * One of two processes that wait on the same abandoned control lock at the same moment. Inside the
 * lock it creates a marker exclusively: if both ever held the lock together, the second create fails.
 */
it.skipIf(!enabled)(
  'waits on an abandoned control lock next to another process',
  async () => {
    const root = process.env.NEVO_LOCK_RACE_HOME!;
    const barrier = process.env.NEVO_LOCK_RACE_BARRIER!;
    const inside = process.env.NEVO_LOCK_RACE_INSIDE!;
    const result = process.env.NEVO_LOCK_RACE_RESULT!;
    const engine = await openSpecFlowEngine({ cwd: root });
    await writeFile(result + '.ready', String(process.pid));
    for (;;) {
      try {
        await access(barrier);
        break;
      } catch {
        await sleep(2);
      }
    }

    await withProjectControlLock(
      engine.context,
      async () => {
        const marker = await open(inside, 'wx');
        await marker.close();
        await sleep(300);
        await unlink(inside);
      },
      { waitMs: 20000, retryMs: 5 },
    );
    await writeFile(result, 'held-alone');
  },
  60000,
);
