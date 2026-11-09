import { describe, expect, it, vi } from 'vitest';
import type { SessionListItem, SessionListPage } from '@nevo/specflow-contracts/sessions';
import type { SessionAssociationsApi } from '../associations/api';
import { loadSessions } from './loadSessions';

const row = (sessionId: string): SessionListItem => ({
  sessionId,
  providerId: 'claude',
  readiness: 'ready',
  createdAt: '2026-11-08T10:00:00Z',
  updatedAt: '2026-11-08T10:00:00Z',
  association: { kind: 'specification', specId: 'spec', taskIds: [] },
});

function api(...pages: SessionListPage[]) {
  const list = vi.fn<SessionAssociationsApi['list']>();
  for (const page of pages) {
    list.mockResolvedValueOnce(page);
  }

  return { list };
}

describe('loadSessions', () => {
  it('reads one page when it holds rows, mapping the collection to the archived filter', async () => {
    const source = api({ items: [row('a')], nextCursor: 'c1' });

    await expect(loadSessions(source, 'spec', 'archive', undefined)).resolves.toEqual({
      items: [row('a')],
      nextCursor: 'c1',
    });
    expect(source.list).toHaveBeenCalledWith({ specId: 'spec', archived: 'only' }, undefined);
  });

  it('follows the cursor past empty pages until a row arrives', async () => {
    const source = api({ items: [], nextCursor: 'c2' }, { items: [row('b')] });

    await expect(loadSessions(source, 'spec', 'current', 'c1')).resolves.toEqual({
      items: [row('b')],
    });
    expect(source.list.mock.calls.map(([query]) => query)).toEqual([
      { specId: 'spec', archived: 'exclude', cursor: 'c1' },
      { specId: 'spec', archived: 'exclude', cursor: 'c2' },
    ]);
  });

  it('stops after four requests without rows and keeps the cursor', async () => {
    const empty = (cursor: string) => ({ items: [], nextCursor: cursor });
    const source = api(empty('c1'), empty('c2'), empty('c3'), empty('c4'), empty('c5'));

    await expect(loadSessions(source, 'spec', 'current', undefined)).resolves.toEqual({
      items: [],
      nextCursor: 'c4',
    });
    expect(source.list).toHaveBeenCalledTimes(4);
  });

  it('ends when the cursor ends, even with no rows', async () => {
    const source = api({ items: [] });

    await expect(loadSessions(source, 'spec', 'current', undefined)).resolves.toEqual({
      items: [],
    });
    expect(source.list).toHaveBeenCalledOnce();
  });
});
