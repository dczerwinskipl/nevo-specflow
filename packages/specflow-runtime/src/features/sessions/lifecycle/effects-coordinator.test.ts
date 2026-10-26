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

let root = '',
  runtime: SessionCoordinator | undefined;
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
});
async function fixture(failTerminal = false) {
  root = await mkdtemp(join(tmpdir(), 'managed-effects-'));
  let phase = 'admitted',
    owner: SessionEffectIdentity | undefined;
  let scope = 'account-a';
  const result = { kind: 'outcome' as const, outcome: 'completed' as const };
  const effects: SessionEffects = {
    admit(identity) {
      owner = identity;
      phase = 'admitted';
      return Promise.resolve({
        dispatch: () => {
          phase = 'dispatched';
          return Promise.resolve();
        },
        abandon: () => {
          phase = 'settled';
          return Promise.resolve();
        },
        unknown: () => {
          if (phase !== 'settled') phase = 'unknown';
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
          ? { process: 'stopped', outcome: 'completed', source: 'native-result' }
          : undefined,
      ),
  };
  const start = vi.fn((invocation: Invocation, emit: EmitFact) => {
    const done = (async () => {
      expect(invocation.executionContext.kind).toBe('workspace-write');
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
      if (failTerminal && command.op === 'reconcile-effect')
        return Promise.reject(
          new SessionError('SESSION_STORE_UNAVAILABLE', 'Injected terminal persistence failure.'),
        );
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
    if (change === 'changed-account') f.scope('account-b');
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
    if (change !== 'same-binding')
      await expect(
        runtime!.start('actor', f.sessionId, { requestId: randomUUID(), message: 'New intent' }),
      ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    expect(f.start).toHaveBeenCalledTimes(1);
  },
);
