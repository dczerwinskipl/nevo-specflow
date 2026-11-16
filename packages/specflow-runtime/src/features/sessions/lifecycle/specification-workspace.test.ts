import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore } from '../persistence/store';
import type { SessionDriver, Invocation, EmitFact } from '../providers/driver';
import { createMockDriver } from '../providers/mock';
import { SessionError } from '../errors';
import { createWorkspaceOccupancy } from '../../workspaces';
import type { SessionEffectIdentity } from './effects';

let root = '',
  runtime: SessionCoordinator | undefined;
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
});

async function fixture(
  options: {
    resolve?: (
      specId: string,
    ) => Promise<{ root: string; workspaceId: string; workspaceIdentity: string }>;
    supportsSessionWorkspaces?: boolean;
    mode?: 'read-only' | 'workspace-write';
    holdTurn?: boolean;
  } = {},
) {
  root = await mkdtemp(join(tmpdir(), 'session-spec-workspace-'));
  const runtimeWorkspace = join(root, 'main');
  const worktree = join(root, 'worktree');
  const worktreeIdentity = '2'.repeat(64);
  const resolve = vi.fn(
    options.resolve ??
      (() =>
        Promise.resolve({
          root: worktree,
          workspaceId: 'worktree-1',
          workspaceIdentity: worktreeIdentity,
        })),
  );
  // The Engine claim is what this test observes for a write; the claim itself is refused here.
  const admit = vi.fn((_identity: SessionEffectIdentity) =>
    Promise.reject(new SessionError('TURN_CONFLICT', 'Claimed.')),
  );
  const occupancy = createWorkspaceOccupancy();
  // The Turn's agent finishes only when the test releases it.
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const start = vi.fn((invocation: Invocation, emit: EmitFact) => ({
    done: (async () => {
      await emit({
        kind: 'correlation',
        providerSessionId: invocation.providerContext!.nativeSessionId,
      });
      if (options.holdTurn) {
        await finished;
      }

      await emit({ kind: 'outcome', outcome: 'completed' });
    })(),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  const driver: SessionDriver = {
    ...createMockDriver(),
    supportsManagedWrites: true,
    supportsSessionWorkspaces: options.supportsSessionWorkspaces ?? true,
    describe: () => ({
      ...createMockDriver().describe(),
      providerId: 'controlled',
      modes: ['read-only', 'workspace-write'],
    }),
    validate: () => undefined,
    contextScope: () => 'account',
    start,
  };
  const store = await openSessionStore({ directory: root, projectId: 'project' });
  runtime = createSessionCoordinator(
    store,
    driver,
    'project',
    true,
    {
      kind: 'read-only',
      workspace: runtimeWorkspace,
      temporaryRoot: root,
      workspaceIdentity: '1'.repeat(64),
    },
    {
      admit,
      reconcile: () => Promise.resolve(undefined),
      settleStopped: () => Promise.reject(new Error('Unexpected native-stop settlement')),
    },
    resolve,
    occupancy,
  );

  async function create(mode: 'read-only' | 'workspace-write', specId?: string) {
    const created = await runtime!.create(
      'actor',
      {
        requestId: randomUUID(),
        providerId: 'controlled',
        mode,
        ...(mode === 'workspace-write' ? { providerModeId: 'acceptEdits' } : {}),
      },
      specId ? { specId, taskIds: [], origin: 'user' } : undefined,
    );

    return created.sessionId;
  }

  return {
    runtimeWorkspace,
    worktree,
    worktreeIdentity,
    resolve,
    start,
    admit,
    create,
    occupancy,
    finish,
  };
}

const turn = () => ({ requestId: randomUUID(), message: 'Review the specification' });

describe("A Specification's Session workspace", () => {
  it("runs a Specification's Session in the Specification's workspace", async () => {
    const { worktree, resolve, start, create } = await fixture();
    const sessionId = await create('read-only', 'S1');

    await runtime!.start('actor', sessionId, turn());

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(resolve).toHaveBeenCalledWith('S1');
    expect(start.mock.calls[0]![0].executionContext).toEqual({
      kind: 'read-only',
      workspace: worktree,
      temporaryRoot: root,
      specId: 'S1',
      workspaceIdentity: '2'.repeat(64),
    });
  });

  it("claims the Specification's worktree for a write, never the Runtime's checkout", async () => {
    const { worktree, worktreeIdentity, admit, start, create } = await fixture();
    const sessionId = await create('workspace-write', 'S1');

    await runtime!.start('actor', sessionId, turn());

    await vi.waitFor(() => expect(admit).toHaveBeenCalledTimes(1));
    expect(admit.mock.calls[0]![0]).toMatchObject({
      sessionId,
      workspace: worktree,
      workspaceIdentity: worktreeIdentity,
      // Admission re-checks that S1 is still bound to that worktree.
      specId: 'S1',
    });
    // Refused claim: the agent never starts.
    expect(start).not.toHaveBeenCalled();
  });

  it('holds the worktree for its Turn, so Close waits until the Turn ends', async () => {
    const { start, create, occupancy, finish } = await fixture({ holdTurn: true });
    const sessionId = await create('read-only', 'S1');

    await runtime!.start('actor', sessionId, turn());

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(occupancy.holdForClose('worktree-1')).toEqual({
      kind: 'busy',
      sessionIds: [sessionId],
    });
    finish();
    await vi.waitFor(() => expect(occupancy.runningSessions('worktree-1')).toEqual([]));
    expect(occupancy.holdForClose('worktree-1').kind).toBe('held');
  });

  it('refuses a Turn in a worktree Close is removing', async () => {
    const { start, create, occupancy } = await fixture();
    const sessionId = await create('read-only', 'S1');
    occupancy.holdForClose('worktree-1');

    await expect(runtime!.start('actor', sessionId, turn())).rejects.toMatchObject({
      code: 'TURN_CONFLICT',
      details: { reason: 'specification-close-in-progress' },
    });
    expect(start).not.toHaveBeenCalled();
    expect(occupancy.runningSessions('worktree-1')).toEqual([]);
  });

  it.each([
    [
      'a Close that started before the Turn registered',
      () =>
        Promise.reject(
          new SessionError('TURN_CONFLICT', 'Closing.', {
            reason: 'specification-close-in-progress',
          }),
        ),
      'specification-close-in-progress',
    ],
    [
      'a rebind before the Turn registered',
      () =>
        Promise.resolve({
          root: join(root, 'other'),
          workspaceId: 'worktree-2',
          workspaceIdentity: '3'.repeat(64),
        }),
      'specification-workspace-changed',
    ],
    [
      'a checkout recreated under the same path before the Turn registered',
      () =>
        Promise.resolve({
          root: join(root, 'worktree'),
          workspaceId: 'worktree-1',
          workspaceIdentity: '4'.repeat(64),
        }),
      'specification-workspace-changed',
    ],
  ])('verifies again after registering and refuses %s', async (_name, second, reason) => {
    const { start, create, occupancy, resolve } = await fixture();
    const sessionId = await create('read-only', 'S1');
    resolve.mockImplementationOnce(resolve.getMockImplementation()!).mockImplementationOnce(second);

    await expect(runtime!.start('actor', sessionId, turn())).rejects.toMatchObject({
      code: 'TURN_CONFLICT',
      details: { reason },
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
    // The hold taken for the check is released.
    expect(occupancy.runningSessions('worktree-1')).toEqual([]);
  });

  it("keeps a standalone Session in the Runtime's checkout", async () => {
    const { runtimeWorkspace, resolve, start, create } = await fixture();
    const sessionId = await create('read-only');

    await runtime!.start('actor', sessionId, turn());

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(resolve).not.toHaveBeenCalled();
    expect(start.mock.calls[0]![0].executionContext).toMatchObject({
      workspace: runtimeWorkspace,
    });
  });

  it('lists a provider bound to the Runtime checkout as unavailable for a Specification in its own worktree, and refuses its create', async () => {
    const { runtimeWorkspace, resolve, start, create } = await fixture({
      supportsSessionWorkspaces: false,
    });

    expect(await runtime!.providers('S1')).toEqual([
      expect.objectContaining({
        providerId: 'controlled',
        readiness: 'unavailable',
        reasonCode: 'SPECIFICATION_WORKTREE_UNSUPPORTED',
      }),
    ]);
    // A standalone start keeps the Runtime's checkout: the provider is listed as it reports itself.
    const [standalone] = await runtime!.providers();
    expect(standalone).toMatchObject({ providerId: 'controlled', readiness: 'ready' });
    expect(standalone).not.toHaveProperty('reasonCode');
    for (const mode of ['read-only', 'workspace-write'] as const) {
      await expect(create(mode, 'S1')).rejects.toMatchObject({
        code: 'CAPABILITY_UNSUPPORTED',
        details: { reason: 'specification-worktree-provider-unsupported' },
      });
    }

    await expect(create('read-only')).resolves.toEqual(expect.any(String));

    // A Specification that moved to its own worktree after the create is still refused at the Turn.
    resolve.mockResolvedValueOnce({
      root: runtimeWorkspace,
      workspaceId: 'primary',
      workspaceIdentity: '1'.repeat(64),
    });
    const sessionId = await create('read-only', 'S1');
    await expect(runtime!.start('actor', sessionId, turn())).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
      details: { reason: 'specification-worktree-provider-unsupported' },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an unavailable workspace',
      {
        mode: 'read-only' as const,
        resolve: () =>
          Promise.reject(
            new SessionError('CAPABILITY_UNSUPPORTED', 'Unavailable.', {
              reason: 'specification-workspace-unavailable',
            }),
          ),
      },
      'specification-workspace-unavailable',
    ],
  ])('refuses %s before dispatch', async (_name, options, reason) => {
    const { start, create } = await fixture(options);
    const sessionId = await create(options.mode, 'S1');

    await expect(runtime!.start('actor', sessionId, turn())).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
      details: { reason },
    });
    expect(start).not.toHaveBeenCalled();
  });
});
