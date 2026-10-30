import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SessionError } from '../../errors';
import { projectProviderEnvironment } from '../process';
import { inspectAntigravityAccount } from './credentials';

function unavailable(): never {
  throw new SessionError(
    'PROVIDER_UNAVAILABLE',
    'Antigravity installation or private configuration is unavailable.',
  );
}

function inside(root: string, target: string) {
  const path = relative(root, target);

  return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path));
}

async function absent(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    unavailable();
  }

  unavailable();
}

/** The CLI creates this inert default project after a Turn. Additional projects
 * or project resources can alter execution configuration and remain unsupported. */
async function validateNativeProjects(directory: string) {
  let stat;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }

  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    unavailable();
  }

  const entries = await readdir(directory);
  if (entries.length > 1 || entries.some((entry) => entry !== 'default-cli-project.json')) {
    unavailable();
  }

  if (!entries.length) {
    return;
  }

  const path = join(directory, 'default-cli-project.json');
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 4096) {
    unavailable();
  }

  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text) > 4096) {
    unavailable();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    unavailable();
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    unavailable();
  }

  const project = value as Record<string, unknown>;
  if (
    Object.keys(project).sort().join(',') !== 'id,name,projectResources' ||
    project.id !== 'default-cli-project' ||
    typeof project.name !== 'string' ||
    Buffer.byteLength(project.name) > 256 ||
    !project.projectResources ||
    typeof project.projectResources !== 'object' ||
    Array.isArray(project.projectResources) ||
    Object.keys(project.projectResources).length !== 0
  ) {
    unavailable();
  }
}

async function outsideWorkspace(workspace: string, target: string) {
  const nativeWorkspace = await realpath(workspace);
  let ancestor = resolve(target);
  for (;;) {
    try {
      const physical = resolve(await realpath(ancestor), relative(ancestor, target));
      if (inside(nativeWorkspace, physical)) {
        unavailable();
      }

      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(ancestor) === ancestor) {
        throw error;
      }

      ancestor = dirname(ancestor);
    }
  }
}

export async function inspectAntigravityInstallation(
  options: { workspace: string; homeRoot: string; executable?: string; signal: AbortSignal },
  dependencies: {
    account?: typeof inspectAntigravityAccount;
    platform?: string;
    architecture?: string;
    host?: Readonly<Record<string, string | undefined>>;
  } = {},
) {
  options.signal.throwIfAborted();
  const platform = dependencies.platform ?? process.platform;
  const architecture = dependencies.architecture ?? process.arch;
  if (
    platform !== 'win32' ||
    architecture !== 'x64' ||
    !isAbsolute(options.workspace) ||
    !isAbsolute(options.homeRoot)
  ) {
    unavailable();
  }

  await outsideWorkspace(options.workspace, options.homeRoot);

  const host = dependencies.host ?? process.env;
  const local = host.LOCALAPPDATA;
  const executable = options.executable ?? (local ? join(local, 'agy', 'bin', 'agy.exe') : '');
  if (!isAbsolute(executable)) {
    unavailable();
  }

  const stat = await lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 512 * 1024 * 1024) {
    unavailable();
  }

  const hash = createHash('sha256');
  let bytes = 0;
  for await (const piece of createReadStream(executable, { signal: options.signal })) {
    if (!Buffer.isBuffer(piece)) {
      unavailable();
    }

    bytes += piece.length;
    if (bytes > 512 * 1024 * 1024) {
      unavailable();
    }

    hash.update(piece);
  }

  for (const path of ['hooks.json', 'mcp_config.json', 'plugins', 'sidecars', 'projects']) {
    await absent(join(options.workspace, '.agents', path));
  }

  const account = await (dependencies.account ?? inspectAntigravityAccount)({
    signal: options.signal,
  });
  const sha256 = hash.digest('hex');
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        sha256,
        account.accountScope,
        resolve(options.workspace),
        'antigravity-profile-v1',
      ]),
    )
    .digest('hex');
  options.signal.throwIfAborted();

  return {
    ...account,
    executable,
    sha256,
    fingerprint,
    platform,
    architecture,
    host,
    workspace: options.workspace,
    homeRoot: options.homeRoot,
  };
}

