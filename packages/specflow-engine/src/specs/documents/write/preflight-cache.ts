import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import type { ResolvedProjectHome } from '../../../project/home/home';

/**
 * What a cached Git preflight is valid for: the stat signatures of the checkout's `HEAD` file, the
 * existence of its index lock and the mtimes of the project (and local) configuration. The branch
 * the checkout is on comes from the same `HEAD` read, so a hit starts no Git process.
 */
export interface PreflightSignature {
  /** Short branch name from `HEAD`; `undefined` when detached or unreadable. */
  readonly branchRef: string | undefined;
  /** Opaque: equal tokens mean the signatures held. */
  readonly token: string;
  readonly indexLocked: boolean;
}

export type PreflightSignatureReader = (
  context: ResolvedProjectHome,
  root: string,
) => Promise<PreflightSignature>;

const SMALL_FILE_MAX_BYTES = 4096;

async function readSmall(path: string): Promise<string | undefined> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > SMALL_FILE_MAX_BYTES) return undefined;
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function statToken(path: string): Promise<string> {
  try {
    const stat = await lstat(path, { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  } catch {
    return 'absent';
  }
}

async function gitDirectoryOf(root: string): Promise<string | undefined> {
  const dotGit = join(root, '.git');
  const stat = await lstat(dotGit);
  if (stat.isDirectory()) return dotGit;
  if (!stat.isFile()) return undefined;
  const text = await readSmall(dotGit);
  const target = text === undefined ? undefined : /^gitdir:\s*(.+?)\s*$/mu.exec(text)?.[1];
  return target === undefined ? undefined : isAbsolute(target) ? target : resolve(root, target);
}

/**
 * The production signature reader: three or four `lstat`s and one 4 KiB read, no Git process.
 * Anything it cannot read makes the token unique, so nothing is ever served from the cache on a
 * doubt.
 */
export const readPreflightSignature: PreflightSignatureReader = async (context, root) => {
  try {
    const gitDirectory = await gitDirectoryOf(root);
    if (gitDirectory === undefined) throw new Error('no git directory');
    const head = await readSmall(join(gitDirectory, 'HEAD'));
    const branch = head === undefined ? null : /^ref:\s*refs\/heads\/(.+?)\s*$/mu.exec(head);
    const [headToken, lockToken, projectConfig, localConfig] = await Promise.all([
      statToken(join(gitDirectory, 'HEAD')),
      statToken(join(gitDirectory, 'index.lock')),
      statToken(context.project.projectConfigPath),
      statToken(context.project.localConfigPath),
    ]);
    return {
      branchRef: branch?.[1],
      indexLocked: lockToken !== 'absent',
      token: [headToken, head ?? '', projectConfig, localConfig].join('|'),
    };
  } catch {
    return {
      branchRef: undefined,
      indexLocked: true,
      token: 'unreadable:' + String(Math.random()),
    };
  }
};

/** The key of a cached preflight: the checkout, the branch ref and the set of paths. */
export function preflightKey(root: string, branchRef: string, paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) hash.update(path + '\0');
  return root + '\0' + branchRef + '\0' + hash.digest('hex');
}

export interface PreflightCacheOptions {
  /** How long a successful preflight is reused (default 2 s, the most ADR 0016 allows). */
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Monotonic milliseconds; injected by tests. */
  readonly now?: () => number;
}

export const PREFLIGHT_CACHE_TTL_MS = 2000;

/**
 * A small time-boxed memory of successful preflights. An entry is served only while it is younger
 * than the TTL AND the signature token it was recorded with still holds. Failures are never cached,
 * and the execution-time guard of the commit port never consults it.
 */
export class GitPreflightCache {
  private readonly entries = new Map<string, { readonly token: string; readonly at: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: PreflightCacheOptions = {}) {
    this.ttlMs = Math.min(options.ttlMs ?? PREFLIGHT_CACHE_TTL_MS, PREFLIGHT_CACHE_TTL_MS);
    this.maxEntries = options.maxEntries ?? 256;
    this.now = options.now ?? (() => performance.now());
  }

  has(key: string, token: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    if (entry.token !== token || this.now() - entry.at >= this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  remember(key: string, token: string): void {
    this.entries.delete(key);
    this.entries.set(key, { token, at: this.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
