import { useMemo } from 'react';
import type { ArticleScrollMemory } from './DocsArticleView';

/** How many history entries keep a position; the oldest is forgotten first. */
const limit = 200;

/**
 * Scroll positions by history entry, for this browser tab: Back and Forward return to the
 * position of their entry, also after leaving the reader and coming back. Only numbers are kept,
 * for the latest entries.
 */
export function createEntryPositions() {
  const positions = new Map<string, number>();

  return {
    get: (entry: string) => positions.get(entry),
    set(entry: string, top: number) {
      // Re-inserted, so the order is the order of the latest use.
      positions.delete(entry);
      positions.set(entry, top);
      if (positions.size > limit) {
        const oldest = positions.keys().next().value;
        if (oldest !== undefined) {
          positions.delete(oldest);
        }
      }
    },
  };
}

/**
 * The reading position of every article shown in this tab: Back and Forward remount an article
 * (another route on split layouts, another stack screen on Narrow), and it returns where it was
 * read. A new push is a new entry and starts at its section or the top.
 */
const readingPositions = createEntryPositions();

/** The reading position of the article shown for one history entry. */
export function useReadingPosition(entry: string): ArticleScrollMemory {
  return useMemo(
    () => ({
      get: () => readingPositions.get(entry),
      set: (top: number) => readingPositions.set(entry, top),
    }),
    [entry],
  );
}
