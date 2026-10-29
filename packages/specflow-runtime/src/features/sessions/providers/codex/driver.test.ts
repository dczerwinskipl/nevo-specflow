import { expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { SessionError } from '../../errors';
import { createCodexDriver } from './driver';
import { codexArguments } from './installation';

function fixture(options: { write?: boolean; managed?: boolean; modes?: string[] } = {}) {
  let fingerprint = 'a'.repeat(64);
  const installation = () => ({
    executable: resolve('codex.exe'),
    home: resolve('private-native-home'),
    accountScope: 'account-scope',
    authenticationFingerprint: 'synthetic-login',
    secrets: [],
    environment: { values: {}, sources: {} },
    sha256: fingerprint,
    fingerprint,
    version: '9.0.0',
    platform: 'win32' as const,
    architecture: 'x64' as const,
  });
  const inspect = vi.fn(() => Promise.resolve(installation()));
  const probe = vi.fn(() =>
    Promise.resolve({
      models: [{ modelId: 'native-model', title: 'Native', efforts: ['low'] }],
      modes: options.modes ?? ['default', 'plan'],
      boundary: { readOnly: true, write: options.write !== false },
    }),
  );
  const driver = createCodexDriver(
    {
      workspace: resolve('workspace'),
      temporaryRoot: resolve('temporary'),
      homeRoot: resolve('private-native-home'),
      managedWrites: options.managed !== false,
    },
    { inspect, probe },
  );

  return {
    driver,
    probe,
    inspect,
    update() {
      fingerprint = 'b'.repeat(64);
    },
  };
}

const signal = () => new AbortController().signal;
it('admits an unpinned future version provisionally with native Agent as its default', async () => {
  const f = fixture();
  const descriptor = await f.driver.refresh!(signal());
  expect(descriptor).toMatchObject({
    readiness: 'ready',
    defaultModeId: 'default',
    compatibility: { classification: 'provisional', version: '9.0.0' },
  });
  expect(descriptor.providerModes).toContainEqual({
    modeId: 'default',
    nativeMode: 'default',
    title: 'Agent',
    mode: 'workspace-write',
    compatibility: 'provisional',
    readiness: 'ready',
  });
  await f.driver.validate({
    providerId: 'codex',
    mode: 'workspace-write',
    modelId: 'native-model',
    effort: 'low',
  });
  expect(f.driver.contextScope!()).toBe('account-scope');
  expect(JSON.stringify(f.driver.describe())).not.toContain('private-native-home');
  expect(f.probe).toHaveBeenCalledOnce();
  f.update();
  await f.driver.validate({ providerId: 'codex', mode: 'workspace-write' });
  expect(f.probe).toHaveBeenCalledTimes(2);
});
it.each([{ write: false }, { managed: false }, { modes: ['plan'] }])(
  'refuses an unavailable writer without substituting Plan: %j',
  async (options) => {
    const f = fixture(options);
    await expect(
      f.driver.validate({ providerId: 'codex', mode: 'workspace-write' }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    await expect(
      f.driver.validate({ providerId: 'codex', mode: 'read-only', providerModeId: 'plan' }),
    ).resolves.toBeUndefined();
  },
);
it('revalidates model/effort and never invents a model for an effort-only override', async () => {
  const f = fixture();
  await expect(
    f.driver.validate({ providerId: 'codex', mode: 'workspace-write', effort: 'low' }),
  ).rejects.toMatchObject({ code: 'MODEL_UNSUPPORTED' });
  await expect(
    f.driver.validate({
      providerId: 'codex',
      mode: 'workspace-write',
      modelId: 'native-model',
      effort: 'unknown',
    }),
  ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  f.inspect.mockRejectedValue(
    new SessionError('PROVIDER_AUTH_REQUIRED', 'External CLI login must be renewed.'),
  );
  expect(await f.driver.refresh!(signal())).toMatchObject({
    readiness: 'authenticationRequired',
    models: [],
  });
});
it('keeps native execution restrictions and dotted Windows paths as literal arguments', () => {
  const workspace = 'C:\\repo.with.dots\\.nevo\\workspace';
  const args = codexArguments(workspace, false, { providerId: 'codex', mode: 'workspace-write' });
  expect(args).toContain('projects={' + JSON.stringify(workspace) + '={trust_level="untrusted"}}');
  expect(args).toContain('windows.sandbox="unelevated"');
  expect(args).toContain('skills.bundled.enabled=false');
  expect(args).toContain('sandbox_workspace_write.network_access=false');
  expect(args).not.toContain('danger-full-access');
});
