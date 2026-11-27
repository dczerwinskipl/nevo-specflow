import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { run } from '../../packaging/exec';

/** Copy current source, including local edits, without sharing generated outputs or workspace links. */
export function createPackagingWorkspace(sourceRoot: string): {
  root: string;
  dispose: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'nevo-pack-workspace-'));
  const dispose = (): void =>
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

  try {
    const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: sourceRoot,
    }).split('\0');
    // Git reports opaque embedded repositories as directory entries; never recurse into their state.
    for (const file of new Set(files.filter((file) => file && !file.endsWith('/')))) {
      const source = join(sourceRoot, file);
      // Locally deleted tracked source is absent in the snapshot too.
      if (!existsSync(source)) {
        continue;
      }

      const target = join(root, file);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
    }

    run('pnpm', ['install', '--frozen-lockfile'], { cwd: root, timeout: 180_000 });

    return { root, dispose };
  } catch (error) {
    // A cleanup failure (a Windows file lock, EPERM) must not hide why the workspace failed.
    try {
      dispose();
    } catch (cleanup) {
      console.warn('packaging workspace cleanup failed', cleanup);
    }

    throw error;
  }
}
