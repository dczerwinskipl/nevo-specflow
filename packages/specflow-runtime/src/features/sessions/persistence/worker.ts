import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type {
  ConversationEntry,
  TextPreview,
  ContentRef,
  SessionChange,
  WorkSummary,
  Interaction,
  TurnSummary,
  ToolActionSummary,
} from '@nevo/specflow-contracts/sessions';
import type {
  StoredSession,
  StoredTurn,
  StoreCommand,
  WorkerRequest,
  DriverFact,
} from './protocol';
import { terminalizeTurn, transitionWork } from '../lifecycle/reducer';

type Row = Record<string, string | number | bigint | null | Uint8Array>;
class StoreFault extends Error {
  readonly code: string;
  readonly details?: { turnId?: string; reason?: string };
  constructor(code: string, message: string, details?: { turnId?: string; reason?: string }) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
function fail(code: string, message: string): never {
  throw new StoreFault(code, message);
}
const decode = <T>(value: Row | undefined, key = 'data'): T => {
  if (!value || typeof value[key] !== 'string')
    return fail('SESSION_RESOURCE_NOT_FOUND', 'Resource is unavailable.');
  return JSON.parse(value[key]) as T;
};
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
      .join(',') +
    '}'
  );
}
function prefix(bytes: Uint8Array, limit: number): string {
  let end = Math.min(bytes.length, limit);
  while (end > 0) {
    try {
      return new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, end));
    } catch {
      end--;
      if (end < Math.min(bytes.length, limit) - 4) throw new Error('Invalid content encoding');
    }
  }
  return '';
}

