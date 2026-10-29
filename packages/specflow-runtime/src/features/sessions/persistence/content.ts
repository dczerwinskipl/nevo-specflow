import { randomUUID } from 'node:crypto';
import type { ContentRef, TextPreview } from '@nevo/specflow-contracts/sessions';
import type { StoreCommand } from './protocol';
import type { StoreDatabase } from './database';
import { fail, prefix } from './encoding';

export function createContentStorage({ get, all, run }: StoreDatabase) {
  function body(sid: string, text: string, existing?: string): ContentRef {
    const id = existing ?? randomUUID();
    const old = existing
      ? get('SELECT * FROM contents WHERE id=? AND session=?', id, sid)
      : undefined;
    if (existing && !old) {
      fail('SESSION_RESOURCE_NOT_FOUND', 'Text content not found.');
    }

    const offset = Number(old?.bytes ?? 0);
    const bytes = Buffer.from(text, 'utf8');
    if (!existing) {
      run('INSERT INTO contents VALUES(?,?,0,?)', id, sid, '');
    }

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

  function read(c: Extract<StoreCommand, { op: 'content' }>) {
    const meta = get(
      'SELECT bytes FROM contents WHERE id=? AND session=?',
      c.contentId,
      c.sessionId,
    );
    if (!meta) {
      fail('SESSION_RESOURCE_NOT_FOUND', 'Content not found.');
    }

    const length = Number(c.revision);
    if (
      !/^\d+$/.test(c.revision) ||
      !Number.isSafeInteger(length) ||
      length > Number(meta.bytes) ||
      !get('SELECT bytes FROM content_revisions WHERE content=? AND bytes=?', c.contentId, length)
    ) {
      fail('CONTENT_REVISION_UNAVAILABLE', 'Content revision unavailable.');
    }

    if (!Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset > length) {
      fail('SESSION_INPUT_INVALID', 'Offset is outside content.');
    }

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
    if (bytes.length && (bytes[0]! & 0xc0) === 0x80) {
      fail('SESSION_INPUT_INVALID', 'Offset must be a UTF-8 boundary.');
    }

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

  return { body, preview, read };
}
