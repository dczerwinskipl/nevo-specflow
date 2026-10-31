import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type {
  ContentRef,
  TextPreview,
  ConversationEntry,
  WorkSummary,
  Interaction,
  TurnSummary,
  ToolActionSummary,
  SessionChange,
  LiveProjection,
} from '@nevo/specflow-contracts/sessions';
import type { StoredSession, StoredTurn, StoreCommand, DriverFact } from './protocol';
import type { StoreDatabase } from './database';
import { transitionWork } from '../lifecycle/reducer';
import { decode, fail, stable, prefix } from './encoding';
import type { createSessionTelemetry } from './telemetry';

interface FactDependencies extends Pick<StoreDatabase, 'get' | 'run'> {
  telemetry: ReturnType<typeof createSessionTelemetry>;
  now(this: void): string;
  session(this: void, id: string): StoredSession;
  turn(this: void, id: string, sessionId: string): StoredTurn;
  settle(
    this: void,
    session: StoredSession,
    turn: StoredTurn,
    outcome: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    error?: { code: string; message: string },
  ): void;
  saveTurn(this: void, sessionId: string, turn: StoredTurn): void;
  refreshAttention(this: void, session: StoredSession, turn: StoredTurn): void;
  emit(this: void, session: StoredSession, kind: SessionChange['kind'], changes: unknown): void;
  projection(this: void, session: StoredSession): LiveProjection;
  body(this: void, sessionId: string, text: string, existing?: string): ContentRef;
  preview(this: void, ref: ContentRef): TextPreview;
  entry(
    this: void,
    session: StoredSession,
    turnId: string,
    kind: ConversationEntry['kind'],
    text: TextPreview,
    workId?: string,
    existing?: string,
  ): ConversationEntry;
}
/** Fact normalization mutates the caller's transaction; it never owns a connection or commit. */
export function createProviderFacts({
  get,
  run,
  now,
  session,
  turn,
  settle,
  saveTurn,
  refreshAttention,
  emit,
  projection,
  body,
  preview,
  entry,
  telemetry,
}: FactDependencies) {
  function applyFact(c: Extract<StoreCommand, { op: 'fact' }>, effectVerified = false): boolean {
    const s = session(c.sessionId),
      t = turn(c.turnId, c.sessionId);
    if (t.summary.state === 'terminal' || t.invocationId !== c.invocationId) {
      return false;
    }

    const hash = createHash('sha256').update(stable(c.fact)).digest('hex');
    const old = get(
      'SELECT hash FROM facts WHERE invocation=? AND seq=?',
      c.invocationId,
      c.driverSeq,
    );
    if (old) {
      if (old.hash !== hash) {
        fail('SESSION_INPUT_INVALID', 'Driver sequence changed its payload.');
      }

      return false;
    }

    const latest = get(
      'SELECT seq FROM facts WHERE invocation=? ORDER BY seq DESC LIMIT 1',
      c.invocationId,
    );
    if (c.driverSeq !== Number(latest?.seq ?? 0) + 1) {
      fail('SESSION_INPUT_INVALID', 'Driver sequence is out of order.');
    }

    run('INSERT INTO facts VALUES(?,?,?)', c.invocationId, c.driverSeq, hash);
    const f: DriverFact = c.fact;
    if (f.kind === 'outcome') {
      if (t.effectBinding && !effectVerified) {
        fail(
          'SESSION_RECOVERY_REQUIRED',
          'Writable execution requires verified Engine settlement.',
        );
      }

      settle(s, t, f.outcome, f.error);

      return true;
    }

    if (f.kind === 'lost') {
      t.summary.state = 'unknown';
      t.summary.error = { code: 'OPERATION_UNKNOWN', message: f.message };
      run(
        "UPDATE interactions SET state='expired' WHERE turn=? AND state IN ('pending','admitted')",
        c.turnId,
      );
    }

    if (f.kind === 'correlation') {
      const context = get(
        'SELECT native,confirmed,dispatched FROM provider_contexts WHERE session=?',
        c.sessionId,
      );
      if (
        context &&
        t.nativeContextMode !== 'provider-assigned' &&
        context.native !== f.providerSessionId
      ) {
        fail('SESSION_RECOVERY_REQUIRED', 'Provider context differs from its durable admission.');
      }

      if (
        context &&
        t.nativeContextMode === 'provider-assigned' &&
        !context.confirmed &&
        context.dispatched
      ) {
        fail(
          'SESSION_RECOVERY_REQUIRED',
          'Provider-assigned context must be bound before dispatch.',
        );
      }

      const native = s.snapshot.session.providerId + '\u0000' + f.providerSessionId;
      const existing = get('SELECT native FROM sessions WHERE id=?', c.sessionId)?.native;
      if (existing && existing !== native) {
        fail('SESSION_RECOVERY_REQUIRED', 'Provider context cannot be rebound.');
      }

      run('UPDATE sessions SET native=? WHERE id=?', native, c.sessionId);
      if (context) {
        run('UPDATE provider_contexts SET confirmed=1 WHERE session=?', c.sessionId);
      }
    }

    if (f.kind === 'interaction-expired') {
      const row = get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key);
      if (row) {
        const work = decode<WorkSummary>(row);
        if (work.kind !== 'interaction') {
          fail('SESSION_INPUT_INVALID', 'Expected interaction Work.');
        }

        run(
          "UPDATE interactions SET state='expired' WHERE turn=? AND state IN ('pending','admitted') AND json_extract(data,'$.workId')=?",
          c.turnId,
          work.workId,
        );
        const next = transitionWork(work, 'expired', now());
        run('UPDATE work SET data=? WHERE id=?', JSON.stringify(next), work.workId);
        emit(s, 'work', { turnId: c.turnId, items: [next] });
      }
    }

    if (f.kind === 'work-open') {
      if (get('SELECT id FROM work WHERE turn=? AND native=?', c.turnId, f.key)) {
        fail('SESSION_INPUT_INVALID', 'Work key already exists.');
      }

      const ordinal =
        Number(
          get('SELECT ordinal FROM work WHERE turn=? ORDER BY ordinal DESC LIMIT 1', c.turnId)
            ?.ordinal ?? 0,
        ) + 1;
      const w: WorkSummary = {
        workId: randomUUID(),
        ordinal,
        revision: 1,
        kind: f.workKind,
        state: 'active',
        title: { text: f.title, complete: true },
        createdAt: now(),
        updatedAt: now(),
      };
      run(
        'INSERT INTO work VALUES(?,?,?,?,?,?)',
        w.workId,
        c.sessionId,
        c.turnId,
        ordinal,
        f.key,
        JSON.stringify(w),
      );
      s.snapshot.currentActivity = {
        turnId: c.turnId,
        workId: w.workId,
        kind: f.workKind === 'interaction' ? 'attention' : f.workKind,
        label: prefix(Buffer.from(f.title, 'utf8'), 1024),
      };
      emit(s, 'work', { turnId: c.turnId, items: [w] });
      if (f.workKind === 'tool') {
        entry(s, c.turnId, 'work-summary', w.title, w.workId);
      }
    }

    if (f.kind === 'work-update') {
      const oldWork = decode<WorkSummary>(
        get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key),
      );
      const w = transitionWork(oldWork, f.state, now());
      if (
        s.snapshot.currentActivity?.workId === w.workId &&
        !['queued', 'active', 'waiting'].includes(w.state)
      ) {
        delete s.snapshot.currentActivity;
      }

      run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
      emit(s, 'work', { turnId: c.turnId, items: [w] });
    }

    if (f.kind === 'action-open') {
      const w = decode<WorkSummary>(
        get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.parentKey),
      );
      if (w.kind !== 'tool' || !['queued', 'active', 'waiting'].includes(w.state)) {
        fail('SESSION_INPUT_INVALID', 'ToolAction requires live tool Work.');
      }

      const ordinal =
        Number(
          get('SELECT ordinal FROM actions WHERE work=? ORDER BY ordinal DESC LIMIT 1', w.workId)
            ?.ordinal ?? 0,
        ) + 1;
      const action: ToolActionSummary = {
        actionId: randomUUID(),
        ordinal,
        revision: 1,
        state: 'active',
        title: { text: f.title, complete: true },
        createdAt: now(),
        updatedAt: now(),
      };
      run(
        'INSERT INTO actions VALUES(?,?,?,?,?,?,?)',
        action.actionId,
        c.sessionId,
        c.turnId,
        w.workId,
        ordinal,
        f.key,
        JSON.stringify(action),
      );
      w.actionCount = (w.actionCount ?? 0) + 1;
      w.revision++;
      w.updatedAt = now();
      run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
      emit(s, 'work', { turnId: c.turnId, items: [w] });
    }

    if (f.kind === 'action-update') {
      const row = get('SELECT * FROM actions WHERE turn=? AND native=?', c.turnId, f.key),
        action = decode<ToolActionSummary>(row);
      if (['queued', 'active', 'waiting'].includes(action.state)) {
        action.state = f.state;
        action.revision++;
        action.updatedAt = now();
        run('UPDATE actions SET data=? WHERE id=?', JSON.stringify(action), action.actionId);
      }

      const w = decode<WorkSummary>(get('SELECT data FROM work WHERE id=?', String(row!.work)));
      w.revision++;
      w.updatedAt = now();
      run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
      emit(s, 'work', { turnId: c.turnId, items: [w] });
    }

    if (f.kind === 'progress') {
      s.snapshot.currentActivity = { turnId: c.turnId, kind: f.activity, label: f.label };
    }

    if (f.kind === 'usage') {
      const hash = createHash('sha256')
        .update(
          stable({
            basis: f.basis,
            counters: f.counters,
            ...(f.baseline ? { baseline: true } : {}),
          }),
        )
        .digest('hex');
      const existing = get(
        'SELECT hash FROM usage_samples WHERE invocation=? AND sample=?',
        c.invocationId,
        f.sampleId,
      );
      if (existing && existing.hash !== hash) {
        fail('SESSION_INPUT_INVALID', 'Usage sample changed its meaning.');
      }

      if (!existing) {
        run('INSERT INTO usage_samples VALUES(?,?,?)', c.invocationId, f.sampleId, hash);
        const aggregate = JSON.parse(
          String(
            get(
              'SELECT data FROM usage_basis WHERE invocation=? AND basis=?',
              c.invocationId,
              f.basis,
            )?.data ?? '{}',
          ),
        ) as Record<string, number>;
        const previous = JSON.parse(
          String(get('SELECT data FROM usage_session WHERE session=?', c.sessionId)?.data ?? '{}'),
        ) as Record<string, number>;
        for (const [key, value] of Object.entries(f.counters)) {
          if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
            fail('SESSION_INPUT_INVALID', 'Invalid usage counter.');
          }

          if (f.basis === 'turn-total') {
            aggregate[key] = value;
          } else if (f.basis === 'delta') {
            aggregate[key] = (aggregate[key] ?? 0) + value;
          } else {
            if (previous[key] !== undefined && value >= previous[key]) {
              aggregate[key] = (aggregate[key] ?? 0) + value - previous[key];
            }

            previous[key] = value;
          }

          if (aggregate[key] !== undefined && !Number.isSafeInteger(aggregate[key])) {
            fail('SESSION_INPUT_INVALID', 'Usage counter overflow.');
          }
        }

        run(
          'INSERT OR REPLACE INTO usage_basis VALUES(?,?,?)',
          c.invocationId,
          f.basis,
          JSON.stringify(aggregate),
        );
        if (f.basis === 'session-cumulative') {
          run(
            'INSERT OR REPLACE INTO usage_session VALUES(?,?)',
            c.sessionId,
            JSON.stringify(previous),
          );
        }

        const basis = (name: string) =>
          JSON.parse(
            String(
              get(
                'SELECT data FROM usage_basis WHERE invocation=? AND basis=?',
                c.invocationId,
                name,
              )?.data ?? '{}',
            ),
          ) as NonNullable<TurnSummary['usage']>;
        t.summary.usage = {
          ...basis('session-cumulative'),
          ...basis('delta'),
          ...basis('turn-total'),
        };
        telemetry.usage(s, t, f);
      }
    }

    if (f.kind === 'measurement') {
      telemetry.measurement(s, t, f);
    }

    if (f.kind === 'text') {
      const existing = get(
        'SELECT * FROM text_keys WHERE turn=? AND native=? AND channel=?',
        c.turnId,
        f.key,
        f.channel,
      );
      const ref = body(c.sessionId, f.text, existing ? String(existing.content) : undefined);
      let entryId = existing?.entry ? String(existing.entry) : undefined;
      const wrow = get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key);
      if (wrow) {
        const w = decode<WorkSummary>(wrow);
        if (!['queued', 'active', 'waiting'].includes(w.state)) {
          fail('SESSION_INPUT_INVALID', 'Cannot append text to settled Work.');
        }

        w.content = ref;
        w.revision++;
        w.updatedAt = now();
        run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
        emit(s, 'work', { turnId: c.turnId, items: [w] });
      }

      if (f.channel === 'answer' || f.channel === 'commentary') {
        entryId = entry(
          s,
          c.turnId,
          f.channel === 'answer' ? 'answer' : 'commentary',
          preview(ref),
          undefined,
          entryId,
        ).id;
        if (f.channel === 'answer') {
          t.summary.finalAnswer = preview(ref);
        }
      }

      if (f.channel === 'tool-input' || f.channel === 'tool-output') {
        const row = get('SELECT * FROM actions WHERE turn=? AND native=?', c.turnId, f.key);
        if (row) {
          const action = decode<ToolActionSummary>(row);
          if (!['queued', 'active', 'waiting'].includes(action.state)) {
            fail('SESSION_INPUT_INVALID', 'Cannot append output to settled ToolAction.');
          }

          if (f.channel === 'tool-input') {
            action.input = ref;
          } else {
            action.output = ref;
          }

          action.revision++;
          action.updatedAt = now();
          run('UPDATE actions SET data=? WHERE id=?', JSON.stringify(action), action.actionId);
          const parent = decode<WorkSummary>(
            get('SELECT data FROM work WHERE id=?', String(row.work)),
          );
          parent.revision++;
          run('UPDATE work SET data=? WHERE id=?', JSON.stringify(parent), parent.workId);
          emit(s, 'work', { turnId: c.turnId, items: [parent] });
        }
      }

      run(
        'INSERT OR REPLACE INTO text_keys VALUES(?,?,?,?,?)',
        c.turnId,
        f.key,
        f.channel,
        ref.contentId,
        entryId ?? null,
      );
    }

    if (f.kind === 'interaction') {
      const count = Number(
        get(
          "SELECT count(*) AS n FROM interactions WHERE session=? AND state='pending'",
          c.sessionId,
        )?.n ?? 0,
      );
      if (count >= 32) {
        fail('SESSION_PAYLOAD_TOO_LARGE', 'Too many pending interactions.');
      }

      const w = decode<WorkSummary>(
        get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key),
      );
      const i: Interaction = {
        ...f.interaction,
        interactionId: randomUUID(),
        turnId: c.turnId,
        workId: w.workId,
        revision: 1,
      };
      run(
        'INSERT INTO interactions VALUES(?,?,?,?,?,?)',
        i.interactionId,
        c.sessionId,
        c.turnId,
        w.ordinal,
        'pending',
        JSON.stringify(i),
      );
    }

    t.summary.revision++;
    t.summary.updatedAt = now();
    refreshAttention(s, t);
    saveTurn(c.sessionId, t);
    emit(s, 'turn', { turn: t.summary, projection: projection(s) });

    return true;
  }

  return { applyFact };
}
