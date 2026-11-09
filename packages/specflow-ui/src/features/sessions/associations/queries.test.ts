import { describe, expect, it } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import type { SessionListLoad } from '../list/loadSessions';
import { invalidateSpecificationSessions, sessionAssociationKeys } from './queries';

const load = (sessionId: string, nextCursor?: string): SessionListLoad => ({
  items: [
    {
      sessionId,
      providerId: 'claude',
      readiness: 'ready',
      createdAt: '2026-11-08T10:00:00Z',
      updatedAt: '2026-11-08T10:00:00Z',
      association: { kind: 'specification', specId: 'spec', taskIds: [] },
    },
  ],
  ...(nextCursor ? { nextCursor } : {}),
});

describe('invalidateSpecificationSessions', () => {
  it('resets each collection of the list to its first page and marks the reads stale', async () => {
    const client = new QueryClient();
    const current = sessionAssociationKeys.list('spec', 'current');
    const archive = sessionAssociationKeys.list('spec', 'archive');
    const other = sessionAssociationKeys.list('other', 'current');
    const paged: InfiniteData<SessionListLoad, string | undefined> = {
      pages: [load('a', 'c1'), load('b', 'c2'), load('c')],
      pageParams: [undefined, 'c1', 'c2'],
    };
    client.setQueryData(current, paged);
    client.setQueryData(archive, { pages: [load('z')], pageParams: [undefined] });
    client.setQueryData(other, paged);

    await invalidateSpecificationSessions(client, 'spec');

    expect(client.getQueryData(current)).toEqual({
      pages: [load('a', 'c1')],
      pageParams: [undefined],
    });
    expect(client.getQueryData(archive)).toEqual({ pages: [load('z')], pageParams: [undefined] });
    expect(client.getQueryState(current)?.isInvalidated).toBe(true);
    // Another Specification's list keeps what it appended.
    expect(client.getQueryData<typeof paged>(other)?.pages).toHaveLength(3);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
