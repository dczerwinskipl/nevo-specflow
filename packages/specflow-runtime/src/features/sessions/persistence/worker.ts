import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type {
  ConversationEntry,
  TextPreview,
  SessionChange,
  WorkSummary,
  Interaction,
  ToolActionSummary,
} from '@nevo/specflow-contracts/sessions';
import type { StoredSession, StoredTurn, StoreCommand, WorkerRequest } from './protocol';
import { terminalizeTurn } from '../lifecycle/reducer';
import { StoreFault, fail, decode, type Row } from './encoding';
import { initializeSessionSchema } from './schema';
import { createContentStorage } from './content';
import { createRequestJournal } from './requests';
import { createSessionCursors } from './cursors';
import { createSessionReads } from './reads';
import { createProviderFacts } from './facts';

/** Separate Worker entry: imported surface checks must not acquire a database. */
export async function runSessionWorker(): Promise<void> {
  const options = workerData as {
    kind: string;
    directory: string;
    projectId: string;
    runtimeId: string;
    pid: number;
  };
  if (!parentPort || options.kind !== 'session-store') return;
  const port = parentPort;
  await mkdir(options.directory, { recursive: true });
  const db = new DatabaseSync(join(options.directory, 'sessions.sqlite'));
  db.exec(
    'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;',
  );
  let readRows = 0,
    contentBytes = 0;
  function account(rows: Row[]) {
    readRows += rows.length;
    for (const row of rows)
      for (const value of Object.values(row))
        if (value instanceof Uint8Array) contentBytes += value.byteLength;
  }
  const get = (sql: string, ...args: SQLInputValue[]) => {
    const row = db.prepare(sql).get(...args) as Row | undefined;
    if (row) account([row]);
    return row;
  };
  const all = (sql: string, ...args: SQLInputValue[]) => {
    const rows = db.prepare(sql).all(...args) as Row[];
    account(rows);
    return rows;
  };
  const run = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).run(...args);
  initializeSessionSchema(db, get);
  let epoch = 0;
  const committedChanges = new Set<string>();
  const transactionChanges = new Set<string>();
  const now = () => new Date().toISOString();
  function transaction<T>(fn: () => T, acquiring = false): T {
    transactionChanges.clear();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!acquiring) {
        const owner = get('SELECT * FROM owner WHERE id=1');
        if (owner?.runtime !== options.runtimeId || Number(owner.epoch) !== epoch)
          fail('SESSION_STORE_BUSY', 'Session store ownership was lost.');
      }
      const result = fn();
      db.exec('COMMIT');
      for (const sessionId of transactionChanges) committedChanges.add(sessionId);
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  transaction(() => {
    const previous = get('SELECT * FROM owner WHERE id=1');
    if (previous?.runtime) {
      try {
        process.kill(Number(previous.pid), 0);
        return fail('SESSION_STORE_BUSY', 'Another Runtime owns this Session store.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          return fail('SESSION_STORE_BUSY', 'The previous Runtime could not be proven stopped.');
      }
    }
    epoch = Number(previous?.epoch ?? 0) + 1;
    run('INSERT OR REPLACE INTO owner VALUES(1,?,?,?)', options.runtimeId, options.pid, epoch);
    run('INSERT OR IGNORE INTO meta VALUES(?,?)', 'generation', randomUUID());
    run('INSERT OR IGNORE INTO meta VALUES(?,?)', 'cursor-key', randomBytes(32).toString('hex'));
    run('INSERT OR IGNORE INTO meta VALUES(?,?)', 'project', options.projectId);
    if (get('SELECT value FROM meta WHERE key=?', 'project')?.value !== options.projectId)
      fail('SESSION_STORE_UNAVAILABLE', 'Session store belongs to another project.');
  }, true);
  const generation = String(get('SELECT value FROM meta WHERE key=?', 'generation')!.value);
  const cursorKey = Buffer.from(
    String(get('SELECT value FROM meta WHERE key=?', 'cursor-key')!.value),
    'hex',
  );
  function session(id: string): StoredSession {
    const row = get('SELECT data FROM sessions WHERE id=?', id);
    if (!row) return fail('SESSION_NOT_FOUND', 'Session not found.');
    return decode<StoredSession>(row);
  }
  function turn(id: string, sid: string): StoredTurn {
    return decode<StoredTurn>(get('SELECT data FROM turns WHERE id=? AND session=?', id, sid));
  }
  function saveSession(s: StoredSession): void {
    run(
      'UPDATE sessions SET seq=?,ordinal=?,data=? WHERE id=?',
      s.snapshot.eventSeq,
      s.ordinal,
      JSON.stringify(s),
      s.snapshot.session.sessionId,
    );
  }
  function saveTurn(sid: string, t: StoredTurn): void {
    run(
      'UPDATE turns SET state=?,data=? WHERE id=? AND session=?',
      t.summary.state,
      JSON.stringify(t),
      t.summary.turnId,
      sid,
    );
  }
  function projection(s: StoredSession) {
    const p = s.snapshot;
    return {
      session: p.session,
      activeTurn: p.activeTurn ?? null,
      currentActivity: p.currentActivity ?? null,
      interaction: p.interaction ?? null,
    };
  }
  function emit(s: StoredSession, kind: SessionChange['kind'], changes: unknown): void {
    transactionChanges.add(s.snapshot.session.sessionId);
    s.snapshot.eventSeq++;
    s.snapshot.revision++;
    s.snapshot.session.updatedAt = now();
    const event = {
      sessionId: s.snapshot.session.sessionId,
      eventSeq: s.snapshot.eventSeq,
      kind,
      changes,
    };
    const encoded = JSON.stringify(event);
    if (Buffer.byteLength(encoded) > 65536)
      fail('SESSION_PAYLOAD_TOO_LARGE', 'Canonical event exceeds its byte budget.');
    run('INSERT INTO events VALUES(?,?,?,?)', event.sessionId, event.eventSeq, Date.now(), encoded);
    run('DELETE FROM events WHERE session=? AND seq<=?', event.sessionId, event.eventSeq - 10000);
    run('DELETE FROM events WHERE session=? AND at<?', event.sessionId, Date.now() - 86400000);
    saveSession(s);
  }
  const content = createContentStorage({ get, all, run });
  const { body, preview } = content;
  function entry(
    s: StoredSession,
    tid: string,
    kind: ConversationEntry['kind'],
    text: TextPreview,
    workId?: string,
    existing?: string,
  ): ConversationEntry {
    const old = existing
      ? decode<ConversationEntry>(get('SELECT data FROM entries WHERE id=?', existing))
      : undefined;
    const item: ConversationEntry = {
      id: old?.id ?? randomUUID(),
      ordinal: old?.ordinal ?? ++s.ordinal,
      revision: (old?.revision ?? 0) + 1,
      turnId: tid,
      kind,
      text,
      createdAt: old?.createdAt ?? now(),
      ...(workId ? { workId } : {}),
    };
    run(
      'INSERT OR REPLACE INTO entries VALUES(?,?,?,?,?)',
      item.id,
      s.snapshot.session.sessionId,
      item.ordinal,
      tid,
      JSON.stringify(item),
    );
    emit(s, 'conversation', { entries: [item], projection: projection(s) });
    return item;
  }
  const { request, remember } = createRequestJournal({ get, run });
  const cursors = createSessionCursors(generation, options.projectId, cursorKey);
  const readQueries = createSessionReads({ get, all, run, session, turn, cursors, content });
  function refreshAttention(s: StoredSession, t: StoredTurn): void {
    const pending = get(
      "SELECT data FROM interactions WHERE session=? AND state='pending' ORDER BY ordinal LIMIT 1",
      s.snapshot.session.sessionId,
    );
    delete s.snapshot.interaction;
    if (pending) s.snapshot.interaction = decode<Interaction>(pending);
    const state = t.summary.state;
    s.snapshot.session.readiness =
      state === 'unknown'
        ? 'unavailable'
        : pending
          ? 'requiresAttention'
          : state === 'terminal'
            ? 'ready'
            : 'busy';
    if (state === 'terminal') {
      delete s.snapshot.activeTurn;
      delete s.snapshot.currentActivity;
      return;
    }
    if (state !== 'unknown' && state !== 'cancelling')
      t.summary.state = pending ? 'waitingForUser' : 'active';
    s.snapshot.activeTurn = {
      turnId: t.summary.turnId,
      state: t.summary.state,
      revision: t.summary.revision,
      startedAt: t.summary.createdAt,
    };
    if (
      state === 'unknown' ||
      state === 'cancelling' ||
      pending ||
      !s.snapshot.currentActivity ||
      s.snapshot.currentActivity.kind === 'attention'
    )
      s.snapshot.currentActivity = {
        turnId: t.summary.turnId,
        kind:
          state === 'unknown'
            ? 'unknown'
            : state === 'cancelling'
              ? 'cancelling'
              : pending
                ? 'attention'
                : 'responding',
        label:
          state === 'unknown'
            ? 'Execution status is unknown'
            : pending
              ? 'Response required'
              : 'Working',
      };
  }
  function settle(
    s: StoredSession,
    t: StoredTurn,
    outcome: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    error?: { code: string; message: string },
  ): void {
    if (t.summary.state === 'terminal') return;
    const completedAt = now();
    t.summary = terminalizeTurn(t.summary, outcome, completedAt, t.cancelRequested, error);
    if (t.summary.state === 'terminal') outcome = t.summary.outcome;
    run(
      "UPDATE interactions SET state='expired' WHERE turn=? AND state IN ('pending','admitted')",
      t.summary.turnId,
    );
    for (const row of all('SELECT * FROM work WHERE turn=?', t.summary.turnId)) {
      const w = decode<WorkSummary>(row);
      if (['queued', 'active', 'waiting'].includes(w.state)) {
        w.state =
          outcome === 'interrupted'
            ? 'interrupted'
            : outcome === 'cancelled'
              ? 'cancelled'
              : 'failed';
        w.revision++;
        w.updatedAt = completedAt;
        run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
      }
    }
    for (const row of all('SELECT data FROM actions WHERE turn=?', t.summary.turnId)) {
      const action = decode<ToolActionSummary>(row);
      if (['queued', 'active', 'waiting'].includes(action.state)) {
        action.state =
          outcome === 'interrupted'
            ? 'interrupted'
            : outcome === 'cancelled'
              ? 'cancelled'
              : 'failed';
        action.revision++;
        action.updatedAt = completedAt;
        run('UPDATE actions SET data=? WHERE id=?', JSON.stringify(action), action.actionId);
      }
    }
    saveTurn(s.snapshot.session.sessionId, t);
    refreshAttention(s, t);
    emit(s, 'turn', { turn: t.summary, projection: projection(s) });
    entry(s, t.summary.turnId, 'outcome', {
      text: t.summary.state === 'terminal' ? t.summary.outcome : outcome,
      complete: true,
    });
  }
  const { applyFact } = createProviderFacts({
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
  });
  // Only active records are reconciled; settled conversation/content is not read at boot.
  transaction(() => {
    for (const row of all("SELECT session,data FROM turns WHERE state!='terminal'")) {
      const t = decode<StoredTurn>(row),
        s = session(String(row.session));
      const context = get(
        'SELECT dispatched,confirmed FROM provider_contexts WHERE session=?',
        String(row.session),
      );
      // The durable dispatch barrier precedes native input. A dead owner that never
      // crossed it cannot later send this Turn; recovery never replays that input.
      const undispatched = context && Number(context.dispatched) === 0;
      if (s.snapshot.session.providerId === 'mock' || undispatched)
        settle(s, t, 'interrupted', {
          code: 'INTERRUPTED',
          message: undispatched
            ? 'Runtime stopped before native dispatch.'
            : 'Interrupted by Runtime restart.',
        });
      else {
        run(
          "UPDATE interactions SET state='expired' WHERE turn=? AND state IN ('pending','admitted')",
          t.summary.turnId,
        );
        t.summary.state = 'unknown';
        t.summary.error = {
          code: 'OPERATION_UNKNOWN',
          message: context
            ? Number(context.confirmed) === 1
              ? 'Native context is confirmed; execution and process settlement require reconciliation.'
              : 'Native dispatch may have occurred without confirmed context.'
            : 'Provider execution evidence is unavailable.',
        };
        refreshAttention(s, t);
        saveTurn(String(row.session), t);
        emit(s, 'turn', { turn: t.summary, projection: projection(s) });
      }
    }
  });
  function execute(c: StoreCommand): unknown {
    if (c.op === 'close') {
      transaction(() =>
        run("UPDATE owner SET runtime='',pid=0 WHERE id=1 AND runtime=?", options.runtimeId),
      );
      db.close();
      return null;
    }
    if (c.op === 'replay') return request(c.actor, c.command, c.scope, c.requestId, c.input);
    if (c.op === 'identity') {
      const s = session(c.sessionId);
      return { projectId: s.snapshot.session.projectId, sessionId: c.sessionId };
    }
    if (c.op === 'create')
      return transaction(() => {
        const cached = request(c.actor, 'create', options.projectId, c.input.requestId, c.input);
        if (cached) return cached;
        const id = randomUUID(),
          date = now();
        const s: StoredSession = {
          ordinal: 0,
          snapshot: {
            revision: 0,
            eventSeq: 0,
            entries: [],
            history: { hasOlder: false },
            session: {
              sessionId: id,
              projectId: options.projectId,
              providerId: c.input.providerId,
              mode: c.input.mode,
              ...(c.input.modelId ? { modelId: c.input.modelId } : {}),
              ...(c.input.effort ? { effort: c.input.effort } : {}),
              ...(c.input.title ? { title: c.input.title } : {}),
              readiness: 'ready',
              capabilities: {
                view: true,
                manage: true,
                start: true,
                cancel: false,
                questions: true,
                permissions: true,
              },
              createdAt: date,
              updatedAt: date,
            },
          },
        };
        run(
          'INSERT INTO sessions VALUES(?,?,?,?,?,NULL)',
          id,
          options.projectId,
          0,
          0,
          JSON.stringify(s),
        );
        const result = { sessionId: id };
        remember(c.actor, 'create', options.projectId, c.input.requestId, c.input, result);
        return result;
      });
    if (c.op === 'start')
      return transaction(() => {
        const cached = request(c.actor, 'start', c.sessionId, c.input.requestId, c.input) as
          { turnId: string } | undefined;
        if (cached) return { ...cached, fresh: false };
        const s = session(c.sessionId),
          active = get("SELECT id FROM turns WHERE session=? AND state!='terminal'", c.sessionId);
        if (active)
          throw new StoreFault('TURN_CONFLICT', 'Session already has a nonterminal Turn.', {
            turnId: String(active.id),
          });
        const tid = randomUUID(),
          invocationId = randomUUID(),
          date = now();
        let providerContext:
          { nativeSessionId: string; resume: boolean; scope: string } | undefined;
        if (c.nativeWorkspace !== undefined) {
          if (
            !isAbsolute(c.nativeWorkspace) ||
            c.nativeWorkspace.includes('\0') ||
            Buffer.byteLength(c.nativeWorkspace) > 8192 ||
            !c.nativeScope ||
            Buffer.byteLength(c.nativeScope) > 256
          )
            fail('SESSION_INPUT_INVALID', 'A verified native workspace is required.');
          const previous = get('SELECT * FROM provider_contexts WHERE session=?', c.sessionId);
          if (previous && previous.workspace !== c.nativeWorkspace)
            fail('SESSION_RECOVERY_REQUIRED', 'Native context belongs to another workspace.');
          if (previous && previous.scope !== c.nativeScope)
            fail(
              'SESSION_RECOVERY_REQUIRED',
              'Native context belongs to another provider account.',
            );
          if (previous?.dispatched && !previous.confirmed)
            fail('SESSION_RECOVERY_REQUIRED', 'An unconfirmed dispatch cannot be retried.');
          const nativeSessionId = previous?.confirmed ? String(previous.native) : randomUUID();
          providerContext = {
            nativeSessionId,
            resume: !!previous?.confirmed,
            scope: c.nativeScope,
          };
          run(
            'INSERT OR REPLACE INTO provider_contexts VALUES(?,?,?,?,?,?)',
            c.sessionId,
            nativeSessionId,
            c.nativeWorkspace,
            previous?.confirmed ? 1 : 0,
            0,
            c.nativeScope,
          );
        }
        const t: StoredTurn = {
          invocationId,
          cancelRequested: false,
          summary: {
            turnId: tid,
            revision: 1,
            state: 'active',
            createdAt: date,
            updatedAt: date,
            userMessage: preview(body(c.sessionId, c.input.message)),
          },
        };
        run('INSERT INTO turns VALUES(?,?,?,?)', tid, c.sessionId, 'active', JSON.stringify(t));
        refreshAttention(s, t);
        entry(s, tid, 'request', t.summary.userMessage);
        emit(s, 'turn', { turn: t.summary, projection: projection(s) });
        const result = {
          turnId: tid,
          invocationId,
          ...(providerContext ? { providerContext } : {}),
        };
        remember(c.actor, 'start', c.sessionId, c.input.requestId, c.input, result);
        return { ...result, fresh: true };
      });
    if (c.op === 'fact') return transaction(() => applyFact(c));
    if (c.op === 'dispatch-intent')
      return transaction(() => {
        const t = turn(c.turnId, c.sessionId);
        if (t.invocationId !== c.invocationId || t.summary.state !== 'active' || t.cancelRequested)
          fail('SESSION_RECOVERY_REQUIRED', 'Invocation cannot dispatch.');
        const context = get('SELECT * FROM provider_contexts WHERE session=?', c.sessionId);
        if (!context) fail('SESSION_RECOVERY_REQUIRED', 'Native context is missing.');
        if (context.dispatched)
          fail('SESSION_RECOVERY_REQUIRED', 'Invocation has already dispatched.');
        run('UPDATE provider_contexts SET dispatched=1 WHERE session=?', c.sessionId);
        return true;
      });
    if (c.op === 'cancel')
      return transaction(() => {
        const input = { requestId: c.requestId };
        const scope = c.sessionId + ':' + c.turnId;
        const cached = request(c.actor, 'cancel', scope, c.requestId, input);
        if (cached) return cached;
        const s = session(c.sessionId),
          t = turn(c.turnId, c.sessionId);
        if (t.summary.state !== 'terminal') {
          if (t.summary.state === 'unknown')
            fail(
              'SESSION_RECOVERY_REQUIRED',
              'Unknown execution requires recovery before cancellation.',
            );
          t.cancelRequested = true;
          t.summary.state = 'cancelling';
          t.summary.revision++;
          refreshAttention(s, t);
          saveTurn(c.sessionId, t);
          emit(s, 'turn', { turn: t.summary, projection: projection(s) });
        }
        const result = { turnId: c.turnId };
        remember(c.actor, 'cancel', scope, c.requestId, input, result);
        return result;
      });
    if (c.op === 'respond')
      return transaction(() => {
        const scope = c.sessionId + ':' + c.interactionId;
        const cached = request(c.actor, 'respond', scope, c.input.requestId, c.input);
        if (cached) return { ...cached, fresh: false };
        const s = session(c.sessionId),
          i = s.snapshot.interaction;
        if (i?.interactionId !== c.interactionId)
          fail('INTERACTION_EXPIRED', 'Interaction is no longer answerable.');
        if (i.kind !== c.input.kind)
          fail('INTERACTION_RESPONSE_INVALID', 'Wrong interaction response type.');
        if (i.kind === 'question' && c.input.kind === 'question') {
          const answer = c.input.answer;
          if (
            (answer.text && !i.allowText) ||
            (!answer.text?.trim() && !answer.optionIds.length) ||
            (i.maxSelections !== undefined && answer.optionIds.length > i.maxSelections) ||
            new Set(answer.optionIds).size !== answer.optionIds.length ||
            answer.optionIds.some((id) => !i.options?.some((o) => o.id === id))
          )
            fail('INTERACTION_RESPONSE_INVALID', 'Answer does not match the question.');
        }
        const t = turn(i.turnId, c.sessionId);
        if (
          t.summary.state === 'terminal' ||
          t.summary.state === 'unknown' ||
          t.summary.state === 'cancelling'
        )
          fail('INTERACTION_EXPIRED', 'Interaction operation has ended.');
        // Removing attention acknowledges command admission, not native delivery.
        // Keep the Work waiting until the same live invocation confirms its write.
        run("UPDATE interactions SET state='admitted' WHERE id=?", c.interactionId);
        const w = decode<WorkSummary>(get('SELECT data FROM work WHERE id=?', i.workId));
        w.state = 'waiting';
        w.revision++;
        w.updatedAt = now();
        run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
        t.summary.revision++;
        refreshAttention(s, t);
        saveTurn(c.sessionId, t);
        emit(s, 'interaction', { projection: projection(s) });
        const result = { turnId: i.turnId, interactionId: i.interactionId };
        remember(c.actor, 'respond', scope, c.input.requestId, c.input, result);
        return {
          ...result,
          fresh: true,
          nativeKey: String(get('SELECT native FROM work WHERE id=?', i.workId)!.native),
        };
      });
    if (c.op === 'response-delivered')
      return transaction(() => {
        const t = turn(c.turnId, c.sessionId);
        if (
          t.invocationId !== c.invocationId ||
          t.summary.state === 'unknown' ||
          t.summary.state === 'terminal'
        )
          return false;
        if (c.nativeKeys.length > 32) fail('SESSION_INPUT_INVALID', 'Too many delivered answers.');
        const s = session(c.sessionId);
        for (const nativeKey of c.nativeKeys) {
          const row = get(
            "SELECT i.data FROM interactions i JOIN work w ON w.id=json_extract(i.data,'$.workId') WHERE i.session=? AND i.turn=? AND i.state='admitted' AND w.native=?",
            c.sessionId,
            c.turnId,
            nativeKey,
          );
          if (!row) continue;
          const interaction = decode<Interaction>(row);
          const work = decode<WorkSummary>(
            get('SELECT data FROM work WHERE id=?', interaction.workId),
          );
          run("UPDATE interactions SET state='answered' WHERE id=?", interaction.interactionId);
          work.state = 'completed';
          work.revision++;
          work.updatedAt = now();
          run('UPDATE work SET data=? WHERE id=?', JSON.stringify(work), work.workId);
          emit(s, 'work', { turnId: c.turnId, items: [work] });
        }
        return true;
      });
    return readQueries.execute(c);
  }
  port.on('message', (message: WorkerRequest) => {
    committedChanges.clear();
    readRows = 0;
    contentBytes = 0;
    try {
      const result = execute(message.command);
      port.postMessage({
        id: message.id,
        result,
        changed: [...committedChanges],
        metrics: { rows: readRows, contentBytes },
      });
      if (message.command.op === 'close') port.close();
    } catch (error) {
      const e =
        error instanceof StoreFault
          ? error
          : new StoreFault('SESSION_STORE_UNAVAILABLE', 'Session storage operation failed.');
      port.postMessage({
        id: message.id,
        error: { code: e.code, message: e.message, details: e.details },
      });
    }
  });
  port.postMessage({ id: 0, result: 'ready' });
}
if (!isMainThread && (workerData as { kind?: string })?.kind === 'session-store') {
  void runSessionWorker().catch((error) => {
    const e =
      error instanceof StoreFault
        ? error
        : new StoreFault('SESSION_STORE_UNAVAILABLE', 'Session store could not start.');
    parentPort?.postMessage({ id: 0, error: { code: e.code, message: e.message } });
    parentPort?.close();
  });
}
