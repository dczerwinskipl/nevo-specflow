/**
 * The single home of the rule for journal files this Engine cannot interpret at all (see
 * `docs/architecture/runtime/specification-documents.md`). A journal file is _unsupported_ when
 *
 * - its text is not valid JSON, or
 * - it is not an object with a numeric `version`.
 *
 * Nothing else is read from such a file (a stray, truncated or hostile file). An unsupported journal:
 *
 * - is returned separately by the listing and is NEVER a resource claim, so it can block no admission;
 * - is deleted by the retention sweep once it is older than the retention (by file mtime);
 * - answers the kind's `unsupported` error when read by operation id (distinct from the
 *   `invalid` error, which stays a blocking, fail-closed state of any file that parses as a journal
 *   but is not a valid one of its kind, whatever its `version`).
 */
export type JournalFileClass =
  { readonly kind: 'current'; readonly value: unknown } | { readonly kind: 'unsupported' };

/** Classifies the text of a journal file by its shape only. */
export function classifyJournalText(text: string): JournalFileClass {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'unsupported' };
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { version?: unknown }).version !== 'number'
  ) {
    return { kind: 'unsupported' };
  }
  return { kind: 'current', value };
}

/** Whether the retention sweep deletes an unsupported journal of this age. */
export function isExpiredUnsupportedJournal(
  mtimeMs: number,
  now: number,
  retentionMs: number,
): boolean {
  return now - mtimeMs >= retentionMs;
}

/** One unsupported journal found by a listing: only what the file name and stat reveal. */
export interface UnsupportedJournal {
  readonly operationId: string;
  readonly mtimeMs: number;
}
