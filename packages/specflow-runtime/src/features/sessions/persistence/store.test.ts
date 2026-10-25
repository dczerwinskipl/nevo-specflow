import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  SessionSnapshot,
  ContentPage,
  HistoryPage,
  WorkPage,
  ActionPage,
} from '@nevo/specflow-contracts/sessions';
import { openSessionStore, type SessionStore } from './store';
import type { SnapshotSource, StartAdmission, DriverFact } from './protocol';

let store: SessionStore | undefined;
let directory = '';
afterEach(async () => {
  await store?.close();
  store = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function create() {
  directory = await mkdtemp(join(tmpdir(), 'nevo-sessions-'));
  store = await openSessionStore({ directory, projectId: 'project' });
  const input = { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' as const };
  const session = await store.call<{ sessionId: string }>({ op: 'create', actor: 'user', input });
  return { ...session, input };
}
async function snap(sessionId: string): Promise<SessionSnapshot> {
  return (await store!.call<SnapshotSource>({ op: 'snapshot', sessionId, actor: 'user' })).snapshot;
}
describe('durable Session store', () => {
  it('admits only one concurrent Turn and returns the same durable request result', async () => {
    const { sessionId } = await create();
    const input = { requestId: randomUUID(), message: 'Same logical request' };
    const [first, retry] = await Promise.all([
      store!.call<StartAdmission>({ op: 'start', actor: 'user', sessionId, input }),
      store!.call<StartAdmission>({ op: 'start', actor: 'user', sessionId, input }),
    ]);
    expect(first.turnId).toBe(retry.turnId);
    expect([first.fresh, retry.fresh].filter(Boolean)).toHaveLength(1);
    await expect(
      store!.call({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { ...input, requestId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'TURN_CONFLICT' });
  });
  it('preserves compound tool output and deduplicates usage across delta and total facts', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Inspect' },
    });
    let driverSeq = 0;
    const emit = (fact: DriverFact) =>
      store!.call({ op: 'fact', sessionId, ...start, driverSeq: ++driverSeq, fact });
    await emit({ kind: 'work-open', key: 'tool', workKind: 'tool', title: 'Inspect' });
    await emit({ kind: 'action-open', parentKey: 'tool', key: 'one', title: 'Read one' });
    await emit({ kind: 'text', key: 'one', channel: 'tool-output', text: 'first' });
    const work = await store!.call<WorkPage>({
      op: 'work',
      sessionId,
      turnId: start.turnId,
      actor: 'user',
      limit: 40,
    });
    const workId = work.items[0]!.workId;
    const before = await store!.call<ActionPage>({
      op: 'actions',
      sessionId,
      workId,
      actor: 'user',
      limit: 40,
    });
    const oldRef = before.items[0]!.output!;
    await emit({ kind: 'text', key: 'one', channel: 'tool-output', text: ' second' });
    expect(
      await store!.call({ op: 'content', sessionId, ...oldRef, offset: 0, limitBytes: 65536 }),
    ).toMatchObject({ text: 'first', complete: true });
    await expect(
      store!.call({
        op: 'content',
        sessionId,
        ...oldRef,
        revision: '3',
        offset: 0,
        limitBytes: 65536,
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_REVISION_UNAVAILABLE' });
    await emit({ kind: 'action-update', key: 'one', state: 'failed' });
    await emit({ kind: 'work-update', key: 'tool', state: 'completed' });
    await emit({ kind: 'usage', sampleId: 'delta', basis: 'delta', counters: { inputTokens: 4 } });
    await emit({ kind: 'usage', sampleId: 'delta', basis: 'delta', counters: { inputTokens: 4 } });
    await emit({
      kind: 'usage',
      sampleId: 'total',
      basis: 'turn-total',
      counters: { inputTokens: 7, outputTokens: 2 },
    });
    await emit({ kind: 'outcome', outcome: 'completed' });
    const settled = await store!.call<WorkPage>({
      op: 'work',
      sessionId,
      turnId: start.turnId,
      actor: 'user',
      limit: 40,
    });
    expect(settled.turn).toMatchObject({
      state: 'terminal',
      outcome: 'completed',
      usage: { inputTokens: 7, outputTokens: 2 },
    });
    const actions = await store!.call<ActionPage>({
      op: 'actions',
      sessionId,
      workId,
      actor: 'user',
      limit: 40,
    });
    expect(actions.items[0]).toMatchObject({ state: 'failed', output: { byteLength: 12 } });
    expect((await snap(sessionId)).entries.some((e) => e.text.text === 'first second')).toBe(false);
  });
  it('refuses another live owner and reopens after a clean release', async () => {
    const { sessionId } = await create();
    await expect(openSessionStore({ directory, projectId: 'project' })).rejects.toMatchObject({
      code: 'SESSION_STORE_BUSY',
    });
    await store!.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect((await snap(sessionId)).session.sessionId).toBe(sessionId);
  });
  it('persists idempotency through terminalization and restart and rejects changed payload', async () => {
    const { sessionId } = await create(),
      input = { requestId: randomUUID(), message: 'Hello' };
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input,
    });
    await expect(
      store!.call({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { ...input, requestId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'TURN_CONFLICT' });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 1,
      fact: { kind: 'outcome', outcome: 'completed' },
    });
    await store!.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect(await store.call({ op: 'start', actor: 'user', sessionId, input })).toMatchObject({
      turnId: start.turnId,
      fresh: false,
    });
    await expect(
      store.call({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { ...input, message: 'Changed' },
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('reads UTF-8 ranges and opens large messages with a small preview', async () => {
    const { sessionId } = await create(),
      message = '😀'.repeat(20_000);
    await store!.call({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message },
    });
    const snapshot = await snap(sessionId),
      ref = snapshot.entries[0]!.text.content!;
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(10_000);
    expect(snapshot.entries[0]!.text.complete).toBe(false);
    const page = await store!.call<ContentPage>({
      op: 'content',
      sessionId,
      ...ref,
      offset: 0,
      limitBytes: 65_535,
    });
    expect(page.nextOffset).toBe(65_532);
    expect(page.text).not.toContain('\ufffd');
    await expect(
      store!.call({ op: 'content', sessionId, ...ref, offset: 1, limitBytes: 4 }),
    ).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID' });
  });
  it('pages older membership while new Turns arrive, binding cursors to the actor', async () => {
    const { sessionId } = await create();
    for (let n = 0; n < 25; n++) {
      const start = await store!.call<StartAdmission>({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { requestId: randomUUID(), message: String(n) },
      });
      await store!.call({
        op: 'fact',
        sessionId,
        ...start,
        driverSeq: 1,
        fact: { kind: 'outcome', outcome: 'completed' },
      });
    }
    const snapshot = await snap(sessionId);
    expect(snapshot.entries).toHaveLength(40);
    const before = snapshot.history.before!;
    const page = await store!.call<HistoryPage>({
      op: 'history',
      sessionId,
      actor: 'user',
      before,
      limit: 40,
    });
    expect(page.entries).toHaveLength(10);
    expect(page.history.hasOlder).toBe(false);
    expect(new Set([...page.entries, ...snapshot.entries].map((e) => e.id)).size).toBe(50);
    await expect(
      store!.call({ op: 'history', sessionId, actor: 'other', before, limit: 40 }),
    ).rejects.toMatchObject({ code: 'SESSION_CURSOR_INVALID' });
  });
  it('expires orphaned mock execution at restart and ignores late terminal callbacks', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Hello' },
    });
    await store!.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect((await snap(sessionId)).activeTurn).toBeUndefined();
    expect((await snap(sessionId)).entries.at(-1)?.text.text).toBe('interrupted');
    expect(
      await store.call({
        op: 'fact',
        sessionId,
        ...start,
        driverSeq: 1,
        fact: { kind: 'outcome', outcome: 'completed' },
      }),
    ).toBe(false);
  });
});
