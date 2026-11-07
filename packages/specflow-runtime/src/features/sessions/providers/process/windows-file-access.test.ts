import { mkdtemp, mkdir, readFile, writeFile, rename, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireWindowsFileAccess, type NativeFileAccess } from './windows-file-access';

const roots: string[] = [];
const guards: NativeFileAccess[] = [];
afterEach(async () => {
  for (const guard of guards.splice(0)) {
    guard.close();
  }

  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nevo-native-path-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  const directory = join(workspace, 'nested');
  await mkdir(directory, { recursive: true });
  await mkdir(outside);
  const file = join(directory, 'file.txt');
  await writeFile(file, 'original');

  return { root, workspace, outside, directory, file };
}

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')(
  'Windows native file access',
  () => {
    it('allows native content writes while holding parent and target identities stable', async () => {
      const f = await fixture();
      const guard = acquireWindowsFileAccess(f.workspace, f.file, {
        directory: false,
        create: false,
      });
      guards.push(guard);
      expect(guard.created).toBe(false);
      await writeFile(f.file, 'updated');
      expect(await readFile(f.file, 'utf8')).toBe('updated');
      await expect(rename(f.directory, join(f.workspace, 'old'))).rejects.toMatchObject({
        code: 'EBUSY',
      });
      await expect(rename(f.file, join(f.directory, 'old.txt'))).rejects.toMatchObject({
        code: 'EBUSY',
      });
      guard.close();
      await rename(f.directory, join(f.workspace, 'old'));
      await symlink(f.outside, f.directory, 'junction');
    });

    it('reserves an absent file before allowing its native creation', async () => {
      const f = await fixture();
      const target = join(f.directory, 'new.txt');
      const guard = acquireWindowsFileAccess(f.workspace, target, {
        directory: false,
        create: true,
      });
      guards.push(guard);
      expect(guard.created).toBe(true);
      await expect(rename(target, join(f.directory, 'moved.txt'))).rejects.toMatchObject({
        code: 'EBUSY',
      });
      await writeFile(target, 'native write');
      expect(await readFile(target, 'utf8')).toBe('native write');
    });

    it('rejects pre-existing junctions and hardlinked file targets', async () => {
      const f = await fixture();
      await symlink(f.outside, join(f.workspace, 'redirected'), 'junction');
      expect(() =>
        acquireWindowsFileAccess(f.workspace, join(f.workspace, 'redirected', 'a'), {
          directory: false,
          create: true,
        }),
      ).toThrow();
      await link(f.file, join(f.outside, 'alias.txt'));
      expect(() =>
        acquireWindowsFileAccess(f.workspace, f.file, { directory: false, create: false }),
      ).toThrow();
      expect(await readFile(f.file, 'utf8')).toBe('original');
    });
  },
);
