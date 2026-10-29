import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openSessionStore, type SessionStore } from '../../src/features/sessions/persistence/store';
import type {
  SnapshotSource,
  StoredSession,
} from '../../src/features/sessions/persistence/protocol';

it.each([1, 64])(
  'opens a %i MiB single-Turn history at its tail without reading content chunks',
  async (historyMiB) => {
    const directory = await mkdtemp(join(tmpdir(), 'nevo-session-tail-'));
    let store: SessionStore | undefined;
    try {
      store = await openSessionStore({ directory, projectId: 'project' });
      const { sessionId } = await store.call<{ sessionId: string }>({
        op: 'create',
        actor: 'actor',
        input: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
      });
      await store.call({
        op: 'start',
        actor: 'actor',
        sessionId,
        input: { requestId: randomUUID(), message: 'seed' },
      });
      const original = (
        await store.call<SnapshotSource>({ op: 'snapshot', sessionId, actor: 'actor' })
      ).snapshot;
      const contentId = original.entries[0]!.text.content!.contentId;
      await store.close();
      store = undefined;
      // Seed storage through a controlled offline fixture, never by changing production read behavior.
      const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
      const bytes = historyMiB * 1024 * 1024,
        chunk = Buffer.alloc(16384, 120);
      db.exec('BEGIN');
      db.prepare('DELETE FROM chunks WHERE content=?').run(contentId);
      const insert = db.prepare('INSERT INTO chunks VALUES(?,?,?)');
      for (let offset = 0; offset < bytes; offset += chunk.length) {
        insert.run(contentId, offset, chunk);
      }

      db.prepare('UPDATE contents SET bytes=?,preview=? WHERE id=?').run(
        bytes,
        'x'.repeat(2048),
        contentId,
      );
      db.prepare('INSERT INTO content_revisions VALUES(?,?)').run(contentId, bytes);
      const entry = original.entries[0]!;
      entry.text = {
        text: 'x'.repeat(2048),
        complete: false,
        content: { contentId, revision: String(bytes), byteLength: bytes },
      };
      db.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(entry), entry.id);
      // The identical forty-entry tail sits behind ten thousand indexed conversation rows.
      const insertEntry = db.prepare('INSERT INTO entries VALUES(?,?,?,?,?)');
      for (let ordinal = 2; ordinal <= 10000; ordinal++) {
        const row = {
          ...entry,
          id: randomUUID(),
          ordinal,
          text: ordinal === 10000 ? entry.text : { text: 'A bounded tail preview', complete: true },
        };
        insertEntry.run(row.id, sessionId, ordinal, row.turnId, JSON.stringify(row));
      }

      const stored = JSON.parse(
        (db.prepare('SELECT data FROM sessions WHERE id=?').get(sessionId) as { data: string })
          .data,
      ) as StoredSession;
      stored.ordinal = 10000;
      db.prepare('UPDATE sessions SET ordinal=?,data=? WHERE id=?').run(
        stored.ordinal,
        JSON.stringify(stored),
        sessionId,
      );
      db.exec('COMMIT');
      const plan = db
        .prepare(
          'EXPLAIN QUERY PLAN SELECT data FROM entries WHERE session=? AND ordinal<? ORDER BY ordinal DESC LIMIT ?',
        )
        .all(sessionId, Number.MAX_SAFE_INTEGER, 41);
      expect(JSON.stringify(plan)).toContain('conversation_order');
      db.close();
      const coldStart = performance.now();
      store = await openSessionStore({ directory, projectId: 'project' });
      const cold = (await store.call<SnapshotSource>({ op: 'snapshot', sessionId, actor: 'actor' }))
        .snapshot;
      const coldMs = performance.now() - coldStart;
      expect(Buffer.byteLength(JSON.stringify(cold))).toBeLessThan(256 * 1024);
      expect(store.readMetrics().contentBytes).toBe(0);
      expect(store.readMetrics().rows).toBeLessThanOrEqual(42);
      const timings: number[] = [];
      let peakRss = process.memoryUsage().rss;
      for (let n = 0; n < 30; n++) {
        const start = performance.now();
        await store.call({ op: 'snapshot', sessionId, actor: 'actor' });
        timings.push(performance.now() - start);
        expect(store.readMetrics().contentBytes).toBe(0);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }

      timings.sort((a, b) => a - b);
      console.info(
        'Session tail benchmark',
        JSON.stringify({
          historyMiB,
          conversationRows: 10000,
          coldMs: Math.round(coldMs),
          warmP95Ms: Number(timings[28]!.toFixed(3)),
          responseBytes: Buffer.byteLength(JSON.stringify(cold)),
          rows: store.readMetrics().rows,
          contentBytes: store.readMetrics().contentBytes,
          peakRssMiB: Math.round(peakRss / 1024 / 1024),
        }),
      );
    } finally {
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
