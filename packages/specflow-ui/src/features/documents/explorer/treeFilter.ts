import type { TreeRowDocument, TreeRows } from './documentTreePolicy';

/** The value of the type filter for a document without a type (unclassified). */
export const NO_TYPE = '';

/** What the tree shows: rows whose path contains `term` and whose type is one of `types`. */
export interface TreeFilter {
  readonly term: string;
  /** Type ids (`NO_TYPE` for unclassified); empty means every type. */
  readonly types: readonly string[];
}

export const noTreeFilter: TreeFilter = { term: '', types: [] };

/** How many filters are active (the counter next to the reset). */
export const activeFilterCount = (filter: TreeFilter) =>
  (filter.term.trim() ? 1 : 0) + (filter.types.length > 0 ? 1 : 0);

const typeOf = (row: TreeRowDocument) =>
  row.dangling ? row.type : row.classification === 'unclassified' ? NO_TYPE : (row.type ?? NO_TYPE);

/** The type ids present in the rows, in first-seen order (`NO_TYPE` included when present). */
export function treeTypes(rows: TreeRows): string[] {
  return [...new Set(rows.documents.map(typeOf))];
}

export interface FilteredTreeRows {
  rows: TreeRows;
  /** Rows a filter hides although they need the reader (a registered file that is missing). */
  hiddenMissing: number;
  /** Rows the filter keeps. */
  matches: number;
}

const ancestors = (path: string) => {
  const parts = path.split('/');
  return parts.slice(1).map((_, index) =>
    parts
      .slice(0, index + 1)
      .join('/')
      .toLowerCase(),
  );
};

/**
 * The tree narrowed to the rows that match: a document by its path (case-insensitive substring)
 * and by its type; a folder stays while something under it matches. Without an active filter the
 * rows are returned as they are.
 */
export function filterTreeRows(rows: TreeRows, filter: TreeFilter): FilteredTreeRows {
  const term = filter.term.trim().toLowerCase();
  if (!term && filter.types.length === 0)
    return { rows, hiddenMissing: 0, matches: rows.documents.length };
  const matchesRow = (row: TreeRowDocument) =>
    (!term || row.path.toLowerCase().includes(term)) &&
    (filter.types.length === 0 || filter.types.includes(typeOf(row)));
  const documents = rows.documents.filter(matchesRow);
  // A row shown in the main folder (its registered folder is gone) keeps no folder open.
  const kept = new Set(
    documents.flatMap((row) => (row.placement !== undefined ? [] : ancestors(row.path))),
  );
  const folders = rows.folders.filter(
    (folder) => folder.path === '' || kept.has(folder.path.toLowerCase()),
  );
  return {
    rows: { folders, documents },
    hiddenMissing: rows.documents.filter((row) => row.dangling && !matchesRow(row)).length,
    matches: documents.length,
  };
}
