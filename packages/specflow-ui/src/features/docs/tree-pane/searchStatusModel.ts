import type { TFunction } from 'i18next';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';

/**
 * How long the current request has waited for its answer: `quiet` (under 400 ms: nothing changes),
 * `delayed` (the count leaves, earlier rows dim or the skeleton shows), `preparing` (over 2 s: one
 * quiet line says search by meaning is being prepared).
 */
export type SearchWaitingStage = 'quiet' | 'delayed' | 'preparing';

export const searchDelayedAfterMs = 400;
export const searchPreparingAfterMs = 2000;

/** The index-building progress of a lexical answer, in whole percent; `undefined` when unknown. */
export function indexBuildingPercent(search: WorkspaceDocsSearch): number | undefined {
  const progress = search.indexProgress;
  if (!progress || progress.total <= 0) {
    return undefined;
  }

  return Math.min(100, Math.floor((progress.embedded / progress.total) * 100));
}

/**
 * Why a word-only answer has word matches only, when the reader can act on it or should know:
 * the index is being built, search by meaning or the index is unavailable. A configuration choice
 * (`semantic-disabled`, `no-endpoint`) stays silent.
 */
export function reasonLine(t: TFunction, search: WorkspaceDocsSearch): string | undefined {
  if (search.mode !== 'lexical') {
    return undefined;
  }

  switch (search.reason.code) {
    case 'index-building': {
      const percent = indexBuildingPercent(search);

      return percent === undefined
        ? t('docs.search.indexBuilding')
        : t('docs.search.indexBuildingProgress', { percent });
    }

    case 'endpoint-unreachable':
      return t('docs.search.endpointUnreachable');
    case 'index-unavailable':
      return t('docs.search.indexUnavailable');
    case 'semantic-disabled':
    case 'no-endpoint':
      return undefined;
  }
}

/**
 * A hybrid answer none of whose results matched a query word (in a section or the frontmatter):
 * its rows come from search by meaning alone. A word-only answer always matched words.
 */
export function noWordMatch(search: WorkspaceDocsSearch): boolean {
  return (
    search.mode === 'hybrid' &&
    search.results.length > 0 &&
    search.results.every((hit) => !hit.wordMatch)
  );
}

/** The quiet lines under the status row for a settled answer: the reason, then "no word match". */
export function answerLines(t: TFunction, search: WorkspaceDocsSearch): string[] {
  const reason = reasonLine(t, search);

  return [
    ...(reason === undefined ? [] : [reason]),
    ...(noWordMatch(search) ? [t('docs.search.noWordMatch')] : []),
  ];
}

/**
 * The one message the live region reads for a settled answer: the count (or that nothing matches)
 * together with its quiet lines.
 */
export function answerAnnouncement(t: TFunction, search: WorkspaceDocsSearch): string {
  const head =
    search.results.length === 0
      ? t('docs.search.noMatches')
      : t('docs.search.count', { count: search.results.length });

  const lines = answerLines(t, search);

  // The count has no full stop of its own; the lines are sentences.
  return lines.length === 0 ? head : [`${head}.`, ...lines].join(' ');
}
