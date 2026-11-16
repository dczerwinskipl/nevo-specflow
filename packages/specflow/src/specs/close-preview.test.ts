import { describe, expect, it, vi } from 'vitest';
import { CloseOperationError, type SpecFlowEngine } from '@nevo/specflow-engine';
import { previewCloseForCli } from './close-preview';

const specId = '00000000-0000-4000-8000-000000000001';
const linked = { workspaceId: 'w-linked', kind: 'linked', root: '/repo/.worktrees/a' };
const primary = { workspaceId: 'w-primary', kind: 'primary', root: '/repo' };

function engine(workspace: typeof linked | typeof primary, busy: boolean) {
  const checkoutQuiescence = vi.fn(() =>
    Promise.resolve(
      busy
        ? { quiet: false as const, sessionIds: ['session-1'], message: 'An agent works there.' }
        : { quiet: true as const },
    ),
  );

  return {
    engine: {
      readRegistry: () =>
        Promise.resolve({
          workspaces: [workspace],
          specBindings: [{ specId, workspaceId: workspace.workspaceId }],
        }),
      checkoutQuiescence,
    } as unknown as SpecFlowEngine,
    checkoutQuiescence,
  };
}

const plan = { kind: 'plan' } as never;
const sessionBlocker = {
  kind: 'session-turn-running',
  subjectIds: ['session-1'],
  message: 'An agent works there.',
};

describe('CLI Close preview', () => {
  it('refuses like Close while an agent Session works in the linked checkout', async () => {
    const f = engine(linked, true);
    await expect(
      previewCloseForCli(f.engine, { kind: 'worktree-close', specId }, () => Promise.resolve(plan)),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [sessionBlocker] });
    expect(f.checkoutQuiescence).toHaveBeenCalledWith({
      workspaceId: linked.workspaceId,
      root: linked.root,
    });
  });

  it('lists the session blocker beside the workflow blockers', async () => {
    const workflow = { kind: 'draft-tasks', subjectIds: ['t-1'], message: 'Approve t-1.' };
    await expect(
      previewCloseForCli(engine(linked, true).engine, { kind: 'specification-close', specId }, () =>
        Promise.reject(
          new CloseOperationError('CLOSE_BLOCKED', 'Blocked.', { blockers: [workflow] }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [workflow, sessionBlocker] });
  });

  it.each([
    ['a quiet linked checkout', linked, false, {}],
    ['the primary checkout, never removed', primary, true, {}],
    ['an archive-only Close', linked, true, { integrateToTargetBranch: false }],
  ] as const)('returns the plan for %s', async (_name, workspace, busy, extra) => {
    await expect(
      previewCloseForCli(
        engine(workspace, busy).engine,
        { kind: 'specification-close', specId, ...extra },
        () => Promise.resolve(plan),
      ),
    ).resolves.toBe(plan);
  });
});
