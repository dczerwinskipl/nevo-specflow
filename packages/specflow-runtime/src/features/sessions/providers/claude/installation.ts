import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, isAbsolute } from 'node:path';
import type { ProviderEnvironment } from '../process';
import { SessionError } from '../../errors';

import { inspectClaudeRegistry } from './registry';

interface Files {
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
  }>;
  read(path: string): Promise<Buffer>;
  hash(path: string): Promise<string>;
}
const files: Files = {
  stat: lstat,
  read: readFile,
  async hash(path) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path)) {
      bytes += (chunk as Buffer).length;
      if (bytes > 512 * 1024 * 1024) throw new Error('Executable exceeds certification budget.');
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  },
};
function unavailable(): never {
  throw new SessionError(
    'PROVIDER_UNAVAILABLE',
    'Claude installation, authentication source or managed policy is outside the supported read-only configuration.',
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  return value as Record<string, unknown>;
}

/** No provider execution before these checks. Dependencies are explicit for policy
 * tests; production always uses native file inspection and the fixed registry helper.
 * Never return credentials or native account metadata to a descriptor or diagnostics.
 */
export async function inspectClaudeInstallation(
  options: {
    executable?: string;
    workspace: string;
    environment: ProviderEnvironment;
    signal: AbortSignal;
  },
  dependencies: {
    platform?: NodeJS.Platform;
    files?: Files;
    registryAbsent?: () => Promise<boolean>;
    now?: () => number;
  } = {},
) {
  const io = dependencies.files ?? files;
  if ((dependencies.platform ?? process.platform) !== 'win32') unavailable();
  const env = options.environment.values;
  const home = env.USERPROFILE;
  if (!home || !isAbsolute(home) || !isAbsolute(options.workspace)) unavailable();
  // This adapter supports only the default first-party OAuth source. Unknown
  // additions must not accidentally enable a helper, gateway, alternate profile or FD auth.
  if (
    Object.keys(env).some(
      (key) =>
        ![
          'PATH',
          'PATHEXT',
          'SYSTEMROOT',
          'WINDIR',
          'USERPROFILE',
          'APPDATA',
          'LOCALAPPDATA',
          'TEMP',
          'TMP',
        ].includes(key),
    )
  )
    unavailable();
  const executable = options.executable ?? join(home, '.local', 'bin', 'claude.exe');
  if (!isAbsolute(executable)) unavailable();
  async function absent(path: string) {
    try {
      await io.stat(path);
      return unavailable();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') unavailable();
    }
  }
  async function regular(path: string, max: number) {
    const stat = await io.stat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) unavailable();
  }
  async function json(path: string) {
    await regular(path, 256 * 1024);
    const bytes = await io.read(path);
    if (bytes.length > 256 * 1024) unavailable();
    return record(JSON.parse(bytes.toString('utf8')));
  }
  try {
    options.signal.throwIfAborted();
    await regular(executable, 512 * 1024 * 1024);
    const sha256 = await io.hash(executable);
    if (!/^[a-f0-9]{64}$/.test(sha256)) unavailable();
    const configDirectory = join(home, '.claude');
    const directory = await io.stat(configDirectory);
    if (!directory.isDirectory() || directory.isSymbolicLink()) unavailable();
    const managed = 'C:\\Program Files\\ClaudeCode';
    try {
      const parent = await io.stat(managed);
      if (!parent.isDirectory() || parent.isSymbolicLink()) unavailable();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') unavailable();
    }
    for (const path of [
      join(managed, 'managed-settings.json'),
      join(managed, 'managed-settings.d'),
      join(managed, 'managed-mcp.json'),
      join(configDirectory, 'remote-settings.json'),
      join(configDirectory, '.config.json'),
      join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Anthropic'),
      resolve(options.workspace, '/home/claude/.claude/remote/.api_key'),
      resolve(options.workspace, '/home/claude/.claude/remote/.oauth_token'),
    ])
      await absent(path);
    if (!(await (dependencies.registryAbsent?.() ?? inspectClaudeRegistry(options.environment))))
      unavailable();
    const config = await json(join(home, '.claude.json'));
    if (config.primaryApiKey != null && config.primaryApiKey !== '') unavailable();
    if (record(config.cachedGrowthBookFeatures ?? {}).tengu_windows_credman === true) unavailable();
    const account = record(config.oauthAccount);
    if (typeof account.accountUuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(account.accountUuid))
      unavailable();
    const credentials = record(
      (await json(join(configDirectory, '.credentials.json'))).claudeAiOauth,
    );
    if (
      (credentials.subscriptionType !== 'pro' && credentials.subscriptionType !== 'max') ||
      typeof credentials.accessToken !== 'string' ||
      !credentials.accessToken ||
      credentials.accessToken.length > 32768 ||
      typeof credentials.expiresAt !== 'number' ||
      credentials.expiresAt <= (dependencies.now?.() ?? Date.now()) + 60000 ||
      !Array.isArray(credentials.scopes) ||
      !credentials.scopes.includes('user:inference')
    )
      throw new SessionError(
        'PROVIDER_AUTH_REQUIRED',
        'Claude requires an active personal Pro or Max CLI login for this supported configuration.',
      );
    options.signal.throwIfAborted();
    return {
      executable,
      sha256,
      platform: 'win32' as const,
      architecture: 'x64' as const,
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            executable,
            sha256,
            account: account.accountUuid,
            authentication: {
              subscriptionType: credentials.subscriptionType,
              scopes: credentials.scopes,
            },
            environment: env,
            workspace: options.workspace,
            protocolProfile: 'claude-stream-json-v1',
          }),
        )
        .digest('hex'),
      accountScope: createHash('sha256').update(account.accountUuid).digest('hex'),
      secrets: [
        credentials.accessToken,
        ...(typeof credentials.refreshToken === 'string' ? [credentials.refreshToken] : []),
      ],
    };
  } catch (error) {
    if (error instanceof SessionError) throw error;
    return unavailable();
  }
}
