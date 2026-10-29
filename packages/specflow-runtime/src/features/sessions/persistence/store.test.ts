import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { sessionValidators, SessionLimits } from '@nevo/specflow-contracts/sessions';
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
import { validateDriverFact } from '../providers/facts';

let store: SessionStore | undefined;
let directory = '';
afterEach(async () => {
  await store?.close();
  store = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});
async function create(providerId = 'mock') {
  directory = await mkdtemp(join(tmpdir(), 'nevo-sessions-'));
  store = await openSessionStore({ directory, projectId: 'project' });
  const input = { requestId: randomUUID(), providerId, mode: 'read-only' as const };
  const session = await store.call<{ sessionId: string }>({ op: 'create', actor: 'user', input });

  return { ...session, input };
}

async function snap(sessionId: string): Promise<SessionSnapshot> {
  return (await store!.call<SnapshotSource>({ op: 'snapshot', sessionId, actor: 'user' })).snapshot;
}

describe('durable Session store', () => {
  it.each(['before-input', 'after-result'] as const)(
    'binds provider-assigned identity before dispatch and preserves it across restart: %s',
    async (cut) => {
      const { sessionId } = await create('controlled');
      const native = {
        nativeWorkspace: directory,
        nativeScope: 'account',
        nativeWorkspaceIdentity: 'a'.repeat(64),
        nativeContextMode: 'provider-assigned' as const,
      };
      const admitted = await store!.call<StartAdmission>({
        op: 'start',
        actor: 'user',
        sessionId,
        ...native,
        input: { requestId: randomUUID(), message: 'First' },
      });
      const dispatch = {
        op: 'dispatch-intent' as const,
        sessionId,
        turnId: admitted.turnId,
        invocationId: admitted.invocationId,
      };
      await expect(store!.call(dispatch)).rejects.toMatchObject({
        code: 'SESSION_RECOVERY_REQUIRED',
      });
      const providerSessionId = 'thread-' + randomUUID();
      await store!.call({
        ...dispatch,
        op: 'fact',
        driverSeq: 1,
        fact: { kind: 'correlation', providerSessionId },
      });
      if (cut === 'after-result') {
        await store!.call(dispatch);
        await store!.call({
          op: 'fact',
          sessionId,
          turnId: admitted.turnId,
          invocationId: admitted.invocationId,
          driverSeq: 2,
          fact: { kind: 'outcome', outcome: 'completed' },
        });
      }

      await store!.close();
      store = await openSessionStore({ directory, projectId: 'project' });
      const resumed = await store.call<StartAdmission>({
        op: 'start',
        actor: 'user',
        sessionId,
        ...native,
        input: { requestId: randomUUID(), message: 'Continue' },
      });
      expect(resumed.providerContext).toMatchObject({
        nativeSessionId: providerSessionId,
        resume: true,
        scope: 'account',
      });
      await expect(
        store.call({
          op: 'fact',
          sessionId,
          turnId: resumed.turnId,
          invocationId: resumed.invocationId,
          driverSeq: 1,
          fact: { kind: 'correlation', providerSessionId: 'replacement-' + randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
      await store.call({
        op: 'fact',
        sessionId,
        turnId: resumed.turnId,
        invocationId: resumed.invocationId,
        driverSeq: 1,
        fact: { kind: 'correlation', providerSessionId },
      });
    },
  );
  it.each(['expired', 'terminal'] as const)(
    'does not revive %s interaction Work after a late delivery receipt',
    async (state) => {
      const { sessionId } = await create();
      const admitted = await store!.call<StartAdmission>({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { requestId: randomUUID(), message: 'Question' },
      });
      const fact = (driverSeq: number, value: DriverFact) =>
        store!.call({ op: 'fact', sessionId, ...admitted, driverSeq, fact: value });
      await fact(1, {
        kind: 'work-open',
        key: 'question',
        workKind: 'interaction',
        title: 'Question',
      });
      await fact(2, {
        kind: 'interaction',
        key: 'question',
        interaction: { kind: 'question', prompt: 'Continue?', allowText: true },
      });
      const interactionId = (await snap(sessionId)).interaction!.interactionId;
      const input = {
        requestId: randomUUID(),
        kind: 'question' as const,
        answer: { optionIds: [], text: 'Yes' },
      };
      await store!.call({ op: 'respond', sessionId, actor: 'user', interactionId, input });
      await fact(
        3,
        state === 'expired'
          ? { kind: 'interaction-expired', key: 'question' }
          : { kind: 'outcome', outcome: 'cancelled' },
      );
      await store!.call({
        op: 'response-delivered',
        sessionId,
        turnId: admitted.turnId,
        invocationId: admitted.invocationId,
        nativeKeys: ['question'],
      });
      const work = await store!.call<WorkPage>({
        op: 'work',
        sessionId,
        turnId: admitted.turnId,
        actor: 'user',
        limit: 40,
      });
      expect(work.items[0]?.state).toBe(state === 'expired' ? 'expired' : 'cancelled');
      expect(
        await store!.call({ op: 'respond', sessionId, actor: 'user', interactionId, input }),
      ).toMatchObject({ fresh: false });
    },
  );
  it('reconciles only an unpassed native dispatch barrier and preserves idempotency and affinity', async () => {
    const { sessionId } = await create('claude');
    const input = { requestId: randomUUID(), message: 'Never dispatched' };
    const command = {
      op: 'start' as const,
      actor: 'user',
      sessionId,
      input,
      nativeWorkspace: join(directory, 'workspace'),
      nativeScope: 'account-a',
    };
    const admitted = await store!.call<StartAdmission>(command);
    await store!.call({
      op: 'fact',
      sessionId,
      ...admitted,
      driverSeq: 1,
      fact: { kind: 'correlation', providerSessionId: admitted.providerContext!.nativeSessionId },
    });
    await store!.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect((await snap(sessionId)).activeTurn).toBeUndefined();
    expect((await snap(sessionId)).entries.at(-1)?.text.text).toBe('interrupted');
    expect(await store.call<StartAdmission>(command)).toMatchObject({
      turnId: admitted.turnId,
      fresh: false,
    });
    await expect(
      store.call({
        ...command,
        nativeScope: 'account-b',
        input: { ...input, requestId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    await expect(
      store.call({
        ...command,
        nativeWorkspace: join(directory, 'other'),
        input: { ...input, requestId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    const next = await store.call<StartAdmission>({
      ...command,
      input: { requestId: randomUUID(), message: 'New intent' },
    });
    expect(next.providerContext).toEqual({ ...admitted.providerContext, resume: true });
  });
  it('notifies only committed outbox changes and keeps a terminal fact under read saturation', async () => {
    const { sessionId } = await create();
    let changes = 0;
    const unsubscribe = store!.subscribe(sessionId, () => {
      changes++;
    });
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Start' },
    });
    expect(changes).toBe(1);
    const reads = Array.from({ length: 80 }, () =>
      store!.call({ op: 'snapshot', sessionId, actor: 'user' }),
    );
    const settledReads = Promise.allSettled(reads);
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 1,
      fact: { kind: 'outcome', outcome: 'completed' },
    });
    expect((await settledReads).some((result) => result.status === 'rejected')).toBe(true);
    expect(changes).toBe(2);
    expect((await snap(sessionId)).entries.at(-1)?.text.text).toBe('completed');
    await expect(
      store!.call({
        op: 'fact',
        sessionId,
        ...start,
        driverSeq: 99,
        fact: { kind: 'outcome', outcome: 'failed' },
      }),
    ).resolves.toBe(false);
    expect(changes).toBe(2);
    unsubscribe();
  });
  it('persists native admission and resumes the confirmed context across Runtime restart, scoped to workspace and account', async () => {
    const { sessionId } = await create('claude');
    const nativeWorkspace = join(directory, 'workspace');
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      nativeWorkspace,
      nativeScope: 'account-a',
      input: { requestId: randomUUID(), message: 'First' },
    });
    expect(start.providerContext).toMatchObject({ resume: false, scope: 'account-a' });
    const nativeSessionId = start.providerContext!.nativeSessionId;
    await store!.call({
      op: 'dispatch-intent',
      sessionId,
      turnId: start.turnId,
      invocationId: start.invocationId,
    });
    await expect(
      store!.call({
        op: 'dispatch-intent',
        sessionId,
        turnId: start.turnId,
        invocationId: start.invocationId,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 1,
      fact: { kind: 'correlation', providerSessionId: nativeSessionId },
    });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 2,
      fact: { kind: 'outcome', outcome: 'completed' },
    });
    await store!.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    const next = await store.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      nativeWorkspace,
      nativeScope: 'account-a',
      input: { requestId: randomUUID(), message: 'Second' },
    });
    expect(next.providerContext).toEqual({ nativeSessionId, resume: true, scope: 'account-a' });
    const snapshot = JSON.stringify(await snap(sessionId));
    expect(snapshot).not.toContain(nativeSessionId);
    expect(snapshot).not.toContain('account-a');
    await store.call({
      op: 'fact',
      sessionId,
      ...next,
      driverSeq: 1,
      fact: { kind: 'outcome', outcome: 'completed' },
    });
    for (const change of [
      { nativeWorkspace: join(directory, 'other'), nativeScope: 'account-a' },
      { nativeWorkspace, nativeScope: 'account-b' },
    ]) {
      await expect(
        store.call({
          op: 'start',
          actor: 'user',
          sessionId,
          ...change,
          input: { requestId: randomUUID(), message: 'Unsafe resume' },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    }
  });
  it('does not replay an unconfirmed native dispatch and never silently rebinds correlation', async () => {
    const { sessionId } = await create('claude');
    const nativeWorkspace = join(directory, 'workspace');
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      nativeWorkspace,
      nativeScope: 'account',
      input: { requestId: randomUUID(), message: 'First' },
    });
    await store!.call({
      op: 'dispatch-intent',
      sessionId,
      turnId: start.turnId,
      invocationId: start.invocationId,
    });
    await expect(
      store!.call({
        op: 'fact',
        sessionId,
        ...start,
        driverSeq: 1,
        fact: { kind: 'correlation', providerSessionId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 1,
      fact: { kind: 'outcome', outcome: 'failed' },
    });
    await expect(
      store!.call({
        op: 'start',
        actor: 'user',
        sessionId,
        nativeWorkspace,
        nativeScope: 'account',
        input: { requestId: randomUUID(), message: 'Unsafe replay' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
  });
  it('checks single-selection answers before durable admission and expires native-cancelled questions', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Question' },
    });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 1,
      fact: { kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Question' },
    });
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 2,
      fact: {
        kind: 'interaction',
        key: 'q',
        interaction: {
          kind: 'question',
          prompt: 'Pick',
          allowText: true,
          maxSelections: 1,
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
      },
    });
    const interactionId = (await snap(sessionId)).interaction!.interactionId;
    await expect(
      store!.call({
        op: 'respond',
        actor: 'user',
        sessionId,
        interactionId,
        input: { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['a', 'b'] } },
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_RESPONSE_INVALID' });
    expect((await snap(sessionId)).interaction?.interactionId).toBe(interactionId);
    await store!.call({
      op: 'fact',
      sessionId,
      ...start,
      driverSeq: 3,
      fact: { kind: 'interaction-expired', key: 'q' },
    });
    expect((await snap(sessionId)).interaction).toBeUndefined();
    expect((await snap(sessionId)).activeTurn?.state).toBe('active');
    await expect(
      store!.call({
        op: 'respond',
        actor: 'user',
        sessionId,
        interactionId,
        input: { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['a'] } },
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
  });
  it('bounds activity labels for valid long and multi-byte Work titles', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Inspect' },
    });
    let driverSeq = 0;
    for (const title of ['x'.repeat(1500), '💬'.repeat(500)]) {
      const fact: DriverFact = {
        kind: 'work-open',
        key: String(driverSeq),
        workKind: 'tool',
        title,
      };
      validateDriverFact(fact);
      await store!.call({ op: 'fact', sessionId, ...start, driverSeq: ++driverSeq, fact });
      const snapshot = await snap(sessionId);
      expect(sessionValidators.snapshot(snapshot)).toBe(true);
      expect(Buffer.byteLength(snapshot.currentActivity!.label)).toBeLessThanOrEqual(1024);
      expect(snapshot.currentActivity!.label).not.toContain('\ufffd');
    }
  });
  it('pages escaped previews within the serialized JSON budget without losing older entries', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Inspect' },
    });
    for (let driverSeq = 1; driverSeq <= 85; driverSeq++) {
      await store!.call({
        op: 'fact',
        sessionId,
        ...start,
        driverSeq,
        fact: {
          kind: 'text',
          key: String(driverSeq),
          channel: 'commentary',
          text: '\0'.repeat(2048),
        },
      });
    }

    const snapshot = await snap(sessionId);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(
      SessionLimits.pageBytes,
    );
    expect(snapshot.entries.length).toBeLessThan(40);
    expect(store!.readMetrics()).toMatchObject({ contentBytes: 0 });
    expect(store!.readMetrics().rows).toBeLessThanOrEqual(42);
    let history = snapshot.history;
    const entries = [...snapshot.entries];
    while (history.before) {
      const page = await store!.call<HistoryPage>({
        op: 'history',
        sessionId,
        actor: 'user',
        before: history.before,
        limit: 40,
      });
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(SessionLimits.pageBytes);
      expect(page.entries.length).toBeGreaterThan(0);
      entries.unshift(...page.entries);
      history = page.history;
    }

    expect(entries).toHaveLength(86);
    expect(new Set(entries.map((e) => e.id)).size).toBe(86);
    expect(entries.map((e) => e.ordinal)).toEqual(Array.from({ length: 86 }, (_, n) => n + 1));
  });
  it('budgets escaped Work/action pages including metadata and preserves cursor membership', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: '\0'.repeat(2048) },
    });
    let driverSeq = 0;
    const emit = (fact: DriverFact) =>
      store!.call({ op: 'fact', sessionId, ...start, driverSeq: ++driverSeq, fact });
    for (let n = 0; n < 45; n++) {
      await emit({ kind: 'work-open', key: 'w' + n, workKind: 'tool', title: '\0'.repeat(2048) });
    }

    let work = await store!.call<WorkPage>({
      op: 'work',
      sessionId,
      turnId: start.turnId,
      actor: 'user',
      limit: 40,
    });
    const workId = work.items.at(-1)!.workId;
    const workIds: string[] = [];
    for (;;) {
      expect(Buffer.byteLength(JSON.stringify(work))).toBeLessThanOrEqual(SessionLimits.pageBytes);
      workIds.push(...work.items.map((item) => item.workId));
      if (!work.history.before) {
        break;
      }

      work = await store!.call<WorkPage>({
        op: 'work',
        sessionId,
        turnId: start.turnId,
        actor: 'user',
        before: work.history.before,
        limit: 40,
      });
    }

    expect(new Set(workIds).size).toBe(45);
    expect(workIds).toHaveLength(45);
    for (let n = 0; n < 45; n++) {
      await emit({ kind: 'action-open', key: 'a' + n, parentKey: 'w44', title: '\0'.repeat(2048) });
    }

    let actions = await store!.call<ActionPage>({
      op: 'actions',
      sessionId,
      workId,
      actor: 'user',
      limit: 40,
    });
    const actionIds: string[] = [];
    for (;;) {
      expect(Buffer.byteLength(JSON.stringify(actions))).toBeLessThanOrEqual(
        SessionLimits.pageBytes,
      );
      actionIds.push(...actions.items.map((item) => item.actionId));
      if (!actions.history.before) {
        break;
      }

      actions = await store!.call<ActionPage>({
        op: 'actions',
        sessionId,
        workId,
        actor: 'user',
        before: actions.history.before,
        limit: 40,
      });
    }

    expect(new Set(actionIds).size).toBe(45);
    expect(actionIds).toHaveLength(45);
  });
  it('refuses an unrecognized database instead of treating its contents as a new store', async () => {
    directory = await mkdtemp(join(tmpdir(), 'nevo-session-foreign-'));
    const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
    db.exec('CREATE TABLE unrelated(value TEXT)');
    db.close();
    await expect(openSessionStore({ directory, projectId: 'project' })).rejects.toMatchObject({
      code: 'SESSION_STORE_UNAVAILABLE',
    });
    const inspect = new DatabaseSync(join(directory, 'sessions.sqlite'));
    try {
      expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([
        { name: 'unrelated' },
      ]);
    } finally {
      inspect.close();
    }
  });
  it('expires interaction immediately when live execution becomes unknown', async () => {
    const { sessionId } = await create();
    const start = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Question' },
    });
    let driverSeq = 0;
    const emit = (fact: DriverFact) =>
      store!.call({ op: 'fact', sessionId, ...start, driverSeq: ++driverSeq, fact });
    await emit({ kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Question' });
    await emit({
      kind: 'interaction',
      key: 'q',
      interaction: { kind: 'question', prompt: 'Continue?', allowText: true },
    });
    const interaction = (await snap(sessionId)).interaction!;
    await emit({ kind: 'lost', message: 'Connection outcome unknown' });
    expect((await snap(sessionId)).interaction).toBeUndefined();
    expect((await snap(sessionId)).activeTurn?.state).toBe('unknown');
    await expect(
      store!.call({
        op: 'respond',
        actor: 'user',
        sessionId,
        interactionId: interaction.interactionId,
        input: {
          kind: 'question',
          requestId: randomUUID(),
          answer: { text: 'yes', optionIds: [] },
        },
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
    await expect(
      store!.call({
        op: 'cancel',
        actor: 'user',
        sessionId,
        turnId: start.turnId,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
  });
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
