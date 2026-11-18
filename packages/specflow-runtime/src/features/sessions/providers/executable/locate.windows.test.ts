import { mkdir, mkdtemp, rm, rmdir, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { codexExecutable } from '../codex/executable';
import { nodeExecutableFiles } from './files';
import { createExecutableLocator, locateExecutable } from './locate';

// Real NTFS junctions: a PATH folder that is a junction into the project or the temporary folder
// is never run from, while a junction to an ordinary folder keeps working.
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.runIf(process.platform === 'win32')(
  'skips PATH junctions into the workspace or the temporary folder without running them',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'nevo-junction-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const temporary = join(root, 'temp');
    for (const folder of [join(workspace, 'bin'), join(temporary, 'x'), join(root, 'tools-real')]) {
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'codex.exe'), 'MZ');
    }

    await symlink(join(workspace, 'bin'), join(root, 'into-workspace'), 'junction');
    await symlink(join(temporary, 'x'), join(root, 'into-temp'), 'junction');
    await symlink(join(root, 'tools-real'), join(root, 'tools'), 'junction');
    const run = vi.fn(() => Promise.resolve('codex-cli 1.0.0'));

    const found = await locateExecutable(
      codexExecutable,
      {
        environment: {
          values: {
            PATH: [join(root, 'into-workspace'), join(root, 'into-temp'), join(root, 'tools')].join(
              ';',
            ),
            LOCALAPPDATA: join(root, 'local'),
          },
          sources: {},
        },
        workspace,
        temporaryRoots: [temporary],
      },
      { ...nodeExecutableFiles, run },
    );

    expect(found).toMatchObject({ path: join(root, 'tools', 'codex.exe'), source: 'path' });
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      join(root, 'tools', 'codex.exe'),
      ['--version'],
      expect.anything(),
    );
  },
);

it.runIf(process.platform === 'win32')(
  'rejects a cached executable once its PATH junction is retargeted into the workspace',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'nevo-junction-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const real = join(root, 'tools-real');
    const planted = join(workspace, 'bin');
    for (const folder of [real, planted]) {
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'codex.exe'), 'MZ');
    }

    // The planted file looks exactly like the trusted one: same size, same modification time.
    const original = await stat(join(real, 'codex.exe'));
    await utimes(join(planted, 'codex.exe'), original.atime, original.mtime);
    const junction = join(root, 'tools');
    await symlink(real, junction, 'junction');
    const run = vi.fn(() => Promise.resolve('codex-cli 1.0.0'));
    const locator = createExecutableLocator(
      codexExecutable,
      {
        environment: { values: { PATH: junction, LOCALAPPDATA: join(root, 'local') }, sources: {} },
        workspace,
        temporaryRoots: [join(root, 'temp')],
      },
      { ...nodeExecutableFiles, run },
    );

    await expect(locator.resolve(AbortSignal.timeout(5000))).resolves.toMatchObject({
      path: join(junction, 'codex.exe'),
    });
    await rmdir(junction);
    await symlink(planted, junction, 'junction');

    await expect(locator.resolve(AbortSignal.timeout(5000))).rejects.toMatchObject({
      reasonCode: 'EXECUTABLE_NOT_FOUND',
    });
    expect(run).toHaveBeenCalledOnce();
  },
);
