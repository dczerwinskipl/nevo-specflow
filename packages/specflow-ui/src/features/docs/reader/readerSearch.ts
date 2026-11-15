import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';

/** The longest search text the reader asks for; the field takes no more either. */
export const readerSearchMaxLength = 500;

/**
 * The reader's search as its address holds it: `?q=<text>&proposals=1`. It does not depend on the
 * workspace, so it is kept when another workspace is picked and searched again there.
 */
export interface DocsReaderSearch {
  /** The search text, trimmed; absent when the field is empty. */
  readonly q?: string;
  /** Proposals are included; only `1` means anything. */
  readonly proposals?: 1;
}

/** A hand-typed `?q=2026` reaches the route as the number the default search parser reads. */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
}

/**
 * The route's validation of the reader's search: unknown keys and invalid values are dropped, so
 * an invalid value never reaches a request. A text longer than the field allows is cut to it.
 */
export function validateDocsReaderSearch(search: Record<string, unknown>): DocsReaderSearch {
  const q = textOf(search.q)?.trim().slice(0, readerSearchMaxLength).trim();
  const proposals = search.proposals === 1 || search.proposals === '1';

  return { ...(q ? { q } : {}), ...(proposals ? { proposals: 1 as const } : {}) };
}

/**
 * The search a router location holds, as the route validates it: every navigation inside the
 * reader passes it on explicitly, because a navigation without `search` drops it.
 */
export function readerSearchOf(location: { readonly search: object }): DocsReaderSearch {
  return validateDocsReaderSearch(location.search as Record<string, unknown>);
}

/** The search to write for a field's text and the proposals checkbox. */
export function docsReaderSearch(text: string, includeProposals: boolean): DocsReaderSearch {
  return validateDocsReaderSearch({ q: text, proposals: includeProposals ? 1 : undefined });
}

/**
 * The query part (`?q=…&proposals=1`, or `''`) of an address's raw query string, validated as the
 * route does: Copy link carries the search, never an unknown parameter.
 */
export function docsReaderSearchString(searchStr: string): string {
  return defaultStringifySearch(validateDocsReaderSearch(defaultParseSearch(searchStr)));
}
