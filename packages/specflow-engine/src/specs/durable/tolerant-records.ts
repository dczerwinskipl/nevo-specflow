import { readFileWindowsSafe } from '../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../project/home/home';
import {
  listJournalRowsTolerant,
  readJournalRowTolerant,
  type JournalKind,
  type TolerantJournalReader,
} from './journal-store';
import { classifyJournalText } from './unsupported';

/**
 * One record file as a read-only listing sees it. A reader never fails because of one bad file:
 * a corrupt, redirected, oversize or unparseable current-format file is `unreadable`, an
 * unreadable one is `unsupported` (never a claim, never an error).
 */
export type TolerantRecord<T> =
  | { readonly kind: 'record'; readonly record: T }
  | { readonly kind: 'unreadable'; readonly operationId: string; readonly updatedAt: Date }
  | { readonly kind: 'unsupported'; readonly operationId: string };

function readerOf<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
): TolerantJournalReader<TolerantRecord<T>> {
  return {
    readRow: async (path, operationId, stat, updatedAt) => {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > kind.maxBytes) {
        return { kind: 'unreadable', operationId, updatedAt };
      }
      try {
        const classified = classifyJournalText(await readFileWindowsSafe(path));
        if (classified.kind === 'unsupported') return { kind: 'unsupported', operationId };
        return { kind: 'record', record: kind.parse(context, classified.value, operationId) };
      } catch {
        return { kind: 'unreadable', operationId, updatedAt };
      }
    },
    unreadable: (operationId, updatedAt) => ({ kind: 'unreadable', operationId, updatedAt }),
  };
}

export interface TolerantRecordListing<T> {
  readonly records: readonly T[];
  /** Current-format files that cannot be read, with the time of their last change. */
  readonly unreadable: readonly { readonly operationId: string; readonly updatedAt: Date }[];
  readonly unsupported: number;
  /** The directory holds more files than a listing reads (the kind's `listingMaxFiles`). */
  readonly truncated: boolean;
}

/**
 * Lock-free, Git-free, read-only listing of a kind's active records, tolerant per file and bounded
 * by the kind's file cap. Only files whose stat signature changed since the last call are parsed.
 */
export async function listRecordsTolerant<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
): Promise<TolerantRecordListing<T>> {
  let truncated = false;
  const rows = await listJournalRowsTolerant(context, kind, readerOf(context, kind), {
    onTruncated: () => {
      truncated = true;
    },
  });
  const records: T[] = [];
  const unreadable: { operationId: string; updatedAt: Date }[] = [];
  let unsupported = 0;
  for (const row of rows) {
    if (row.kind === 'record') records.push(row.record);
    else if (row.kind === 'unreadable') {
      unreadable.push({ operationId: row.operationId, updatedAt: row.updatedAt });
    } else unsupported += 1;
  }
  return { records, unreadable, unsupported, truncated };
}

/** The tolerant read of ONE active record; `undefined` when no file exists. */
export function readRecordTolerant<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
  operationId: string,
): Promise<TolerantRecord<T> | undefined> {
  return readJournalRowTolerant(context, kind, operationId, readerOf(context, kind));
}
