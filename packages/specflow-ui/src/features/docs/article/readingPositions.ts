import { useMemo } from 'react';
import type { ArticleScrollMemory } from './DocsArticleView';

/** How many history entries keep a reading position; the oldest is forgotten first. */
const limit = 200;

/**
 * The reading position of every article shown in this tab, by history entry: Back and Forward
 * remount an article (another route on split layouts, another stack screen on Narrow), and it
 * returns where it was read, also after leaving the reader and coming back. A new push is a new
 * entry and starts at its section or the top. Only numbers are kept, for the latest entries.
 */
const positions = new Map<string, number>();

function remember(entry: string, top: number) {
  // Re-inserted, so the order is the order of the latest reading.
  positions.delete(entry);
  positions.set(entry, top);
  if (positions.size > limit) {
    const oldest = positions.keys().next().value;
    if (oldest !== undefined) {
      positions.delete(oldest);
    }
  }
}

/** The reading position of the article shown for one history entry. */
export function useReadingPosition(entry: string): ArticleScrollMemory {
  return useMemo(
    () => ({ get: () => positions.get(entry), set: (top: number) => remember(entry, top) }),
    [entry],
  );
}
