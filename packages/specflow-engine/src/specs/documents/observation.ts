import { join } from 'node:path';

import { isAbsent } from './errno';
import { DocumentError } from './errors';
import { analyzeOpenFile, type FileAnalysis } from './file-analysis';
import type { LoadedSpecification } from './loaded-specification';
import type { ObservationMemoValue, ResolvedReadOptions } from './read-options';
import type { ObservedFile } from './projection';
import type { RevisionMemo } from './revision-memo';
import { memoKey } from './revision-memo';
import { inspectEntry, withOpenFile } from './verified-file';

/** A file modified this recently is not memoised: its mtime may not move on a further write. */
const RECENT_WRITE_MS = 2000;

/**
 * `vanished`: gone since the listing (not reported). `skipped`: present but not safely readable.
 * `file`: analysed (or answered from the memo).
 */
export type Probe<T> =
  | { readonly kind: 'file'; readonly value: T }
  | { readonly kind: 'vanished' }
  | { readonly kind: 'skipped' };

/**
 * Analyse one file of the Specification, answering an unchanged old file (same path, size, mtime,
 * ctime and inode) from `memo` with one stat. A file that cannot be read safely is `skipped`, one that
 * disappears is `vanished`; every other failure propagates. "Cannot be read safely" is a
 * `DocumentError` from anywhere in the probe: the lstat of the entry (EACCES, EMFILE, ...), the
 * verified open (a symlink swapped in, a changed identity) or the analysis. One such file never fails
 * the tree or the workspace documents section. The result of an analysis is memoised only when the
 * file is not a recent write (its mtime may not move on a further write).
 */
export async function probeFile<T>(
  loaded: LoadedSpecification,
  path: string,
  options: ResolvedReadOptions,
  memo: RevisionMemo<T>,
  project: (analysis: FileAnalysis) => T,
): Promise<Probe<T>> {
  try {
    const entry = await inspectEntry(options.fs, loaded.specDir, path);
    if (entry.state === 'absent') return { kind: 'vanished' };
    if (entry.state !== 'file') return { kind: 'skipped' };
    const cached = memo.get(memoKey(join(loaded.specDir, path), entry.stat));
    if (cached !== undefined) return { kind: 'file', value: cached };

    const outcome = await withOpenFile(options.fs, loaded.specDir, path, async (file) => {
      const value = project(await analyzeOpenFile(file.handle, file.stat, path));
      const modifiedMs = Number(file.stat.mtimeNs / 1_000_000n);
      if (options.now() - modifiedMs >= RECENT_WRITE_MS) {
        memo.set(memoKey(join(loaded.specDir, path), file.stat), value);
      }
      return value;
    });
    if (outcome.state === 'opened') return { kind: 'file', value: outcome.value };
    return { kind: outcome.state === 'absent' ? 'vanished' : 'skipped' };
  } catch (error) {
    if (error instanceof DocumentError) return { kind: 'skipped' };
    if (isAbsent(error)) return { kind: 'vanished' };
    throw error;
  }
}

/** One tree entry: the observation of `path`, or why there is none. */
export type Observation =
  | { readonly kind: 'file'; readonly file: ObservedFile }
  | { readonly kind: 'vanished' }
  | { readonly kind: 'skipped'; readonly path: string };

export async function observe(
  loaded: LoadedSpecification,
  path: string,
  options: ResolvedReadOptions,
): Promise<Observation> {
  const probe = await probeFile<ObservationMemoValue>(
    loaded,
    path,
    options,
    options.memo,
    (analysis) => ({
      size: analysis.size,
      revision: analysis.revision,
      kind: analysis.kind,
      mediaType: analysis.mediaType,
    }),
  );
  if (probe.kind === 'file') return { kind: 'file', file: { path, ...probe.value } };
  return probe.kind === 'skipped' ? { kind: 'skipped', path } : probe;
}
