import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCursors } from './cursors';

afterEach(() => {
  vi.useRealTimers();
});

const filter = { specId: 'S', archived: 'exclude' } as const;

describe('Session list cursors', () => {
  it('continue after the signed row of the same filter only', () => {
    const cursors = createSessionCursors('generation', 'project', randomBytes(32));
    const token = cursors.listCursor(filter, 42);
    expect(cursors.listBoundary(token, filter)).toBe(42);
    // Filter keys in another order are the same selection.
    expect(cursors.listBoundary(token, { archived: 'exclude', specId: 'S' })).toBe(42);
    expect(() => cursors.listBoundary(token, { ...filter, archived: 'include' })).toThrow(
      expect.objectContaining({ code: 'SESSION_CURSOR_INVALID' }),
    );
    expect(() =>
      createSessionCursors('other-generation', 'project', randomBytes(32)).listBoundary(
        token,
        filter,
      ),
    ).toThrow(expect.objectContaining({ code: 'SESSION_CURSOR_INVALID' }));
  });

  it('expire after a day', () => {
    vi.useFakeTimers();
    const cursors = createSessionCursors('generation', 'project', randomBytes(32));
    const token = cursors.listCursor(filter, 7);
    vi.advanceTimersByTime(86400001);
    expect(() => cursors.listBoundary(token, filter)).toThrow(
      expect.objectContaining({ code: 'SESSION_CURSOR_EXPIRED' }),
    );
  });

  it('never read a history token as a list cursor or the reverse', () => {
    const cursors = createSessionCursors('generation', 'project', randomBytes(32));
    const history = cursors.cursor('session', 'actor', 'history', 3);
    expect(cursors.boundary(history, 'session', 'actor', 'history')).toBe(3);
    expect(() => cursors.listBoundary(history, filter)).toThrow(
      expect.objectContaining({ code: 'SESSION_CURSOR_INVALID' }),
    );
    expect(() => cursors.boundary(cursors.listCursor(filter, 3), '', '', 'history')).toThrow(
      expect.objectContaining({ code: 'SESSION_CURSOR_INVALID' }),
    );
  });
});
