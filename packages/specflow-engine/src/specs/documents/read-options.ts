import type { ObservedFile } from './projection';
import { RevisionMemo } from './revision-memo';
import { nodeVerifiedFs, type VerifiedFs } from './verified-file';

/** What a memoised tree observation keeps of a file. */
export interface ObservationMemoValue {
  readonly size: number;
  readonly revision: string;
  readonly kind: ObservedFile['kind'];
  readonly mediaType: string;
}

/**
 * What the workspace documents section needs of a file: its revision and derived title. Memoised by
 * path+size+mtimeNs+ctimeNs+ino: user space cannot set the ctime, so a rewrite that restores the
 * mtime still misses. What remains is a change that preserves all five (a file modified in the last
 * 2 seconds is never memoised; see "Revision memo limit" in the architecture).
 */
export interface SummaryMemoValue {
  readonly revision: string;
  readonly title: string;
}

export interface DocumentReadOptions {
  /** Filesystem seam (fault injection in tests). */
  readonly fs?: VerifiedFs;
  /** Revision memo; defaults to a process-wide bounded LRU. */
  readonly memo?: RevisionMemo<ObservationMemoValue>;
  /** Memo of revisions and titles for the workspace documents section; defaults to a process-wide LRU. */
  readonly summaryMemo?: RevisionMemo<SummaryMemoValue>;
  readonly now?: () => number;
}

export interface ResolvedReadOptions {
  readonly fs: VerifiedFs;
  readonly memo: RevisionMemo<ObservationMemoValue>;
  readonly summaryMemo: RevisionMemo<SummaryMemoValue>;
  readonly now: () => number;
}

const processMemo = new RevisionMemo<ObservationMemoValue>();
const processSummaryMemo = new RevisionMemo<SummaryMemoValue>();

/** Fill every seam of the options with its production default, once. */
export function resolveReadOptions(options: DocumentReadOptions = {}): ResolvedReadOptions {
  return {
    fs: options.fs ?? nodeVerifiedFs,
    memo: options.memo ?? processMemo,
    summaryMemo: options.summaryMemo ?? processSummaryMemo,
    now: options.now ?? Date.now,
  };
}
