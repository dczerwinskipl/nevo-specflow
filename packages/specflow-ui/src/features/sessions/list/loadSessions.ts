import type { SessionListItem } from '@nevo/specflow-contracts/sessions';
import type { SessionAssociationsApi } from '../associations/api';

/** Requests one load (the first load or one press of "Show more") makes at most. */
export const maxRequestsPerLoad = 4;

export type SessionCollection = 'current' | 'archive';

/** What one load of a Specification's Sessions list brought. */
export interface SessionListLoad {
  items: SessionListItem[];
  /** Where the next load continues; absent once the list read has scanned every Session. */
  nextCursor?: string;
}

/**
 * One load of the Specification Sessions list (session-association-ux §3): a page may hold fewer
 * rows than asked, or none, while a cursor remains, so the load follows `nextCursor` until at least
 * one row arrives or the cursor ends, at most {@link maxRequestsPerLoad} requests.
 */
export async function loadSessions(
  api: Pick<SessionAssociationsApi, 'list'>,
  specId: string,
  collection: SessionCollection,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<SessionListLoad> {
  const archived = collection === 'archive' ? 'only' : 'exclude';
  const items: SessionListItem[] = [];
  let next = cursor;
  let requests = 0;
  do {
    const page = await api.list({ specId, archived, ...(next ? { cursor: next } : {}) }, signal);
    requests += 1;
    items.push(...page.items);
    next = page.nextCursor;
  } while (items.length === 0 && next && requests < maxRequestsPerLoad);

  return { items, ...(next ? { nextCursor: next } : {}) };
}
