import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';

import { foldPathKey } from '../../document-rules/document-paths';
import { isAbsent } from '../../document-rules/errno';
import type { VerifiedFs } from '../../document-rules/verified-file';
import type { DocumentChangePlan } from '../changes/plan/model';
import { relativeToDirectory } from './file-effects';

/**
 * Whether the file system itself makes a path the plan REMOVES the same entry as another path of the
 * plan. The paths are applied one after the other (writes first, removals after), so such a plan
 * would write the entry and then remove it: a rename `readme.md` -> `README.md` on any file system
 * that ignores case (Windows, the default APFS volume of macOS, a Windows drive under WSL, many SMB
 * and NTFS mounts), and on Windows also an 8.3 short name or a Unicode case pair the lowercase key of
 * the planner does not fold.
 *
 * The answer comes from the file system, not the platform: every path of the plan that exists is
 * `lstat`ed once and two paths are one entry when their device and inode are equal. Where a volume
 * reports no usable inode (`ino` 0, some Windows network and FAT volumes) two paths that are equal
 * ignoring case are compared by a probe: the removed path is `lstat`ed with its letter case swapped;
 * if that finds an entry the directory ignores case and the paths are one entry. A path without a
 * letter to swap cannot be probed and is treated as the same entry (refusing is the safe answer).
 *
 * Read-only: nothing is created or changed. Absent paths take part in nothing (a new path cannot be
 * an alias of anything that exists).
 */
export async function planRemovesAnAliasedEntry(
  fs: VerifiedFs,
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

  // Reliable identities: one entry seen under two paths, one of them removed.
  const byIdentity = new Map<string, string[]>();
  for (const [path, stat] of stats) {
    if (!reliable(stat)) continue;
    const key = `${stat.dev}:${stat.ino}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), path]);
  }
  for (const paths of byIdentity.values()) {
    if (paths.length > 1 && paths.some((path) => removed.has(path))) return true;
  }

  // No usable inode: two spellings of one name are one entry when the directory ignores case.
  for (const path of removed) {
    const stat = stats.get(path);
    if (stat === undefined) continue;
    for (const [other, otherStat] of stats) {
      if (other === path || (reliable(stat) && reliable(otherStat))) continue;
      if (foldPathKey(relative(other)) !== foldPathKey(relative(path))) continue;
      if (await directoryIgnoresCase(fs, full(path))) return true;
    }
  }
  return false;
}

/** A volume that reports inode 0 gives no identity to compare. */
function reliable(stat: BigIntStats): boolean {
  return stat.ino !== 0n;
}

async function lstatOrAbsent(fs: VerifiedFs, path: string): Promise<BigIntStats | undefined> {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (isAbsent(error)) return undefined;
    throw error;
  }
}

/** The existing entry `path` is also found under its last segment with the letter case swapped. */
async function directoryIgnoresCase(fs: VerifiedFs, path: string): Promise<boolean> {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = path.slice(slash + 1);
  const swapped = Array.from(name)
    .map((char) => {
      const upper = char.toUpperCase();
      return upper !== char ? upper : char.toLowerCase();
    })
    .join('');
  if (swapped === name) return true;
  return (await lstatOrAbsent(fs, path.slice(0, slash + 1) + swapped)) !== undefined;
}
