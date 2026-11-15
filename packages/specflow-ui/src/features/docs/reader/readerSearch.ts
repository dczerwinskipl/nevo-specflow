import { defaultStringifySearch } from '@tanstack/react-router';

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

/**
 * The route's own parse of a hand-typed `?q=2026` is the number the default search parser reads;
 * the reader itself reads the raw text (`readerSearchFromString`).
 */
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
 * A raw query value as the text it names. The router writes a text that would read as JSON (a
 * number, `true`) JSON-quoted, so a quoted value is unquoted; anything else is the text as typed:
 * the default parser would turn `?q=1.0` into `1` and round long digit strings.
 */
function rawText(raw: string | null): string | undefined {
  if (raw === null) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'string') {
      return value;
    }
  } catch {
    // Not JSON: the text itself.
  }

  return raw;
}

/** The reader's search of a raw query string (`?q=…&proposals=1`), validated as the route does. */
export function readerSearchFromString(searchStr: string): DocsReaderSearch {
  const params = new URLSearchParams(searchStr);

  return validateDocsReaderSearch({
    q: rawText(params.get('q')),
    proposals: params.get('proposals'),
  });
}

/**
 * The search a router location holds, read from its raw query string: every navigation inside
 * the reader passes it on explicitly, because a navigation without `search` drops it.
 */
export function readerSearchOf(location: { readonly searchStr: string }): DocsReaderSearch {
  return readerSearchFromString(location.searchStr);
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
  return defaultStringifySearch(readerSearchFromString(searchStr));
}
