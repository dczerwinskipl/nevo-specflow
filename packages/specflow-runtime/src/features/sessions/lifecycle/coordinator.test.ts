import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore } from '../persistence/store';
import { createMockDriver, type MockScenario } from '../providers/mock';

let runtime: SessionCoordinator | undefined,
  directory = '';
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(scenario?: MockScenario) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-lifecycle-'));
  runtime = createSessionCoordinator(
    await openSessionStore({ directory, projectId: 'project' }),
    createMockDriver(scenario),
    'project',
  );
  return runtime.create('actor', {
    requestId: randomUUID(),
    providerId: 'mock',
    mode: 'read-only',
  });
}
describe('Session coordinator', () => {
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
