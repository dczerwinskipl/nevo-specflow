/**
 * What a navigation into the reader carries besides its address (router location state, under
 * `docsReader`). It is never part of a link: a copied address opens the plain reader.
 */
export interface DocsReaderLocationState {
  /**
   * The intent of the navigation that set the workspace: `pick` (the workspace picker) or
   * `session` (a Session's Context entry). Consumed once read: the reader replaces it with no
   * source, so a reload or Back to the entry does not replay an explicit pick.
   */
  readonly source?: 'pick' | 'session';
  /** The Session the reader was entered from: the way back above the tree. */
  readonly sessionId?: string;
  /** That Session's title, which names the way back. */
  readonly sessionTitle?: string;
  /**
   * The reader entry this document was opened from (a push inside the reader): its history entry,
   * whether that entry named a document (without one it is the tree's), and whether the document
   * was reached by a link of an article (a hop) rather than the tree or the results.
   */
  readonly openedFrom?: DocsReaderOpener;
  /** After a pick: the title of the document the new workspace does not have. */
  readonly notInWorkspace?: string;
}

export interface DocsReaderOpener {
  readonly entry: string;
  readonly documentId?: string;
  readonly link: boolean;
}

declare module '@tanstack/react-router' {
  interface HistoryState {
    docsReader?: DocsReaderLocationState;
  }
}

const segment = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * The workspace and document a reader address names: `{}` for `/docs`, `undefined` for an address
 * that is not the reader's (the reader is being left).
 */
export function readerAddress(
  pathname: string,
): { readonly workspaceId?: string; readonly documentId?: string } | undefined {
  if (/^\/docs\/?$/.test(pathname)) {
    return {};
  }

  const match = /^\/workspaces\/([^/]+)\/docs(?:\/([^/]+))?\/?$/.exec(pathname);

  return match ? { workspaceId: segment(match[1]), documentId: segment(match[2]) } : undefined;
}

/** The identity of a history entry: kept by Back, Forward and a reload, new for every push. */
export const historyEntryOf = (state: { readonly __TSR_key?: string; readonly key?: string }) =>
  state.__TSR_key ?? state.key ?? '';

/** The location's hash without `#`; `undefined` when empty. */
export const stripHash = (hash: string) =>
  (hash.startsWith('#') ? hash.slice(1) : hash) || undefined;

/** The way back to a Session an entry carries, kept on every navigation inside the reader. */
export function sessionOf(entry: DocsReaderLocationState | undefined): DocsReaderLocationState {
  return {
    ...(entry?.sessionId ? { sessionId: entry.sessionId } : {}),
    ...(entry?.sessionTitle ? { sessionTitle: entry.sessionTitle } : {}),
  };
}

/** The entry without its one-time intent. */
export function withoutSource(
  entry: DocsReaderLocationState | undefined,
): DocsReaderLocationState | undefined {
  if (!entry) {
    return undefined;
  }

  const { source: _source, ...rest } = entry;

  return rest;
}

/** A `#sectionId` of the address, decoded (section ids hold `/` and `~`). */
export function sectionFromHash(hash: string): string | undefined {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') {
    return undefined;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The router `hash` value of a section (without `#`), encoded once. */
export const hashOfSection = (sectionId: string | undefined) =>
  sectionId === undefined ? undefined : encodeURIComponent(sectionId);

/** The address of a workspace's documentation, or of one of its documents. */
export function docsHref(workspaceId: string, documentId?: string, sectionId?: string): string {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/docs`;
  const path = documentId === undefined ? base : `${base}/${encodeURIComponent(documentId)}`;

  return sectionId === undefined ? path : `${path}#${hashOfSection(sectionId)}`;
}