export type AntigravityInstallation = Awaited<ReturnType<typeof inspectAntigravityInstallation>>;

/** Private native history survives Turns and Runtime restart. Only invocation
 * configuration is replaced; no credential is copied or independently refreshed. */
export async function prepareAntigravityProfile(
  installation: AntigravityInstallation,
  options: {
    /** An invocation scope under homeRoot, used for disposable no-input discovery. */
    home?: string;
    mcp?: { mcpServers: Record<string, unknown> };
    permissionRule?: string;
    hooks?: Record<string, unknown>;
  } = {},
) {
  const suffix = createHash('sha256').update(installation.accountScope).digest('base64url');
  const home = options.home ?? join(installation.homeRoot, 'account-' + suffix);
  if (
    !isAbsolute(home) ||
    home.length >= 260 ||
    !inside(resolve(installation.homeRoot), resolve(home)) ||
    resolve(home) === resolve(installation.homeRoot)
  ) {
    unavailable();
  }

  await outsideWorkspace(installation.workspace, home);
  await mkdir(home, { recursive: true, mode: 0o700 });
  const homeStat = await lstat(home);
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink()) {
    unavailable();
  }

  const physicalHome = await realpath(home);
  const nativeWorkspace = await realpath(installation.workspace);
  const physicalRoot = await realpath(installation.homeRoot);
  if (inside(nativeWorkspace, physicalHome) || !inside(physicalRoot, physicalHome)) {
    unavailable();
  }

  const marker = join(home, '.specflow-profile.json');
  const binding = JSON.stringify({
    version: 1,
    accountScope: installation.accountScope,
    workspace: nativeWorkspace,
  });
  try {
    await writeFile(marker, binding, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    const stat = await lstat(marker);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 4096 ||
      (await readFile(marker, 'utf8')) !== binding
    ) {
      unavailable();
    }
  }

  const config = join(home, '.gemini', 'config');
  const cli = join(home, '.gemini', 'antigravity-cli');
  const temporary = join(home, 'tmp');
  // Validate each parent before creating or writing any of its children.
  for (const directory of [join(home, '.gemini'), config, cli, temporary]) {
    await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !inside(physicalHome, await realpath(directory))
    ) {
      unavailable();
    }
  }

  for (const path of ['plugins', 'sidecars']) {
    await absent(join(config, path));
  }

  await validateNativeProjects(join(config, 'projects'));

  // This adapter binds the exact consumer keyring source. A native fallback
  // file or cached keyring failure must not select a different authentication
  // source underneath that binding.
  await absent(join(home, '.gemini', 'jetski-standalone-oauth-token'));
  for (const directory of [config, cli]) {
    await absent(join(directory, 'antigravity-oauth-token'));
    await absent(join(directory, 'cache', 'antigravity-keyring-unavailable'));
  }

  async function json(path: string, value: unknown) {
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        unavailable();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const temporary = path + '.' + randomUUID();
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  }

  await json(join(cli, 'settings.json'), {
    toolPermission: 'proceed-in-sandbox',
    allowNonWorkspaceAccess: false,
    enableTerminalSandbox: true,
    useG1Credits: false,
    permissions: { allow: options.permissionRule ? [options.permissionRule] : [] },
    trustedWorkspaces: [installation.workspace],
  });
  await json(join(config, 'mcp_config.json'), options.mcp ?? { mcpServers: {} });
  await json(join(config, 'hooks.json'), options.hooks ?? {});

  return {
    home,
    environment: projectProviderEnvironment({
      host: installation.host,
      platform: 'win32',
      configured: {
        USERPROFILE: home,
        HOME: home,
        APPDATA: join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(home, 'AppData', 'Local'),
        TEMP: temporary,
        TMP: temporary,
        NO_COLOR: '1',
        AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
      },
    }),
  };
}
