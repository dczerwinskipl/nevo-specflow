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
    resolve?: (specId: string) => Promise<string>;
    supportsSessionWorkspaces?: boolean;
    mode?: 'read-only' | 'workspace-write';
  } = {},
) {
  root = await mkdtemp(join(tmpdir(), 'session-spec-workspace-'));
  const runtimeWorkspace = join(root, 'main');
  const worktree = join(root, 'worktree');
  const resolve = vi.fn(options.resolve ?? (() => Promise.resolve(worktree)));
  const start = vi.fn((invocation: Invocation, emit: EmitFact) => ({
    done: (async () => {
      await emit({
        kind: 'correlation',
        providerSessionId: invocation.providerContext!.nativeSessionId,
      });
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
      admit: () => Promise.reject(new Error('unused')),
      reconcile: () => Promise.resolve(undefined),
    },
    resolve,
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

  return { runtimeWorkspace, worktree, resolve, start, create };
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
    });
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

  it.each([
    [
      'writes in another worktree',
      { mode: 'workspace-write' as const },
      'specification-worktree-write-unsupported',
    ],
    [
      'a provider bound to the Runtime checkout',
      { mode: 'read-only' as const, supportsSessionWorkspaces: false },
      'specification-worktree-provider-unsupported',
    ],
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
