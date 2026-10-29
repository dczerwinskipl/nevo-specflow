import type { DatabaseSync } from 'node:sqlite';
import { fail } from './encoding';
import type { StoreDatabase } from './database';

export function initializeSessionSchema(db: DatabaseSync, get: StoreDatabase['get']): void {
  const version = Number(get('PRAGMA user_version')?.user_version ?? 0);
  if (version !== 0 && version !== 1) {
    return fail('SESSION_STORE_UNAVAILABLE', 'Unsupported Session schema.');
  }

  if (
    version === 0 &&
    get("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
  ) {
    return fail('SESSION_STORE_UNAVAILABLE', 'Unrecognized Session database.');
  }

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
}
