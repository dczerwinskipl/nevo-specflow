import { describe, expect, it } from 'vitest';
import { CloseOperationError, type SpecFlowEngine } from '@nevo/specflow-engine';
import { previewCloseForCli } from './close-preview';

const specId = '00000000-0000-4000-8000-000000000001';
const engine = {} as SpecFlowEngine;
const plan = { kind: 'plan' } as never;
const sessionBlocker = {
  kind: 'session-turn-running',
  subjectIds: ['session-1'],
  message: 'An agent works there.',
};
const busy = () => Promise.resolve(sessionBlocker);
const quiet = () => Promise.resolve(undefined);

describe('CLI Close preview', () => {
  it('refuses like Close while an agent Session works in the checkout Close removes', async () => {
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'worktree-close', specId },
        { preview: () => Promise.resolve(plan), occupancy: busy },
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [sessionBlocker] });
  });

  it('lists the session blocker beside the workflow blockers', async () => {
    const workflow = { kind: 'draft-tasks', subjectIds: ['t-1'], message: 'Approve t-1.' };
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'specification-close', specId },
        {
          preview: () =>
            Promise.reject(
              new CloseOperationError('CLOSE_BLOCKED', 'Blocked.', { blockers: [workflow] }),
            ),
          occupancy: busy,
        },
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [workflow, sessionBlocker] });
  });

  it('returns the plan when Close would not ask about a running agent', async () => {
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'specification-close', specId },
        { preview: () => Promise.resolve(plan), occupancy: quiet },
      ),
    ).resolves.toBe(plan);
  });
});
