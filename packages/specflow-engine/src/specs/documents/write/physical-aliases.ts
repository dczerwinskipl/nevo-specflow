import type { BigIntStats } from 'node:fs';
import { dirname, join } from 'node:path';

import { foldPathKey } from '../../document-rules/document-paths';
import { isAbsent } from '../../document-rules/errno';
import type { VerifiedFs } from '../../document-rules/verified-file';
import type { DocumentChangePlan } from '../changes/plan/model';
import { relativeToDirectory } from './file-effects';

/** What the check reads: `lstat` (BigInt stats) and the names of a directory. Read-only. */
export interface AliasProbeFs {
  readonly lstat: VerifiedFs['lstat'];
  /** The names in a directory, as the file system stores them; an absent directory has none. */
  list(path: string): Promise<string[]>;
}

/**
 * Whether the file system makes a path the plan REMOVES the same directory entry as a path the plan
 * keeps (one it writes, or the manifest). The paths are applied one after the other (writes first,
 * removals after), so such a plan would write the entry and then remove it: a rename `readme.md` ->
 * `README.md` on any volume that ignores case (Windows, the default APFS volume of macOS, a Windows
 * drive under WSL, many SMB and NTFS mounts), and on Windows also an 8.3 short name or a Unicode case
 * pair the planner's lowercase key does not fold.
 *
 * The answer comes from the file system, not the platform. Every existing planned path is `lstat`ed
 * once. A removed path and a kept path with equal device and inode are the same entry only when they
 * are the same NAME in the same directory: their parents are one directory (device and inode) and
 * that directory does not list both last names as separate entries. Two hard links (one inode, two
 * entries) are therefore not an alias, and removing one keeps the other. Where a volume reports no
 * inode (`ino` 0), a removed and a kept path equal ignoring case are one entry when the removed name,
 * `lstat`ed with its letter case swapped, is found (the directory ignores case); a name without a
 * letter to swap is treated as one entry (refusing is the safe answer).
 *
 * Nothing is created or changed. Absent paths take no part (a new path aliases nothing).
 */
export async function planRemovesAnAliasedEntry(
  fs: AliasProbeFs,
  specDir: string,
  plan: Pick<DocumentChangePlan, 'directory' | 'paths'>,
): Promise<boolean> {
  const relative = (path: string): string => relativeToDirectory(plan.directory, path);
  const full = (path: string): string => join(specDir, ...relative(path).split('/'));
  const stats = new Map<string, BigIntStats>();
  for (const planned of plan.paths) {
    if (stats.has(planned.path)) continue;
    const stat = await lstatOrAbsent(fs, full(planned.path));
    if (stat !== undefined) stats.set(planned.path, stat);
  }
  const removed = new Set(
    plan.paths
      .filter((planned) => planned.role === 'document' && planned.post === null)
      .map((planned) => planned.path),
  );
  const kept = [...stats.keys()].filter((path) => !removed.has(path));

  for (const path of removed) {
    const stat = stats.get(path);
    if (stat === undefined) continue;
    for (const other of kept) {
      const otherStat = stats.get(other)!;
      if (reliable(stat) && reliable(otherStat)) {
        if (sameIdentity(stat, otherStat) && (await sameEntry(fs, full(path), full(other)))) {
          return true;
        }
      } else if (
        foldPathKey(relative(other)) === foldPathKey(relative(path)) &&
        (await directoryIgnoresCase(fs, full(path)))
      ) {
        return true;
      }
    }
  }
  return false;
}

/** A volume that reports inode 0 gives no identity to compare. */
function reliable(stat: BigIntStats): boolean {
  return stat.ino !== 0n;
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * Two paths of one inode name one directory entry (not two hard links): the same name in the same
 * directory, where "same name" is what the directory itself says.
 */
async function sameEntry(fs: AliasProbeFs, left: string, right: string): Promise<boolean> {
  const leftParent = await lstatOrAbsent(fs, dirname(left));
  const rightParent = await lstatOrAbsent(fs, dirname(right));
  if (leftParent === undefined || rightParent === undefined) return false;
  if (reliable(leftParent) && reliable(rightParent) && !sameIdentity(leftParent, rightParent)) {
    return false;
  }
  const leftName = lastName(left);
  const rightName = lastName(right);
  if (leftName === rightName) return true;
  const names = await fs.list(dirname(left));
  // Both spellings stored as entries: two hard links of one directory.
  return !(names.includes(leftName) && names.includes(rightName));
}

function lastName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

async function lstatOrAbsent(fs: AliasProbeFs, path: string): Promise<BigIntStats | undefined> {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (isAbsent(error)) return undefined;
    throw error;
  }
}

/** The existing entry `path` is also found under its last segment with the letter case swapped. */
async function directoryIgnoresCase(fs: AliasProbeFs, path: string): Promise<boolean> {
  const name = lastName(path);
  const swapped = Array.from(name)
    .map((char) => {
      const upper = char.toUpperCase();
      return upper !== char ? upper : char.toLowerCase();
    })
    .join('');
  if (swapped === name) return true;
  return (
    (await lstatOrAbsent(fs, path.slice(0, path.length - name.length) + swapped)) !== undefined
  );
}
