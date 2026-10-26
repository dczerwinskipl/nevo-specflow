import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore, type SessionStore } from '../persistence/store';
import { SessionError } from '../errors';
import { createMockDriver, type MockScenario } from '../providers/mock';
import type { SessionDriver } from '../providers/driver';

let runtime: SessionCoordinator | undefined,
  directory = '';
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(
  scenario?: MockScenario,
  driver?: SessionDriver,
  wrapStore?: (store: SessionStore) => SessionStore,
) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-lifecycle-'));
  const store = await openSessionStore({ directory, projectId: 'project' });
  runtime = createSessionCoordinator(
    wrapStore?.(store) ?? store,
    driver ?? createMockDriver(scenario),
    'project',
  );
  return runtime.create('actor', {
    requestId: randomUUID(),
    providerId: driver?.describe().providerId ?? 'mock',
    mode: 'read-only',
  });
}
describe('Session coordinator', () => {
  it('records uncertainty instead of inventing failure when a terminal fact cannot be persisted', async () => {
    let rejected = false;
    const { sessionId } = await setup(undefined, undefined, (store) => ({
      ...store,
      call(command) {
        if (!rejected && command.op === 'fact' && command.fact.kind === 'outcome') {
          rejected = true;
          return Promise.reject(
            new SessionError('SESSION_STORE_BUSY', 'Storage admission timed out.'),
          );
        }
        return store.call(command);
      },
    }));
    await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Start' });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn?.state).toBe('unknown'),
    );
    expect(
      (await runtime!.snapshot(sessionId, 'actor')).entries.some((item) => item.kind === 'outcome'),
    ).toBe(false);
  });
  it('keeps admitted answers unconfirmed when native delivery fails and never resends a retry', async () => {
    const delivery = vi.fn(() => Promise.reject(new Error('Private stdin failure')));
    const base = createMockDriver(async (_invocation, emit, signal) => {
      await emit({ kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Question' });
      await emit({
        kind: 'interaction',
        key: 'q',
        interaction: {
          kind: 'question',
          prompt: 'Continue?',
          allowText: true,
        },
      });
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    });
    const driver: SessionDriver = {
      ...base,
      start(...args) {
        return { ...base.start(...args), respond: delivery };
      },
    };
    const { sessionId } = await setup(undefined, driver);
    const { turnId } = await runtime!.start('actor', sessionId, {
      requestId: randomUUID(),
      message: 'Start',
    });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).interaction).toBeDefined(),
    );
    const interaction = (await runtime!.snapshot(sessionId, 'actor')).interaction!;
    const input = {
      requestId: randomUUID(),
      kind: 'question' as const,
      answer: { optionIds: [], text: 'Yes' },
    };
    await runtime!.respond('actor', sessionId, interaction.interactionId, input);
    await runtime!.respond('actor', sessionId, interaction.interactionId, input);
    expect(delivery).toHaveBeenCalledTimes(1);
    expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn?.state).toBe('unknown');
    const work = await runtime!.store.call<{ items: { state: string }[] }>({
      op: 'work',
      sessionId,
      turnId,
      actor: 'actor',
      limit: 40,
    });
    expect(work.items.map((item) => item.state)).not.toContain('completed');
  });
  it.each(['resolve', 'reject'] as const)(
    'preserves lost operation uncertainty when its handle later %ss',
    async (completion) => {
      let finish!: () => void;
      const completed = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const driver: SessionDriver = {
        ...createMockDriver(),
        describe: () => ({ ...createMockDriver().describe(), providerId: 'claude' }),
        validate: () => undefined,
        start(_invocation, emit) {
          return {
            done: (async () => {
              await emit({ kind: 'lost', message: 'Transport connection lost.' });
              await completed;
              if (completion === 'reject') throw new Error('Private native error');
            })(),
            respond: () => Promise.resolve({ deliveredKeys: [] }),
          };
        },
      };
      const { sessionId } = await setup(undefined, driver);
      await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Start' });
      await vi.waitFor(async () =>
        expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn?.state).toBe('unknown'),
      );
      finish();
      await runtime!.close();
      runtime = undefined;
      const store = await openSessionStore({ directory, projectId: 'project' });
      try {
        const result = await store.call<{
          snapshot: { activeTurn?: { state: string }; entries: { kind: string }[] };
        }>({ op: 'snapshot', sessionId, actor: 'actor' });
        expect(result.snapshot.activeTurn?.state).toBe('unknown');
        expect(result.snapshot.entries.some((entry) => entry.kind === 'outcome')).toBe(false);
      } finally {
        await store.close();
      }
    },
  );
  it('answers a live permission once without granting any filesystem capability', async () => {
    const observed = vi.fn();
    const { sessionId } = await setup(async (invocation, emit, _signal, question) => {
      expect(invocation.executionContext).toEqual({ kind: 'no-effects' });
      await emit({
        kind: 'work-open',
        key: 'permission',
        workKind: 'interaction',
        title: 'Permission',
      });
      const answer = question('permission');
      await emit({
        kind: 'interaction',
        key: 'permission',
        interaction: {
          kind: 'permission',
          prompt: 'Continue the simulation?',
          actionSummary: 'No external effects',
        },
      });
      observed(await answer);
    });
    await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Run' });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).interaction?.kind).toBe('permission'),
    );
    const interaction = (await runtime!.snapshot(sessionId, 'actor')).interaction!;
    const input = {
      kind: 'permission' as const,
      requestId: randomUUID(),
      decision: 'deny' as const,
    };
    await runtime!.respond('actor', sessionId, interaction.interactionId, input);
    await runtime!.respond('actor', sessionId, interaction.interactionId, input);
    await vi.waitFor(() => expect(observed).toHaveBeenCalledExactlyOnceWith(input));
  });
  it('persists default no-effect conversation and deduplicates completed requests', async () => {
    const { sessionId } = await setup(),
      input = { requestId: randomUUID(), message: 'Hello' };
    const start = await runtime!.start('actor', sessionId, input);
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn).toBeUndefined(),
    );
    expect(await runtime!.start('actor', sessionId, input)).toEqual(start);
    const snap = await runtime!.snapshot(sessionId, 'actor');
    expect(snap.entries.filter((e) => e.kind === 'answer').map((e) => e.text.text)).toEqual([
      'Mock response: Hello',
    ]);
    expect(snap.entries.at(-1)?.text.text).toBe('completed');
  });
  it('resolves a live question once and continues its same Turn', async () => {
    const { sessionId } = await setup(async (_i, emit, _signal, question) => {
      await emit({ kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Question' });
      const answer = question('q');
      await emit({
        kind: 'interaction',
        key: 'q',
        interaction: { kind: 'question', prompt: 'Choose', allowText: true },
      });
      await answer;
      await emit({ kind: 'text', key: 'answer', channel: 'answer', text: 'Answered' });
    });
    const { turnId } = await runtime!.start('actor', sessionId, {
      requestId: randomUUID(),
      message: 'Hello',
    });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).interaction).toBeDefined(),
    );
    const i = (await runtime!.snapshot(sessionId, 'actor')).interaction!;
    const input = {
      requestId: randomUUID(),
      kind: 'question' as const,
      answer: { optionIds: [], text: 'Yes' },
    };
    expect(await runtime!.respond('actor', sessionId, i.interactionId, input)).toEqual({
      turnId,
      interactionId: i.interactionId,
    });
    expect(await runtime!.respond('actor', sessionId, i.interactionId, input)).toEqual({
      turnId,
      interactionId: i.interactionId,
    });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn).toBeUndefined(),
    );
    await expect(
      runtime!.respond('actor', sessionId, i.interactionId, { ...input, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
  });
  it('cancels a waiting provider without cancelling a later Turn', async () => {
    const { sessionId } = await setup(async (_i, emit, _signal, question) => {
      await emit({ kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Permission' });
      const answer = question('q');
      await emit({
        kind: 'interaction',
        key: 'q',
        interaction: { kind: 'permission', prompt: 'Allow?', actionSummary: 'Synthetic action' },
      });
      await answer;
    });
    const { turnId } = await runtime!.start('actor', sessionId, {
      requestId: randomUUID(),
      message: 'Hello',
    });
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).interaction).toBeDefined(),
    );
    const key = randomUUID();
    await runtime!.cancel('actor', sessionId, turnId, key);
    await vi.waitFor(async () =>
      expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn).toBeUndefined(),
    );
    expect((await runtime!.snapshot(sessionId, 'actor')).entries.at(-1)?.text.text).toBe(
      'cancelled',
    );
    await runtime!.start('actor', sessionId, { requestId: randomUUID(), message: 'Next' });
    await runtime!.cancel('actor', sessionId, turnId, key);
    expect((await runtime!.snapshot(sessionId, 'actor')).activeTurn?.turnId).not.toBe(turnId);
  });
});
