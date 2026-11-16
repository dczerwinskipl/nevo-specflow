import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore, type SessionStore } from '../persistence/store';
import type { SessionEffects, SessionEffectIdentity } from './effects';
import type { SessionDriver, Invocation, EmitFact } from '../providers/driver';
import { createMockDriver } from '../providers/mock';
import { SessionError } from '../errors';
import type { TurnOutcome } from '@nevo/specflow-contracts/sessions';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { captureProcessIdentity } from '../providers/process/native-stop';
import type { NativeProcessIdentity } from '../providers/process/process-identity';

let root = '',
  runtime: SessionCoordinator | undefined;
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
});
/**
 * `lostProcess`: the driver records this native process and dispatches, then loses the agent (as a
 * Runtime crash does), leaving the Turn and its claim unknown.
 */
async function fixture(failTerminal = false, lostProcess?: NativeProcessIdentity) {
  root = await mkdtemp(join(tmpdir(), 'managed-effects-'));
  let phase = 'admitted',
    receipt: TurnOutcome = 'completed',
    owner: SessionEffectIdentity | undefined;
  let scope = 'account-a';
  const result = { kind: 'outcome' as const, outcome: 'completed' as const };
  const effects: SessionEffects = {
    admit(identity) {
      owner = identity;
      phase = 'admitted';

      return Promise.resolve({
        workspace: identity.workspace,
        dispatch: () => {
          phase = 'dispatched';

          return Promise.resolve();
        },
        abandon: () => {
          phase = 'settled';

          return Promise.resolve();
        },
        unknown: () => {
          if (phase !== 'settled') {
            phase = 'unknown';
          }

          return Promise.resolve();
        },
        settle: () => {
          phase = 'settled';

          return Promise.resolve();
        },
      });
    },
    reconcile: (identity) =>
      Promise.resolve(
        phase === 'settled' && owner?.binding === identity.binding
          ? { process: 'stopped', outcome: receipt, source: 'native-result' }
          : undefined,
      ),
    settleStopped(identity) {
      // The claim lifecycle: only an unsettled, dispatched claim of the same binding settles.
      if (owner?.binding !== identity.binding || !['dispatched', 'unknown'].includes(phase)) {
        return Promise.reject(new SessionError('SESSION_RECOVERY_REQUIRED', 'Refused.'));
      }

      phase = 'settled';
      receipt = 'interrupted';

      return Promise.resolve();
    },
  };
  const start = vi.fn((invocation: Invocation, emit: EmitFact) => {
    if (lostProcess) {
      const done = (async () => {
        await invocation.recordProcess!(lostProcess);
        await invocation.beforeDispatch!();
        await emit({ kind: 'lost', message: 'The Runtime lost the agent.' });
      })();

      return {
        done,
        settlement: done.then(() => ({
          process: 'unknown' as const,
          source: 'unverified' as const,
        })),
        respond: () => Promise.resolve({ deliveredKeys: [] }),
      };
    }

    const done = (async () => {
      expect(invocation.executionContext.kind).toBe('workspace-write');
      await invocation.recordProcess!({ platform: 'posix', groupId: 4242 });
      await invocation.beforeDispatch!();
      await emit({
        kind: 'correlation',
        providerSessionId: invocation.providerContext!.nativeSessionId,
      });
      await emit(result);
    })();

    return {
      done,
      settlement: done.then(() => ({
        process: 'stopped' as const,
        source: 'native-result' as const,
        result,
      })),
      respond: () => Promise.resolve({ deliveredKeys: [] }),
    };
  });
  const driver: SessionDriver = {
    ...createMockDriver(),
    supportsManagedWrites: true,
    describe: () => ({
      ...createMockDriver().describe(),
      providerId: 'controlled',
      modes: ['read-only', 'workspace-write'],
    }),
    validate: () => undefined,
    contextScope: () => scope,
    start,
  };
  const context = {
    kind: 'read-only' as const,
    workspace: root,
    temporaryRoot: root,
    workspaceIdentity: '1'.repeat(64),
  };
  let store = await openSessionStore({ directory: root, projectId: 'project' });
  const wrapped: SessionStore = {
    ...store,
    call(command) {
      if (failTerminal && command.op === 'reconcile-effect') {
        return Promise.reject(
          new SessionError('SESSION_STORE_UNAVAILABLE', 'Injected terminal persistence failure.'),
        );
      }

      return store.call(command);
    },
  };
  runtime = createSessionCoordinator(wrapped, driver, 'project', true, context, effects);
  const { sessionId } = await runtime.create('actor', {
    requestId: randomUUID(),
    providerId: 'controlled',
    mode: 'workspace-write',
    providerModeId: 'acceptEdits',
  });

  return {
    sessionId,
    start,
    phase: () => phase,
    scope: (value: string) => {
      scope = value;
    },
    async reopen(identity = context.workspaceIdentity) {
      await runtime!.close();
      store = await openSessionStore({ directory: root, projectId: 'project' });
      runtime = createSessionCoordinator(
        store,
        driver,
        'project',
        true,
        { ...context, workspaceIdentity: identity },
        effects,
      );
    },
  };
}

