import { win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { codexExecutable } from '../codex/executable';
import { claudeExecutable } from '../claude/executable';
import { antigravityExecutable } from '../antigravity/executable';
import { ProviderUnavailableError } from '../unavailable';
import { CommandFailure, type ExecutableFiles } from './files';
import { createExecutableLocator, locateExecutable, type LocateExecutableOptions } from './locate';
import { executableFields, signInCommand } from './descriptor';
import { compareVersions } from './version';

const HOME = 'C:\\Users\\dev';
const LOCAL = HOME + '\\AppData\\Local';
const APP = LOCAL + '\\OpenAI\\Codex\\bin';
const WORKSPACE = 'D:\\work\\repo';

interface Entry {
  kind: 'file' | 'dir' | 'link';
  size?: number;
  mtimeMs?: number;
}

/** A fake Windows file system: paths compare case-insensitively; `versions` answers `--version`. */
function fakeFiles(
  entries: Record<string, Entry['kind']>,
  versions: Record<string, string | CommandFailure> = {},
  hashes: Record<string, string> = {},
) {
  const tree = new Map<string, Entry>();
  for (const [path, kind] of Object.entries(entries)) {
    tree.set(win32.resolve(path).toLowerCase(), { kind, size: 1000, mtimeMs: 1 });
  }

  const ran: string[] = [];
  const files: ExecutableFiles = {
    stat(path) {
      const entry = tree.get(win32.resolve(path).toLowerCase());
      if (!entry) {
        return Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
      }

      return Promise.resolve({
        isFile: () => entry.kind === 'file',
        isDirectory: () => entry.kind === 'dir',
        isSymbolicLink: () => entry.kind === 'link',
        size: entry.size!,
        mtimeMs: entry.mtimeMs!,
      });
    },
    list(directory) {
      const prefix = win32.resolve(directory).toLowerCase() + '\\';
      const names = new Set<string>();
      for (const [path] of tree) {
        if (path.startsWith(prefix)) {
          names.add(path.slice(prefix.length).split('\\')[0]!);
        }
      }

      return Promise.resolve([...names]);
    },
    run(executable, args) {
      ran.push([executable, ...args].join(' '));
      const answer = versions[win32.resolve(executable).toLowerCase()];
      if (answer === undefined || answer instanceof CommandFailure) {
        return Promise.reject(answer ?? new CommandFailure('it could not be started'));
      }

      return Promise.resolve(answer);
    },
    hash: (path) => Promise.resolve(hashes[win32.resolve(path).toLowerCase()] ?? 'f'.repeat(64)),
  };

  return { files, ran, tree };
}

const key = (path: string) => win32.resolve(path).toLowerCase();

function options(
  overrides: Partial<LocateExecutableOptions> = {},
  path = '',
): LocateExecutableOptions {
  return {
    environment: {
      values: { PATH: path, LOCALAPPDATA: LOCAL, USERPROFILE: HOME },
      sources: {},
    },
    workspace: WORKSPACE,
    platform: 'win32',
    architecture: 'x64',
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderUnavailableError);

  return error as ProviderUnavailableError;
}

describe('executable discovery', () => {
  it('discovers the Codex desktop app CLI and picks the newest verified build folder', async () => {
    const newer = APP + '\\5449c1f0f26f1f98\\codex.exe';
    const older = APP + '\\57159798136552f4\\codex.exe';
    const { files } = fakeFiles(
      {
        [APP]: 'dir',
        [APP + '\\5449c1f0f26f1f98']: 'dir',
        [APP + '\\57159798136552f4']: 'dir',
        [newer]: 'file',
        [older]: 'file',
      },
      {
        [key(newer)]: 'codex-cli 0.167.0-alpha.3.2\n',
        [key(older)]: 'codex-cli 0.166.1\n',
      },
    );

    await expect(locateExecutable(codexExecutable, options(), files)).resolves.toEqual({
      path: newer,
      source: 'discovered',
      location: 'Codex desktop app',
      version: '0.167.0-alpha.3.2',
    });
  });

  it('never picks an unverified build: a folder whose CLI does not answer is skipped', async () => {
    const broken = APP + '\\aaaa\\codex.exe';
    const working = APP + '\\bbbb\\codex.exe';
    const { files } = fakeFiles(
      {
        [APP + '\\aaaa']: 'dir',
        [APP + '\\bbbb']: 'dir',
        [APP + '\\cccc']: 'link',
        [APP + '\\cccc\\codex.exe']: 'file',
        [broken]: 'file',
        [working]: 'file',
      },
      {
        [key(broken)]: new CommandFailure('it did not answer within 5 s'),
        [key(working)]: 'codex-cli 0.100.0',
        [key(APP + '\\cccc\\codex.exe')]: 'codex-cli 9.0.0',
      },
    );

    await expect(locateExecutable(codexExecutable, options(), files)).resolves.toMatchObject({
      path: working,
      version: '0.100.0',
    });
  });

  it('prefers PATH over install locations, in PATH order, and skips relative and workspace entries', async () => {
    const first = 'C:\\tools\\codex.exe';
    const app = APP + '\\abc\\codex.exe';
    const { files, ran } = fakeFiles(
      {
        [WORKSPACE + '\\bin\\codex.exe']: 'file',
        [first]: 'file',
        ['C:\\other\\codex.exe']: 'file',
        [APP + '\\abc']: 'dir',
        [app]: 'file',
      },
      {
        [key(first)]: 'codex-cli 0.1.0',
        [key('C:\\other\\codex.exe')]: 'codex-cli 0.9.0',
        [key(app)]: 'codex-cli 1.0.0',
      },
    );

    const found = await locateExecutable(
      codexExecutable,
      options({}, `.;bin;${WORKSPACE}\\bin;"C:\\tools";C:\\other`),
      files,
    );

    expect(found).toEqual({ path: first, source: 'path', version: '0.1.0' });
    expect(ran.some((command) => command.startsWith(WORKSPACE))).toBe(false);
  });

  it('resolves an npm launcher on PATH to its package native executable and never runs the launcher', async () => {
    const prefix = HOME + '\\AppData\\Roaming\\npm';
    const native = win32.join(prefix, claudeExecutable.npmPackageExecutables[0]!);
    const { files, ran } = fakeFiles(
      { [prefix + '\\claude.cmd']: 'file', [native]: 'file' },
      { [key(native)]: '2.1.312 (Claude Code)\n' },
    );

    await expect(locateExecutable(claudeExecutable, options({}, prefix), files)).resolves.toEqual({
      path: native,
      source: 'path',
      location: 'npm global package',
      version: '2.1.312',
    });
    expect(ran).toEqual([native + ' --version']);
  });

  it('finds the npm global package through the prefix npm itself reports', async () => {
    const node = 'C:\\Program Files\\nodejs';
    const cli = node + '\\node_modules\\npm\\bin\\npm-cli.js';
    const prefix = 'E:\\npm-global';
    const native = win32.join(prefix, codexExecutable.npmPackageExecutables[1]!);
    const { files, ran } = fakeFiles(
      { [node + '\\node.exe']: 'file', [cli]: 'file', [native]: 'file' },
      {
        [key(node + '\\node.exe')]: prefix + '\r\n',
        [key(native)]: 'codex-cli 0.169.0',
      },
    );

    await expect(locateExecutable(codexExecutable, options({}, node), files)).resolves.toEqual({
      path: native,
      source: 'discovered',
      location: 'npm global package',
      version: '0.169.0',
    });
    expect(ran[0]).toBe(`${node}\\node.exe ${cli} prefix --global`);
  });

  it('uses only the configured executable and reports it, never another candidate', async () => {
    const configured = 'E:\\cli\\agy.exe';
    const installed = LOCAL + '\\agy\\bin\\agy.exe';
    const { files } = fakeFiles(
      { [configured]: 'file', [installed]: 'file' },
      {
        [key(configured)]: new CommandFailure('it exited with code 1'),
        [key(installed)]: '1.3.3',
      },
    );

    const error = await failure(
      locateExecutable(antigravityExecutable, options({ configured }), files),
    );
    expect(error.reasonCode).toBe('EXECUTABLE_NOT_WORKING');
    expect(error.message).toBe(
      'Antigravity at E:\\cli\\agy.exe did not answer `--version`: it exited with code 1.',
    );
    expect(error.executable).toEqual({ path: configured, source: 'configured' });

    const missing = await failure(
      locateExecutable(antigravityExecutable, options({ configured: 'E:\\none\\agy.exe' }), files),
    );
    expect(missing.reasonCode).toBe('EXECUTABLE_NOT_FOUND');
    expect(missing.checkedLocations).toEqual([{ source: 'configured', path: 'E:\\none\\agy.exe' }]);
  });

  it('reports not found with every place it looked', async () => {
    const { files } = fakeFiles({});
    const error = await failure(locateExecutable(codexExecutable, options({}, 'C:\\tools'), files));

    expect(error.reasonCode).toBe('EXECUTABLE_NOT_FOUND');
    expect(error.message).toContain('sessions.providers.codex.executable');
    expect(error.checkedLocations).toEqual([
      { source: 'path', path: 'codex.exe, codex.cmd, codex.bat' },
      {
        source: 'discovered',
        path: APP + '\\*\\codex.exe',
        location: 'Codex desktop app',
      },
    ]);
  });

  it('reports a found version outside the supported range with the range', async () => {
    const installed = HOME + '\\.local\\bin\\claude.exe';
    const { files } = fakeFiles(
      { [installed]: 'file' },
      { [key(installed)]: '1.9.0 (Claude Code)' },
    );
    const error = await failure(
      locateExecutable(claudeExecutable, options({ versions: { minimum: '2.0.0' } }), files),
    );

    expect(error.reasonCode).toBe('VERSION_UNSUPPORTED');
    expect(error.message).toBe(
      `Claude 1.9.0 at ${installed} is outside the supported range >=2.0.0.`,
    );
    expect(error.executable).toMatchObject({ version: '1.9.0', source: 'discovered' });
  });

  it('skips a build the catalogue records as incompatible and reports it when it is the only one', async () => {
    const installed = HOME + '\\.local\\bin\\claude.exe';
    const { files } = fakeFiles(
      { [installed]: 'file' },
      { [key(installed)]: '2.1.0 (Claude Code)' },
      { [key(installed)]: 'a'.repeat(64) },
    );
    const knownIncompatible = vi.fn((build: { sha256: string }) => build.sha256 === 'a'.repeat(64));
    const error = await failure(
      locateExecutable(claudeExecutable, options({ knownIncompatible }), files),
    );

    expect(error.reasonCode).toBe('KNOWN_INCOMPATIBILITY');
  });

  it('refuses platforms the adapters do not implement', async () => {
    const error = await failure(
      locateExecutable(codexExecutable, options({ platform: 'darwin' }), fakeFiles({}).files),
    );

    expect(error.reasonCode).toBe('INSTALLATION_UNAVAILABLE');
  });

  it('keeps a found executable while its file is unchanged and discovers again after an update', async () => {
    const installed = LOCAL + '\\agy\\bin\\agy.exe';
    const { files, ran, tree } = fakeFiles({ [installed]: 'file' }, { [key(installed)]: '1.3.3' });
    const locator = createExecutableLocator(antigravityExecutable, options(), files);

    await locator.resolve(AbortSignal.timeout(1000));
    await locator.resolve(AbortSignal.timeout(1000));
    expect(ran).toHaveLength(1);

    tree.get(key(installed))!.mtimeMs = 2;
    await locator.resolve(AbortSignal.timeout(1000));
    expect(ran).toHaveLength(2);
  });

  it('keeps a failure for 30 seconds, then looks again', async () => {
    let now = 0;
    const installed = LOCAL + '\\agy\\bin\\agy.exe';
    const { files, tree } = fakeFiles({}, { [key(installed)]: '1.3.3' });
    const locator = createExecutableLocator(antigravityExecutable, options(), files, () => now);

    await failure(locator.resolve(AbortSignal.timeout(1000)));
    tree.set(key(installed), { kind: 'file', size: 1, mtimeMs: 1 });
    await failure(locator.resolve(AbortSignal.timeout(1000)));
    now = 30001;
    await expect(locator.resolve(AbortSignal.timeout(1000))).resolves.toMatchObject({
      version: '1.3.3',
    });
  });
});

describe('executable catalogue facts', () => {
  it('gives the sign-in command as the user can type it', () => {
    expect(signInCommand(codexExecutable)).toBe('codex login');
    expect(
      signInCommand(codexExecutable, {
        path: APP + '\\abc\\codex.exe',
        source: 'discovered',
        version: '1.0.0',
      }),
    ).toBe(APP + '\\abc\\codex.exe login');
    expect(
      signInCommand(claudeExecutable, {
        path: 'C:\\Program Files\\Claude\\claude.exe',
        source: 'configured',
        version: '2.0.0',
      }),
    ).toBe('& "C:\\Program Files\\Claude\\claude.exe" auth login');
  });

  it('keeps the resolved executable after a later failure of that executable', () => {
    const resolution = { path: 'C:\\tools\\agy.exe', source: 'path' as const, version: '1.0.0' };

    expect(executableFields(antigravityExecutable, resolution, new Error('probe'))).toEqual({
      executable: resolution,
      signInCommand: 'agy',
    });
  });
});

describe('version precedence', () => {
  it('orders releases, prereleases and numeric identifiers', () => {
    const sorted = [
      '1.0.0',
      '1.0.0-alpha.10',
      '0.9.9',
      '1.0.0-alpha.2',
      '1.0.0-beta',
      '1.0.1',
    ].sort(compareVersions);

    expect(sorted).toEqual([
      '0.9.9',
      '1.0.0-alpha.2',
      '1.0.0-alpha.10',
      '1.0.0-beta',
      '1.0.0',
      '1.0.1',
    ]);
  });
});
