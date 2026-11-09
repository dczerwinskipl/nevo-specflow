import type { DatabaseSync } from 'node:sqlite';
import { fail } from './encoding';
import type { StoreDatabase } from './database';
import type { StoredSession } from './protocol';

/** Meta key of the monotonic Session creation counter; `sessions.created_seq` is never rewritten. */
export const CREATED_SEQ_KEY = 'created-seq';
const LIST_COLUMNS = [
  'created_seq INTEGER',
  'archived_at TEXT',
  'readiness TEXT',
  'updated_at TEXT',
];

export function initializeSessionSchema(db: DatabaseSync, get: StoreDatabase['get']): void {
  const version = Number(get('PRAGMA user_version')?.user_version ?? 0);
  if (version !== 0 && version !== 1 && version !== 2 && version !== 3) {
    return fail('SESSION_STORE_UNAVAILABLE', 'Unsupported Session schema.');
  }

  if (
    version === 0 &&
    get("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
  ) {
    return fail('SESSION_STORE_UNAVAILABLE', 'Unrecognized Session database.');
  }

  // DDL, backfill and the version marker advance together. Interrupted upgrades may be
  // retried without presenting a partially initialized v3 database as complete.
  db.exec('BEGIN IMMEDIATE');
  try {
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
    CREATE TABLE IF NOT EXISTS telemetry_sessions(session TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS telemetry_pending_refresh ON telemetry_sessions(session) WHERE json_extract(data,'$.refresh.state')!='idle';
    CREATE TABLE IF NOT EXISTS telemetry_turns(turn TEXT PRIMARY KEY,session TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS telemetry_samples(invocation TEXT NOT NULL,metric TEXT NOT NULL,sample TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(invocation,metric,sample));
    CREATE TABLE IF NOT EXISTS telemetry_baselines(session TEXT NOT NULL,metric TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session,metric));
    CREATE TABLE IF NOT EXISTS telemetry_refresh_requests(session TEXT NOT NULL,actor TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,at INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session,actor,id));
    CREATE INDEX IF NOT EXISTS telemetry_refresh_age ON telemetry_refresh_requests(at);
    CREATE TABLE IF NOT EXISTS telemetry_publications(session TEXT PRIMARY KEY,due INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS telemetry_publications_due ON telemetry_publications(due,session);
    INSERT OR IGNORE INTO meta VALUES('telemetry-migration-cursor','0');
    CREATE TABLE IF NOT EXISTS session_associations(session TEXT PRIMARY KEY REFERENCES sessions(id),spec TEXT NOT NULL,created_seq INTEGER NOT NULL,origin TEXT NOT NULL CHECK(origin IN ('user','workflow')),actor TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS session_associations_spec ON session_associations(spec,created_seq);
    CREATE TABLE IF NOT EXISTS session_association_tasks(session TEXT NOT NULL REFERENCES session_associations(session),task TEXT NOT NULL,origin TEXT NOT NULL CHECK(origin IN ('user','workflow')),added INTEGER NOT NULL,PRIMARY KEY(session,task));
    CREATE INDEX IF NOT EXISTS session_association_tasks_task ON session_association_tasks(task,session);
  `);
    // Re-read under the write lock: a concurrent opener may have completed the upgrade meanwhile.
    if (Number(get('PRAGMA user_version')?.user_version ?? 0) < 3) {
      addListProjection(db);
    }

    db.exec('PRAGMA user_version=3');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');

    throw error;
  }
}

/**
 * Schema v3: indexed list projection columns, maintained by `saveSession` with `data`, and backfilled
 * once by decoding each existing snapshot (`created_seq` in `createdAt` order, ties by rowid). Runs
 * inside the initialization transaction.
 */
function addListProjection(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name),
  );
  for (const column of LIST_COLUMNS) {
    if (!existing.has(column.split(' ')[0]!)) {
      db.exec(`ALTER TABLE sessions ADD COLUMN ${column}`);
    }
  }

  const rows = (
    db.prepare('SELECT rowid,data FROM sessions').all() as { rowid: number; data: string }[]
  )
    .map((row) => ({
      rowid: row.rowid,
      session: (JSON.parse(row.data) as StoredSession).snapshot.session,
    }))
    .sort((a, b) =>
      a.session.createdAt < b.session.createdAt
        ? -1
        : a.session.createdAt > b.session.createdAt
          ? 1
          : a.rowid - b.rowid,
    );
  const update = db.prepare(
    'UPDATE sessions SET created_seq=?,archived_at=?,readiness=?,updated_at=? WHERE rowid=?',
  );
  rows.forEach((row, index) =>
    update.run(
      index + 1,
      row.session.archivedAt ?? null,
      row.session.readiness ?? null,
      row.session.updatedAt ?? null,
      row.rowid,
    ),
  );
  db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(CREATED_SEQ_KEY, String(rows.length));
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_created ON sessions(project,created_seq);
    CREATE INDEX IF NOT EXISTS sessions_archived ON sessions(project,archived_at,created_seq);
  `);
}
