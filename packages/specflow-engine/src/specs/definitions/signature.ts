import { createHash } from 'node:crypto';

import { compareText } from './order';
import { SIGNATURE_DEPTH_MAX, SIGNATURE_ENTRIES_MAX } from './limits';
import type { DefinitionSource } from './source';

/**
 * The stat signature of a definitions tree: a digest of the names, types, sizes, mtimes, ctimes and
 * inodes of every entry, directories included (a deleted or added file changes its directory entry
 * list). It is the only thing the catalogue cache checks; there is no file watcher. Walking uses
 * `list` only, so it reads no file content and starts no process.
 */
export interface StatSignature {
  readonly value: string;
  /** Latest mtime or ctime of any entry, in milliseconds; 0 for an absent tree. */
  readonly newestChangeMs: number;
  /** False when the walk hit a bound or a problem directory: such a signature is never trusted. */
  readonly complete: boolean;
  /** `<path>` -> `size|mtimeNs|ctimeNs|ino` of every regular file, for single-file lookups. */
  readonly fileKeys: ReadonlyMap<string, string>;
}

export function statKey(entry: {
  readonly size: number;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly ino: bigint;
}): string {
  return `${entry.size}|${entry.mtimeNs}|${entry.ctimeNs}|${entry.ino}`;
}

const NS_PER_MS = 1_000_000n;

export async function computeStatSignature(source: DefinitionSource): Promise<StatSignature> {
  const hash = createHash('sha256');
  const fileKeys = new Map<string, string>();
  let newestNs = 0n;
  let complete = true;
  let counted = 0;

  const walk = async (directory: string, depth: number): Promise<void> => {
    const listing = await source.list(directory, SIGNATURE_ENTRIES_MAX);
    if (listing.state !== 'ok') {
      hash.update(`${directory}\0${listing.state}\n`);
      if (listing.state !== 'absent') complete = false;
      return;
    }
    const entries = [...listing.entries].sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      counted += 1;
      if (counted > SIGNATURE_ENTRIES_MAX) {
        complete = false;
        return;
      }
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      hash.update(`${path}\0${entry.type}\0${statKey(entry)}\n`);
      if (entry.mtimeNs > newestNs) newestNs = entry.mtimeNs;
      if (entry.ctimeNs > newestNs) newestNs = entry.ctimeNs;
      if (entry.type === 'file') fileKeys.set(path, statKey(entry));
      if (entry.type === 'directory') {
        if (depth + 1 > SIGNATURE_DEPTH_MAX) {
          complete = false;
        } else {
          await walk(path, depth + 1);
        }
      }
    }
  };
  await walk('', 0);

  return {
    value: hash.digest('hex'),
    newestChangeMs: Number(newestNs / NS_PER_MS),
    complete,
    fileKeys,
  };
}