/** Keep the newest contiguous membership, including JSON escaping and envelope/cursor bytes. */
function boundedPage<Item, Page>(
  items: Item[],
  hasOlder: boolean,
  project: (items: Item[], hasOlder: boolean) => Page,
): Page {
  for (;;) {
    const page = project(items, hasOlder);
    // HTTP may replace capability true with false and readiness with unavailable after this read.
    if (Buffer.byteLength(JSON.stringify(page), 'utf8') <= 256 * 1024 - 64) return page;
    if (items.length <= 1)
      fail('SESSION_PAYLOAD_TOO_LARGE', 'Session page metadata exceeds its byte budget.');
    items = items.slice(1);
    hasOlder = true;
  }
}

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
  const version = Number(get('PRAGMA user_version')?.user_version ?? 0);
  if (version !== 0 && version !== 1)
    return fail('SESSION_STORE_UNAVAILABLE', 'Unsupported Session schema.');
  if (
    version === 0 &&
    get("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
  )
    return fail('SESSION_STORE_UNAVAILABLE', 'Unrecognized Session database.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),runtime TEXT NOT NULL,pid INTEGER NOT NULL,epoch INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,project TEXT NOT NULL,seq INTEGER NOT NULL,ordinal INTEGER NOT NULL,data TEXT NOT NULL,native TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS provider_contexts(session TEXT PRIMARY KEY,native TEXT UNIQUE NOT NULL,workspace TEXT NOT NULL,confirmed INTEGER NOT NULL,dispatched INTEGER NOT NULL,scope TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,session TEXT NOT NULL REFERENCES sessions(id),state TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_turn ON turns(session) WHERE state!='terminal';
    CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,session TEXT NOT NULL REFERENCES sessions(id),ordinal INTEGER NOT NULL,turn TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS conversation_order ON entries(session,ordinal);
    CREATE TABLE IF NOT EXISTS work(id TEXT PRIMARY KEY,session TEXT NOT NULL,turn TEXT NOT NULL,ordinal INTEGER NOT NULL,native TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS work_order ON work(turn,ordinal);
    CREATE UNIQUE INDEX IF NOT EXISTS work_native ON work(turn,native);
    CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY,session TEXT NOT NULL,turn TEXT NOT NULL,work TEXT NOT NULL,ordinal INTEGER NOT NULL,native TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS action_order ON actions(work,ordinal);
    CREATE UNIQUE INDEX IF NOT EXISTS action_native ON actions(turn,native);
    CREATE TABLE IF NOT EXISTS contents(id TEXT PRIMARY KEY,session TEXT NOT NULL,bytes INTEGER NOT NULL,preview TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chunks(content TEXT NOT NULL,offset INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(content,offset));
    CREATE TABLE IF NOT EXISTS content_revisions(content TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(content,bytes));
    CREATE TABLE IF NOT EXISTS text_keys(turn TEXT NOT NULL,native TEXT NOT NULL,channel TEXT NOT NULL,content TEXT NOT NULL,entry TEXT,PRIMARY KEY(turn,native,channel));
    CREATE TABLE IF NOT EXISTS interactions(id TEXT PRIMARY KEY,session TEXT NOT NULL,turn TEXT NOT NULL,ordinal INTEGER NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS pending_interactions ON interactions(session,state,ordinal);
    CREATE TABLE IF NOT EXISTS requests(actor TEXT NOT NULL,command TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,command,scope,id));
    CREATE TABLE IF NOT EXISTS facts(invocation TEXT NOT NULL,seq INTEGER NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(invocation,seq));
    CREATE TABLE IF NOT EXISTS usage_samples(invocation TEXT NOT NULL,sample TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(invocation,sample));
    CREATE TABLE IF NOT EXISTS usage_basis(invocation TEXT NOT NULL,basis TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(invocation,basis));
    CREATE TABLE IF NOT EXISTS usage_session(session TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(session TEXT NOT NULL,seq INTEGER NOT NULL,at INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session,seq));
    CREATE INDEX IF NOT EXISTS events_age ON events(session,at);
    PRAGMA user_version=1;
  `);
  let epoch = 0;
  const now = () => new Date().toISOString();
  function transaction<T>(fn: () => T, acquiring = false): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!acquiring) {
        const owner = get('SELECT * FROM owner WHERE id=1');
        if (owner?.runtime !== options.runtimeId || Number(owner.epoch) !== epoch)
          fail('SESSION_STORE_BUSY', 'Session store ownership was lost.');
      }
      const result = fn();
      db.exec('COMMIT');
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
  function body(sid: string, text: string, existing?: string): ContentRef {
    const id = existing ?? randomUUID();
    const old = existing
      ? get('SELECT * FROM contents WHERE id=? AND session=?', id, sid)
      : undefined;
    if (existing && !old) fail('SESSION_RESOURCE_NOT_FOUND', 'Text content not found.');
    const offset = Number(old?.bytes ?? 0);
    const bytes = Buffer.from(text, 'utf8');
    if (!existing) run('INSERT INTO contents VALUES(?,?,0,?)', id, sid, '');
    let position = 0;
    while (position < bytes.length) {
      const piece = prefix(bytes.subarray(position), 16384);
      const chunk = Buffer.from(piece, 'utf8');
      run('INSERT INTO chunks VALUES(?,?,?)', id, offset + position, chunk);
      position += chunk.length;
    }
    const previous = String(old?.preview ?? '');
    const preview = prefix(Buffer.from(previous + text.slice(0, 2048)), 2048);
    run('UPDATE contents SET bytes=?,preview=? WHERE id=?', offset + bytes.length, preview, id);
    run('INSERT OR IGNORE INTO content_revisions VALUES(?,?)', id, offset + bytes.length);
    return {
      contentId: id,
      revision: String(offset + bytes.length),
      byteLength: offset + bytes.length,
    };
  }
  function preview(ref: ContentRef): TextPreview {
    const row = get('SELECT preview FROM contents WHERE id=?', ref.contentId)!;
    return { text: String(row.preview), complete: ref.byteLength <= 2048, content: ref };
  }
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
  function request(
    actor: string,
    command: string,
    scope: string,
    id: string,
    input: unknown,
  ): unknown {
    const row = get(
      'SELECT * FROM requests WHERE actor=? AND command=? AND scope=? AND id=?',
      actor,
      command,
      scope,
      id,
    );
    if (!row) return undefined;
    const hash = createHash('sha256').update(stable(input)).digest('hex');
    if (row.hash !== hash)
      fail('IDEMPOTENCY_CONFLICT', 'Request ID has already been used with different input.');
    return JSON.parse(String(row.result)) as unknown;
  }
  function remember(
    actor: string,
    command: string,
    scope: string,
    id: string,
    input: unknown,
    result: unknown,
  ): void {
    run(
      'INSERT INTO requests VALUES(?,?,?,?,?,?)',
      actor,
      command,
      scope,
      id,
      createHash('sha256').update(stable(input)).digest('hex'),
      JSON.stringify(result),
    );
  }
  function cursor(
    sid: string,
    actor: string,
    collection: string,
    upper: number,
    parent = '',
  ): string {
    const data = Buffer.from(
      JSON.stringify({
        generation,
        project: options.projectId,
        sid,
        actor,
        collection,
        upper,
        parent,
        expires: Date.now() + 86400000,
      }),
    ).toString('base64url');
    return data + '.' + createHmac('sha256', cursorKey).update(data).digest('base64url');
  }
  function boundary(
    token: string,
    sid: string,
    actor: string,
    collection: string,
    parent = '',
  ): number {
    try {
      const [data, signature, ...rest] = token.split('.');
      if (!data || !signature || rest.length) throw new Error();
      const expected = createHmac('sha256', cursorKey).update(data).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error();
      const value = JSON.parse(Buffer.from(data, 'base64url').toString()) as {
        generation: string;
        project: string;
        sid: string;
        actor: string;
        collection: string;
        upper: number;
        parent: string;
        expires: number;
      };
      if (
        value.generation !== generation ||
        value.project !== options.projectId ||
        value.sid !== sid ||
        value.actor !== actor ||
        value.collection !== collection ||
        value.parent !== parent ||
        !Number.isSafeInteger(value.upper)
      )
        throw new Error();
      if (value.expires < Date.now())
        fail('SESSION_CURSOR_EXPIRED', 'History cursor expired. Open the current Session again.');
      return value.upper;
    } catch (error) {
      if (error instanceof StoreFault) throw error;
      return fail('SESSION_CURSOR_INVALID', 'Invalid history cursor.');
    }
  }
  function history<Envelope extends object>(
    sid: string,
    actor: string,
    upper: number,
    limit: number,
    envelope: Envelope,
  ) {
    const rows = all(
      'SELECT data FROM entries WHERE session=? AND ordinal<? ORDER BY ordinal DESC LIMIT ?',
      sid,
      upper,
      limit + 1,
    );
    const hasOlder = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((r) => decode<ConversationEntry>(r))
      .reverse();
    return boundedPage(items, hasOlder, (entries, older) => ({
      ...envelope,
      entries,
      history: {
        hasOlder: older,
        ...(older ? { before: cursor(sid, actor, 'conversation', entries[0]!.ordinal) } : {}),
      },
    }));
  }
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
      "UPDATE interactions SET state='expired' WHERE turn=? AND state='pending'",
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
  function applyFact(c: Extract<StoreCommand, { op: 'fact' }>): boolean {
    const s = session(c.sessionId),
      t = turn(c.turnId, c.sessionId);
    if (t.summary.state === 'terminal' || t.invocationId !== c.invocationId) return false;
    const hash = createHash('sha256').update(stable(c.fact)).digest('hex');
    const old = get(
      'SELECT hash FROM facts WHERE invocation=? AND seq=?',
      c.invocationId,
      c.driverSeq,
    );
    if (old) {
      if (old.hash !== hash) fail('SESSION_INPUT_INVALID', 'Driver sequence changed its payload.');
      return false;
    }
    const latest = get(
      'SELECT seq FROM facts WHERE invocation=? ORDER BY seq DESC LIMIT 1',
      c.invocationId,
    );
    if (c.driverSeq !== Number(latest?.seq ?? 0) + 1)
      fail('SESSION_INPUT_INVALID', 'Driver sequence is out of order.');
    run('INSERT INTO facts VALUES(?,?,?)', c.invocationId, c.driverSeq, hash);
    const f: DriverFact = c.fact;
    if (f.kind === 'outcome') {
      settle(s, t, f.outcome, f.error);
      return true;
    }
    if (f.kind === 'lost') {
      t.summary.state = 'unknown';
      t.summary.error = { code: 'OPERATION_UNKNOWN', message: f.message };
      run("UPDATE interactions SET state='expired' WHERE turn=? AND state='pending'", c.turnId);
    }
    if (f.kind === 'correlation') {
      const context = get('SELECT native FROM provider_contexts WHERE session=?', c.sessionId);
      if (context && context.native !== f.providerSessionId)
        fail('SESSION_RECOVERY_REQUIRED', 'Provider context differs from its durable admission.');
      const native = s.snapshot.session.providerId + '\u0000' + f.providerSessionId;
      const existing = get('SELECT native FROM sessions WHERE id=?', c.sessionId)?.native;
      if (existing && existing !== native)
        fail('SESSION_RECOVERY_REQUIRED', 'Provider context cannot be rebound.');
      run('UPDATE sessions SET native=? WHERE id=?', native, c.sessionId);
      if (context) run('UPDATE provider_contexts SET confirmed=1 WHERE session=?', c.sessionId);
    }
    if (f.kind === 'interaction-expired') {
      const row = get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key);
      if (row) {
        const work = decode<WorkSummary>(row);
        if (work.kind !== 'interaction')
          fail('SESSION_INPUT_INVALID', 'Expected interaction Work.');
        run(
          "UPDATE interactions SET state='expired' WHERE turn=? AND state='pending' AND json_extract(data,'$.workId')=?",
          c.turnId,
          work.workId,
        );
        const next = transitionWork(work, 'expired', now());
        run('UPDATE work SET data=? WHERE id=?', JSON.stringify(next), work.workId);
        emit(s, 'work', { turnId: c.turnId, items: [next] });
      }
    }
    if (f.kind === 'work-open') {
      if (get('SELECT id FROM work WHERE turn=? AND native=?', c.turnId, f.key))
        fail('SESSION_INPUT_INVALID', 'Work key already exists.');
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
      if (f.workKind === 'tool') entry(s, c.turnId, 'work-summary', w.title, w.workId);
    }
    if (f.kind === 'work-update') {
      const oldWork = decode<WorkSummary>(
        get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.key),
      );
      const w = transitionWork(oldWork, f.state, now());
      if (
        s.snapshot.currentActivity?.workId === w.workId &&
        !['queued', 'active', 'waiting'].includes(w.state)
      )
        delete s.snapshot.currentActivity;
      run('UPDATE work SET data=? WHERE id=?', JSON.stringify(w), w.workId);
      emit(s, 'work', { turnId: c.turnId, items: [w] });
    }
    if (f.kind === 'action-open') {
      const w = decode<WorkSummary>(
        get('SELECT data FROM work WHERE turn=? AND native=?', c.turnId, f.parentKey),
      );
      if (w.kind !== 'tool' || !['queued', 'active', 'waiting'].includes(w.state))
        fail('SESSION_INPUT_INVALID', 'ToolAction requires live tool Work.');
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
    if (f.kind === 'progress')
      s.snapshot.currentActivity = { turnId: c.turnId, kind: f.activity, label: f.label };
    if (f.kind === 'usage') {
      const hash = createHash('sha256')
        .update(stable({ basis: f.basis, counters: f.counters }))
        .digest('hex');
      const existing = get(
        'SELECT hash FROM usage_samples WHERE invocation=? AND sample=?',
        c.invocationId,
        f.sampleId,
      );
      if (existing && existing.hash !== hash)
        fail('SESSION_INPUT_INVALID', 'Usage sample changed its meaning.');
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
          if (value === undefined || !Number.isSafeInteger(value) || value < 0)
            fail('SESSION_INPUT_INVALID', 'Invalid usage counter.');
          if (f.basis === 'turn-total') aggregate[key] = value;
          else if (f.basis === 'delta') aggregate[key] = (aggregate[key] ?? 0) + value;
          else {
            if (previous[key] !== undefined && value >= previous[key])
              aggregate[key] = (aggregate[key] ?? 0) + value - previous[key];
            previous[key] = value;
          }
          if (aggregate[key] !== undefined && !Number.isSafeInteger(aggregate[key]))
            fail('SESSION_INPUT_INVALID', 'Usage counter overflow.');
        }
        run(
          'INSERT OR REPLACE INTO usage_basis VALUES(?,?,?)',
          c.invocationId,
          f.basis,
          JSON.stringify(aggregate),
        );
        if (f.basis === 'session-cumulative')
          run(
            'INSERT OR REPLACE INTO usage_session VALUES(?,?)',
            c.sessionId,
            JSON.stringify(previous),
          );
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
      }
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
        if (!['queued', 'active', 'waiting'].includes(w.state))
          fail('SESSION_INPUT_INVALID', 'Cannot append text to settled Work.');
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
        if (f.channel === 'answer') t.summary.finalAnswer = preview(ref);
      }
      if (f.channel === 'tool-input' || f.channel === 'tool-output') {
        const row = get('SELECT * FROM actions WHERE turn=? AND native=?', c.turnId, f.key);
        if (row) {
          const action = decode<ToolActionSummary>(row);
          if (!['queued', 'active', 'waiting'].includes(action.state))
            fail('SESSION_INPUT_INVALID', 'Cannot append output to settled ToolAction.');
          if (f.channel === 'tool-input') action.input = ref;
          else action.output = ref;
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
      if (count >= 32) fail('SESSION_PAYLOAD_TOO_LARGE', 'Too many pending interactions.');
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
  // Only active records are reconciled; settled conversation/content is not read at boot.
  transaction(() => {
    for (const row of all("SELECT session,data FROM turns WHERE state!='terminal'")) {
      const t = decode<StoredTurn>(row),
        s = session(String(row.session));
      if (s.snapshot.session.providerId === 'mock')
        settle(s, t, 'interrupted', {
          code: 'INTERRUPTED',
          message: 'Interrupted by Runtime restart.',
        });
      else {
        run(
          "UPDATE interactions SET state='expired' WHERE turn=? AND state='pending'",
          t.summary.turnId,
        );
        t.summary.state = 'unknown';
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
        run("UPDATE interactions SET state='answered' WHERE id=?", c.interactionId);
        const w = decode<WorkSummary>(get('SELECT data FROM work WHERE id=?', i.workId));
        w.state = 'completed';
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
    if (c.op === 'snapshot') {
      const s = session(c.sessionId);
      return {
        snapshot: history(c.sessionId, c.actor, Number.MAX_SAFE_INTEGER, 40, s.snapshot),
      };
    }
    if (c.op === 'history') {
      const s = session(c.sessionId);
      return history(
        c.sessionId,
        c.actor,
        boundary(c.before, c.sessionId, c.actor, 'conversation'),
        c.limit,
        { sessionId: c.sessionId, eventSeq: s.snapshot.eventSeq },
      );
    }
    if (c.op === 'work' || c.op === 'actions') {
      const s = session(c.sessionId),
        isWork = c.op === 'work',
        parent = isWork ? c.turnId : c.workId;
      const upper = c.before
        ? boundary(c.before, c.sessionId, c.actor, c.op, parent)
        : Number.MAX_SAFE_INTEGER;
      if (isWork) turn(parent, c.sessionId);
      else if (!get('SELECT id FROM work WHERE id=? AND session=?', parent, c.sessionId))
        fail('SESSION_RESOURCE_NOT_FOUND', 'Work not found.');
      const rows = isWork
        ? all(
            'SELECT data FROM work WHERE session=? AND turn=? AND ordinal<? ORDER BY ordinal DESC LIMIT ?',
            c.sessionId,
            parent,
            upper,
            c.limit + 1,
          )
        : all(
            'SELECT data FROM actions WHERE session=? AND work=? AND ordinal<? ORDER BY ordinal DESC LIMIT ?',
            c.sessionId,
            parent,
            upper,
            c.limit + 1,
          );
      const items = rows
          .slice(0, c.limit)
          .map((r) => decode<{ ordinal: number }>(r))
          .reverse(),
        hasOlder = rows.length > c.limit;
      const envelope = {
        sessionId: c.sessionId,
        eventSeq: s.snapshot.eventSeq,
        ...(isWork ? { turn: turn(parent, c.sessionId).summary } : { workId: parent }),
      };
      return boundedPage(items, hasOlder, (pageItems, older) => ({
        ...envelope,
        items: pageItems,
        history: {
          hasOlder: older,
          ...(older
            ? { before: cursor(c.sessionId, c.actor, c.op, pageItems[0]!.ordinal, parent) }
            : {}),
        },
      }));
    }
    if (c.op === 'content') {
      session(c.sessionId);
      const meta = get(
        'SELECT bytes FROM contents WHERE id=? AND session=?',
        c.contentId,
        c.sessionId,
      );
      if (!meta) fail('SESSION_RESOURCE_NOT_FOUND', 'Content not found.');
      const length = Number(c.revision);
      if (
        !/^\d+$/.test(c.revision) ||
        !Number.isSafeInteger(length) ||
        length > Number(meta.bytes) ||
        !get('SELECT bytes FROM content_revisions WHERE content=? AND bytes=?', c.contentId, length)
      )
        fail('CONTENT_REVISION_UNAVAILABLE', 'Content revision unavailable.');
      if (!Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset > length)
        fail('SESSION_INPUT_INVALID', 'Offset is outside content.');
      const end = Math.min(length, c.offset + c.limitBytes);
      const rows = all(
        'SELECT offset,data FROM chunks WHERE content=? AND offset>=COALESCE((SELECT offset FROM chunks WHERE content=? AND offset<=? ORDER BY offset DESC LIMIT 1),0) AND offset<? ORDER BY offset',
        c.contentId,
        c.contentId,
        c.offset,
        end,
      );
      const pieces = rows.map((r) => {
        const at = Number(r.offset),
          b = Buffer.from(r.data as Uint8Array);
        return b.subarray(Math.max(0, c.offset - at), Math.min(b.length, end - at));
      });
      const bytes = Buffer.concat(pieces);
      if (bytes.length && (bytes[0]! & 0xc0) === 0x80)
        fail('SESSION_INPUT_INVALID', 'Offset must be a UTF-8 boundary.');
      const text = prefix(bytes, bytes.length),
        next = c.offset + Buffer.byteLength(text);
      return {
        contentId: c.contentId,
        revision: c.revision,
        offset: c.offset,
        text,
        complete: next === length,
        ...(next < length ? { nextOffset: next } : {}),
      };
    }
    if (c.op === 'events') {
      const cutoff = Date.now() - 86400000;
      const s = session(c.sessionId),
        oldest = Number(
          get(
            'SELECT seq FROM events WHERE session=? AND at>=? ORDER BY seq LIMIT 1',
            c.sessionId,
            cutoff,
          )?.seq ?? s.snapshot.eventSeq + 1,
        );
      return {
        latest: s.snapshot.eventSeq,
        oldest,
        events: all(
          'SELECT data FROM events WHERE session=? AND seq>? AND at>=? ORDER BY seq LIMIT 3',
          c.sessionId,
          c.after,
          cutoff,
        ).map((r) => decode<SessionChange>(r)),
      };
    }
    return fail('SESSION_INPUT_INVALID', 'Unknown store command.');
  }
  port.on('message', (message: WorkerRequest) => {
    readRows = 0;
    contentBytes = 0;
    try {
      const result = execute(message.command);
      port.postMessage({ id: message.id, result, metrics: { rows: readRows, contentBytes } });
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