it('commits a writable outcome only after effect settlement and never reruns an admitted request', async () => {
  const f = await fixture();
  const input = { requestId: randomUUID(), message: 'Write once' };
  const admitted = await runtime!.start('actor', f.sessionId, input);
  await vi.waitFor(async () =>
    expect((await runtime!.snapshot(f.sessionId, 'actor')).activeTurn).toBeUndefined(),
  );
  expect(f.phase()).toBe('settled');
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(await runtime!.start('actor', f.sessionId, input)).toEqual(admitted);
  expect(f.start).toHaveBeenCalledTimes(1);
});
it.each(['same-binding', 'changed-account', 'changed-workspace'])(
  'recovers an Engine-proven outcome after restart without redispatch: %s',
  async (change) => {
    const f = await fixture(true);
    const input = { requestId: randomUUID(), message: 'Do not resend' };
    const admitted = await runtime!.start('actor', f.sessionId, input);
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(f.sessionId, 'actor')).activeTurn?.state).toBe('unknown'),
    );
    expect(f.phase()).toBe('settled');
    await f.reopen(change === 'changed-workspace' ? '2'.repeat(64) : undefined);
    if (change === 'changed-account') {
      f.scope('account-b');
    }

    await runtime!.recoverEffects();
    const snapshot = await runtime!.snapshot(f.sessionId, 'actor');
    expect(snapshot.activeTurn).toBeUndefined();
    expect(snapshot.entries.at(-1)?.text.text).toBe('completed');
    expect(
      snapshot.entries.some(
        (entry) => entry.kind === 'commentary' && entry.text.text.includes('recovered'),
      ),
    ).toBe(true);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(await runtime!.start('actor', f.sessionId, input)).toEqual(admitted);
    if (change !== 'same-binding') {
      await expect(
        runtime!.start('actor', f.sessionId, { requestId: randomUUID(), message: 'New intent' }),
      ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    }

    expect(f.start).toHaveBeenCalledTimes(1);
  },
  // Includes two cold SQLite Workers, shutdown and restart. Windows CI can
  // exceed Vitest's five-second unit-test budget without a lifecycle failure.
  20000,
);

/** A real process standing in for the agent, with the identity a launch records for it. */
async function agentProcess() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  await once(child, 'spawn');
  const identity = captureProcessIdentity(
    child.pid!,
    process.platform === 'win32' ? 'Local\\NevoSession-' + randomUUID() : undefined,
  )!;

  return {
    identity,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    },
  };
}

it('settles a lost Turn and its claim as interrupted on native-stop evidence, never while the process runs', async () => {
  const agent = await agentProcess();
  try {
    const f = await fixture(false, agent.identity);
    await runtime!.start('actor', f.sessionId, { requestId: randomUUID(), message: 'Write' });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(f.sessionId, 'actor')).activeTurn?.state).toBe('unknown'),
    );
    expect(f.phase()).toBe('unknown');

    // Startup recovery: the recorded process still runs, so the Turn and the claim stay held.
    await f.reopen();
    await runtime!.recoverEffects();
    const turnId = (await runtime!.snapshot(f.sessionId, 'actor')).activeTurn!.turnId;
    expect((await runtime!.snapshot(f.sessionId, 'actor')).activeTurn?.state).toBe('unknown');
    expect(f.phase()).toBe('unknown');
    await expect(
      runtime!.reconcile('actor', f.sessionId, turnId, randomUUID()),
    ).rejects.toMatchObject({
      code: 'SESSION_RECOVERY_REQUIRED',
      // Linux and Windows compare the start time and see the process alive; elsewhere (macOS) a
      // live group without a start time cannot be told apart from a reused id: fail closed either way.
      message: expect.stringContaining(
        process.platform === 'linux' || process.platform === 'win32'
          ? 'still running'
          : 'cannot be established',
      ) as string,
    });
    expect(f.phase()).toBe('unknown');

    // Check outcome once it stopped: the claim settles first, then the Turn.
    await agent.stop();
    await expect(
      runtime!.reconcile('actor', f.sessionId, turnId, randomUUID()),
    ).resolves.toMatchObject({ outcome: 'interrupted', reconciled: true });
    const snapshot = await runtime!.snapshot(f.sessionId, 'actor');
    expect(snapshot.activeTurn).toBeUndefined();
    expect(snapshot.entries.at(-1)).toMatchObject({
      kind: 'outcome',
      text: { text: 'interrupted' },
    });
    expect(f.phase()).toBe('settled');
    expect(f.start).toHaveBeenCalledTimes(1);
  } finally {
    await agent.stop();
  }
}, 20000);
