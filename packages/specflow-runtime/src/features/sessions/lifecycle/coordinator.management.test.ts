import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore } from '../persistence/store';
import { createMockDriver, type MockScenario } from '../providers/mock';
import type { StoreCommand } from '../persistence/protocol';
import type { SessionDriver } from '../providers/driver';

let runtime: SessionCoordinator | undefined,
  directory = '';
const operations: StoreCommand['op'][] = [];
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  operations.length = 0;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});
async function setup(scenario: MockScenario, driver: SessionDriver = createMockDriver(scenario)) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-management-'));
  const store = await openSessionStore({ directory, projectId: 'project' });
  runtime = createSessionCoordinator(
    {
      ...store,
      call(command) {
        operations.push(command.op);

        return store.call(command);
      },
    },
    driver,
    'project',
  );

  return (
    await runtime.create('actor', {
      requestId: randomUUID(),
      providerId: driver.describe().providerId,
      mode: 'read-only',
    })
  ).sessionId;
}

const settled = async (sessionId: string) =>
  vi.waitFor(async () =>
    expect((await runtime!.snapshot(sessionId, 'actor')).entries.at(-1)?.kind).toBe('outcome'),
  );

describe('Session coordinator management', () => {
  it('refuses a Turn on an archived Session without invoking the provider', async () => {
    const execution = vi.fn<MockScenario>(async (_invocation, emit) => {
      await emit({ kind: 'outcome', outcome: 'completed' });
    });
    const sessionId = await setup(execution);
    await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'First' });
    await settled(sessionId);
    await runtime!.archive('actor', sessionId, { requestId: randomUUID() });
    await expect(
      runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Blocked' }),
    ).rejects.toMatchObject({ code: 'SESSION_ARCHIVED', statusCode: 409 });
    expect(execution).toHaveBeenCalledTimes(1);
    await runtime!.unarchive('actor', sessionId, { requestId: randomUUID() });
    await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Again' });
    await vi.waitFor(() => expect(execution).toHaveBeenCalledTimes(2));
  });

  it('refuses archive and delete while a Turn is unknown, without cancelling it', async () => {
    // A mock Turn settles interrupted on loss; a real provider's lost execution stays unknown.
    const sessionId = await setup(() => Promise.resolve(), {
      ...createMockDriver(),
      describe: () => ({ ...createMockDriver().describe(), providerId: 'claude' }),
      validate: () => undefined,
      start: (_invocation, emit) => ({
        done: emit({ kind: 'lost', message: 'Execution cannot be confirmed.' }),
        respond: () => Promise.resolve({ deliveredKeys: [] }),
      }),
    });
    const { turnId } = await runtime!.start('actor', sessionId, {
      requestId: randomUUID(),
      message: 'Uncertain',
    });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn?.state).toBe('unknown'),
    );
    await expect(
      runtime!.archive('actor', sessionId, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'TURN_CONFLICT', details: { turnId } });
    await expect(runtime!.remove(sessionId)).rejects.toMatchObject({
      code: 'TURN_CONFLICT',
      details: { turnId },
    });
    const snapshot = await runtime!.snapshot(sessionId, 'actor');
    expect(snapshot.activeTurn?.state).toBe('unknown');
    expect(snapshot.session.archivedAt).toBeUndefined();
  });

  it('refuses delete while a live invocation is attached and deletes once it settled', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sessionId = await setup(async (_invocation, emit) => {
      await held;
      await emit({ kind: 'outcome', outcome: 'completed' });
    });
    const { turnId } = await runtime!.start('actor', sessionId, {
      requestId: randomUUID(),
      message: 'Live',
    });
    operations.length = 0;
    await expect(runtime!.remove(sessionId)).rejects.toMatchObject({
      code: 'TURN_CONFLICT',
      details: { turnId },
    });
    expect(operations).not.toContain('delete');
    release();
    await settled(sessionId);
    await vi.waitFor(() => runtime!.remove(sessionId));
    await expect(runtime!.snapshot(sessionId, 'actor')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      statusCode: 404,
    });
  });
});
