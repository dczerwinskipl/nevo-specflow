import type { SessionChange } from '@nevo/specflow-contracts/sessions';
import type { StoreDatabase } from './database';
import type { StoredSession, StoreCommand, SessionView } from './protocol';
import { StoreFault, fail } from './encoding';
import type { createRequestJournal } from './requests';

const invocations = "SELECT json_extract(data,'$.invocationId') FROM turns WHERE session=?1";

/**
 * Every Session store table, classified for Session delete. A string is the Session-owned row
 * filter (`?1` binds the Session ID); `null` marks store-global rows. Entries run in this order,
 * so rows found through a parent (contents, turns) are deleted before that parent.
 */
export const SESSION_TABLE_OWNERSHIP: Readonly<Record<string, string | null>> = {
  meta: null,
  owner: null,
  chunks: 'content IN (SELECT id FROM contents WHERE session=?1)',
  content_revisions: 'content IN (SELECT id FROM contents WHERE session=?1)',
  text_keys: 'turn IN (SELECT id FROM turns WHERE session=?1)',
  facts: `invocation IN (${invocations})`,
  usage_samples: `invocation IN (${invocations})`,
  usage_basis: `invocation IN (${invocations})`,
  telemetry_samples: `invocation IN (${invocations})`,
  // Commands are scoped by Session ID, or Session ID plus a child ID; create is project-scoped
  // and identifies the Session only through its accepted result.
  requests:
    "scope=?1 OR substr(scope,1,length(?1)+1)=?1||':' OR (command='create' AND json_extract(result,'$.sessionId')=?1)",
  telemetry_refresh_requests: 'session=?1',
  telemetry_publications: 'session=?1',
  telemetry_baselines: 'session=?1',
  telemetry_turns: 'session=?1',
  telemetry_sessions: 'session=?1',
  usage_session: 'session=?1',
  events: 'session=?1',
  interactions: 'session=?1',
  actions: 'session=?1',
  work: 'session=?1',
  contents: 'session=?1',
  entries: 'session=?1',
  turns: 'session=?1',
  provider_contexts: 'session=?1',
  sessions: 'id=?1',
};

type Management = Extract<StoreCommand, { op: 'rename' | 'archive' | 'unarchive' | 'delete' }>;
interface Dependencies extends StoreDatabase, ReturnType<typeof createRequestJournal> {
  now(this: void): string;
  session(this: void, id: string): StoredSession;
  emit(this: void, s: StoredSession, kind: SessionChange['kind'], changes: unknown): void;
  /** Wakes the Session's subscribers after commit without an outbox event. */
  changed(this: void, sessionId: string): void;
}

/** Rename, archive, unarchive and delete. Every call runs inside the caller's Worker transaction. */
export function createSessionManagement(db: Dependencies) {
  function nonterminal(sessionId: string, message: string): void {
    const active = db.get("SELECT id FROM turns WHERE session=? AND state!='terminal'", sessionId);
    if (active) {
      throw new StoreFault('TURN_CONFLICT', message, { turnId: String(active.id) });
    }
  }

  /** Unsettled Engine effect evidence has its own refusal; other unsettled Turns conflict. */
  function deletable(sessionId: string): void {
    const evidence = db.get(
      "SELECT id FROM turns WHERE session=? AND state!='terminal' AND json_extract(data,'$.effectBinding') IS NOT NULL",
      sessionId,
    );
    if (evidence) {
      throw new StoreFault(
        'SESSION_DELETE_BLOCKED',
        'Engine execution evidence of this Session is not settled.',
        { turnId: String(evidence.id) },
      );
    }

    nonterminal(sessionId, 'A Session with an unsettled Turn cannot be deleted.');
  }

  /** Archived Sessions are read-only: no new Turn and no interaction response. */
  function assertWritable(s: StoredSession): void {
    if (s.snapshot.session.archivedAt) {
      fail('SESSION_ARCHIVED', 'Archived Sessions are read-only.');
    }
  }

  function view(s: StoredSession): SessionView {
    return {
      session: s.snapshot.session,
      ...(s.snapshot.activeTurn ? { activeTurn: s.snapshot.activeTurn } : {}),
    };
  }

  function command(
    c: Extract<Management, { op: 'rename' | 'archive' | 'unarchive' }>,
    apply: (s: StoredSession) => boolean,
  ): SessionView {
    const cached = db.request(c.actor, c.op, c.sessionId, c.input.requestId, c.input);
    const s = db.session(c.sessionId);
    if (!cached) {
      if (apply(s)) {
        db.emit(s, 'session', { session: s.snapshot.session });
      }

      db.remember(c.actor, c.op, c.sessionId, c.input.requestId, c.input, {
        sessionId: c.sessionId,
      });
    }

    return view(s);
  }

  function remove(sessionId: string): null {
    db.session(sessionId);
    deletable(sessionId);
    for (const [table, owned] of Object.entries(SESSION_TABLE_OWNERSHIP)) {
      if (owned) {
        db.run(`DELETE FROM ${table} WHERE ${owned}`, sessionId);
      }
    }

    db.changed(sessionId);

    return null;
  }

  return {
    execute(c: Management): SessionView | null {
      if (c.op === 'delete') {
        return remove(c.sessionId);
      }

      if (c.op === 'rename') {
        return command(c, (s) => {
          // Rename is metadata and stays allowed on an archived Session (owner decision).
          const title = c.input.title.trim();
          if (!title || title.length > 256) {
            fail(
              'SESSION_INPUT_INVALID',
              'A nonblank title of at most 256 characters is required.',
            );
          }

          if (s.snapshot.session.title === title) {
            return false;
          }

          s.snapshot.session.title = title;

          return true;
        });
      }

      if (c.op === 'archive') {
        return command(c, (s) => {
          if (s.snapshot.session.archivedAt) {
            return false;
          }

          nonterminal(c.sessionId, 'Settle or cancel the current Turn before archiving.');
          s.snapshot.session.archivedAt = db.now();

          return true;
        });
      }

      return command(c, (s) => {
        if (!s.snapshot.session.archivedAt) {
          return false;
        }

        delete s.snapshot.session.archivedAt;

        return true;
      });
    },
    assertWritable,
  };
}
