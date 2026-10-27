import type { ConversationEntry, SessionChange } from '@nevo/specflow-contracts/sessions';
import type { StoreCommand, StoredSession, StoredTurn } from './protocol';
import type { StoreDatabase } from './database';
import type { createSessionCursors } from './cursors';
import type { createContentStorage } from './content';
import { boundedPage, decode, fail } from './encoding';

interface ReadDependencies extends StoreDatabase {
  session(this: void, id: string): StoredSession;
  turn(this: void, id: string, sessionId: string): StoredTurn;
  cursors: ReturnType<typeof createSessionCursors>;
  content: ReturnType<typeof createContentStorage>;
}
export function createSessionReads({
  get,
  all,
  session,
  turn,
  cursors,
  content,
}: ReadDependencies) {
  const { cursor, boundary } = cursors;
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
  function execute(c: StoreCommand): unknown {
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
      return content.read(c);
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
  return { execute };
}
