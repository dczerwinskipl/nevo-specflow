import { useState } from 'react';

/**
 * Create options are a snapshot of Git state that changes outside the UI. Whatever the query cache
 * still holds from an earlier visit is therefore never authoritative: only data fetched since this
 * screen was entered counts, so the workspace section shows its loading state (not stale tiles)
 * until the fresh answer arrives, and a submit never rests on options older than the visit.
 */
export function useVisitFreshOptions<T>(query: {
  data: T | undefined;
  dataUpdatedAt: number;
}): T | undefined {
  const [enteredAt] = useState(() => Date.now());
  return query.data !== undefined && query.dataUpdatedAt >= enteredAt ? query.data : undefined;
}
