import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, it } from 'vitest';

import { run } from '../../packaging/exec';
import { createPackagingWorkspace } from './workspace.test-support';

const { packageManager } = JSON.parse(
  readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
) as { packageManager: string };

it('isolates generated outputs and workspace links while testing current source edits', () => {
  const source = mkdtempSync(join(tmpdir(), 'nevo-pack-source-'));
  let snapshot: ReturnType<typeof createPackagingWorkspace> | undefined;
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(join(source, path)), { recursive: true });
    writeFileSync(join(source, path), content);
  };

  try {
    put('package.json', JSON.stringify({ private: true, packageManager }));
    put('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
    put('.gitignore', 'node_modules/\ndist/\n.artifacts/\n');
    put('packages/provider/package.json', JSON.stringify({ name: 'provider', version: '1.0.0' }));
    put(
      'packages/consumer/package.json',
      JSON.stringify({
        name: 'consumer',
        version: '1.0.0',
        dependencies: { provider: 'workspace:*' },
      }),
    );
    put('packages/provider/source.ts', 'committed');
    put('deleted.ts', 'committed');
    run('git', ['init', '-q'], { cwd: source });
    run('pnpm', ['install', '--lockfile-only'], { cwd: source });
    run('git', ['add', '.'], { cwd: source });
    put('packages/provider/source.ts', 'edited');
    put('untracked.ts', 'new source');
    rmSync(join(source, 'deleted.ts'));
    put('packages/provider/dist/index.js', 'shared build');
    put('.artifacts/keep.tgz', 'shared artifact');

    snapshot = createPackagingWorkspace(source);
    expect(readFileSync(join(snapshot.root, 'packages/provider/source.ts'), 'utf8')).toBe('edited');
    expect(readFileSync(join(snapshot.root, 'untracked.ts'), 'utf8')).toBe('new source');
    expect(existsSync(join(snapshot.root, 'deleted.ts'))).toBe(false);
    expect(existsSync(join(snapshot.root, 'packages/provider/dist'))).toBe(false);
    expect(existsSync(join(snapshot.root, '.artifacts'))).toBe(false);
    expect(realpathSync(join(snapshot.root, 'packages/consumer/node_modules/provider'))).toBe(
      realpathSync(join(snapshot.root, 'packages/provider')),
    );

    put('packages/provider/dist/index.js', 'concurrent build');
    snapshot.dispose();
    expect(existsSync(snapshot.root)).toBe(false);
    expect(readFileSync(join(source, 'packages/provider/dist/index.js'), 'utf8')).toBe(
      'concurrent build',
    );
    expect(readFileSync(join(source, '.artifacts/keep.tgz'), 'utf8')).toBe('shared artifact');
  } finally {
    snapshot?.dispose();
    rmSync(source, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}, 60_000);
