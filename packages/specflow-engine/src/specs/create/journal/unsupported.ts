import { CreateOperationError } from '../error';
import { CREATE_JOURNAL_VERSION } from './model';

/**
 * The single home of the rule for Create journals this Engine cannot interpret (confirmed decision
 * PC-2; delivery specification D2, item 3). It is NOT a compatibility reader: no old format is ever
 * interpreted. A journal file is _unsupported_ when
 *
 * - its text is not valid JSON, or
 * - it is not an object with a numeric `version`, or
 * - its `version` is not the current one.
 *
 * Nothing else is read from such a file. An unsupported journal:
 *
 * - is returned separately by the listing and is NEVER a resource claim, so it can block neither
 *   Create nor Close;
 * - is deleted by the retention sweep once it is older than the retention (by file mtime);
 * - answers `CREATE_JOURNAL_UNSUPPORTED` when read by operation id (distinct from
 *   `CREATE_JOURNAL_CORRUPT`, which stays a blocking, fail-closed state of a current-format file).
 */
export type CreateJournalFileClass =
  { readonly kind: 'current'; readonly value: unknown } | { readonly kind: 'unsupported' };

/** Classifies the text of a journal file by its version only. */
export function classifyCreateJournalText(text: string): CreateJournalFileClass {
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
    typeof (value as { version?: unknown }).version !== 'number' ||
    (value as { version: number }).version !== CREATE_JOURNAL_VERSION
  ) {
    return { kind: 'unsupported' };
  }
  return { kind: 'current', value };
}

/** The answer of a by-id read of an unsupported journal. */
export function unsupportedJournalError(): CreateOperationError {
  return new CreateOperationError(
    'CREATE_JOURNAL_UNSUPPORTED',
    'The Create operation journal is of an unsupported format and cannot be interpreted.',
  );
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
export interface UnsupportedCreateJournal {
  readonly operationId: string;
  readonly mtimeMs: number;
}
