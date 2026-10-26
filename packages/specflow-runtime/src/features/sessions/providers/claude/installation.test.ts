import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectClaudeInstallation } from './installation';
import type { ProviderEnvironment } from '../process';
import { bundledClaudeBuild } from '../compatibility/catalogue';

function fixture() {
  const home = resolve('certified-home');
  const executable = join(home, '.local', 'bin', 'claude.exe');
  const configPath = join(home, '.claude.json');
  const credentialsPath = join(home, '.claude', '.credentials.json');
  const config: Record<string, unknown> = {
    oauthAccount: { accountUuid: 'b6d81fa6-d1fc-4841-8241-bc1ae33cbb1f' },
  };
  const oauth: Record<string, unknown> = {
    subscriptionType: 'pro',
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: 10000000,
    scopes: ['user:inference'],
  };
  const present = new Set<string>();
  let hash = bundledClaudeBuild.sha256;
  let registryAbsent = true;
  let denied: string | undefined;
  let linked: string | undefined;
  let platform: NodeJS.Platform = 'win32';
  const environment: ProviderEnvironment = {
    values: { USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming') },
    sources: {},
  };
  const run = () =>
    inspectClaudeInstallation(
      { executable, workspace: home, environment, signal: new AbortController().signal },
      {
        platform,
        now: () => 1000,
        registryAbsent: () => Promise.resolve(registryAbsent),
        files: {
          stat(path) {
            if (path === denied)
              return Promise.reject(
                Object.assign(new Error('Private path details'), { code: 'EACCES' }),
              );
            if (
              ![executable, configPath, credentialsPath, join(home, '.claude')].includes(path) &&
              !present.has(path)
            )
              return Promise.reject(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
            return Promise.resolve({
              isFile: () => path !== join(home, '.claude'),
              isDirectory: () => path === join(home, '.claude'),
              isSymbolicLink: () => path === linked,
              size: 100,
            });
          },
          read: (path) =>
            Promise.resolve(
              Buffer.from(JSON.stringify(path === configPath ? config : { claudeAiOauth: oauth })),
            ),
          hash: () => Promise.resolve(hash),
        },
      },
    );
  return {
    run,
    home,
    configPath,
    credentialsPath,
    config,
    oauth,
    present,
    environment,
    setHash: (value: string) => {
      hash = value;
    },
    setRegistry: (value: boolean) => {
      registryAbsent = value;
    },
    setDenied: (value: string) => {
      denied = value;
    },
    setLinked: (value: string) => {
      linked = value;
    },
    setPlatform: (value: NodeJS.Platform) => {
      platform = value;
    },
  };
}
describe('Claude installation and policy inspection', () => {
  it('accepts a changed valid fingerprint while rechecking policy and account binding', async () => {
    const f = fixture();
    const before = await f.run();
    f.setHash('a'.repeat(64));
    const changed = await f.run();
    expect(changed.sha256).toBe('a'.repeat(64));
    expect(changed.fingerprint).not.toBe(before.fingerprint);
    expect(changed.accountScope).toBe(before.accountScope);
    f.setRegistry(false);
    await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
  it('fingerprints the native binary and checks personal inference OAuth, returning an opaque account binding', async () => {
    const f = fixture();
    const value = await f.run();
    expect(value.sha256).toBe(bundledClaudeBuild.sha256);
    expect(value.accountScope).toMatch(/^[0-9a-f]{64}$/);
    expect(value.secrets).toEqual(['private-access', 'private-refresh']);
    expect(value.accountScope).not.toContain('b6d81fa6');
  });
  it.each(['team', 'enterprise', null, 'unknown'])(
    'refuses subscription %s without executing the provider',
    async (subscription) => {
      const f = fixture();
      f.oauth.subscriptionType = subscription;
      await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
    },
  );
  it('rejects malformed fingerprints, unsupported platforms, denied reads and links', async () => {
    const changed = fixture();
    changed.setHash('other');
    await expect(changed.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const linux = fixture();
    linux.setPlatform('linux');
    await expect(linux.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const denied = fixture();
    denied.setDenied(denied.credentialsPath);
    await expect(denied.run()).rejects.toThrow('outside the supported');
    const linked = fixture();
    linked.setLinked(linked.configPath);
    await expect(linked.run()).rejects.toThrow('outside the supported');
  });
  it.each(['managed-settings.json', 'managed-settings.d', 'managed-mcp.json'])(
    'rejects any %s policy source',
    async (name) => {
      const f = fixture();
      f.present.add(join('C:\\Program Files\\ClaudeCode', name));
      await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    },
  );
  it.each(['remote-settings.json', '.config.json'])(
    'rejects policy cache or alternate config %s',
    async (name) => {
      const f = fixture();
      f.present.add(join(f.home, '.claude', name));
      await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    },
  );
  it('refuses registry uncertainty, profile credentials, stored API key and Credman backend', async () => {
    const registry = fixture();
    registry.setRegistry(false);
    await expect(registry.run()).rejects.toThrow('outside the supported');
    const profile = fixture();
    profile.present.add(join(profile.home, 'AppData', 'Roaming', 'Anthropic'));
    await expect(profile.run()).rejects.toThrow('outside the supported');
    const apiKey = fixture();
    apiKey.config.primaryApiKey = 'private-key';
    await expect(apiKey.run()).rejects.toThrow('outside the supported');
    const credman = fixture();
    credman.config.cachedGrowthBookFeatures = { tengu_windows_credman: true };
    await expect(credman.run()).rejects.toThrow('outside the supported');
  });
  it('refuses expired credentials, missing inference scope and all non-platform environment inputs', async () => {
    const expired = fixture();
    expired.oauth.expiresAt = 1000;
    await expect(expired.run()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
    const scope = fixture();
    scope.oauth.scopes = ['user:profile'];
    await expect(scope.run()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
    const env = fixture();
    Object.assign(env.environment.values, { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/other' });
    await expect(env.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
