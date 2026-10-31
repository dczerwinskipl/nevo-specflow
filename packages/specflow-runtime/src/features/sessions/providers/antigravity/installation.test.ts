import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { inspectAntigravityInstallation, prepareAntigravityProfile } from './installation';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'specflow-agy-installation-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const homeRoot = join(root, 'private');
  const executable = join(root, 'controlled-agy.exe');
  await mkdir(workspace);
  await writeFile(executable, 'controlled executable identity, never executed');
  let accountScope = 'synthetic-account-one';
  let authenticationFingerprint = 'synthetic-access-one';
  const inspect = (overrides: Partial<Parameters<typeof inspectAntigravityInstallation>[0]> = {}) =>
    inspectAntigravityInstallation(
      { workspace, homeRoot, executable, signal: new AbortController().signal, ...overrides },
      {
        platform: 'win32',
        architecture: 'x64',
        host: { PATH: '/synthetic/path', GOOGLE_API_KEY: 'synthetic-key', HOME: root },
        account: () =>
          Promise.resolve({
            accountScope,
            authenticationFingerprint,
            source: 'windows-keyring',
            authenticationMode: 'consumer',
          }),
      },
    );

  return {
    root,
    workspace,
    homeRoot,
    executable,
    inspect,
    rotateToken() {
      authenticationFingerprint = 'synthetic-access-two';
    },
    switchAccount() {
      accountScope = 'synthetic-account-two';
    },
  };
}

describe('Antigravity private native profile', () => {
  it('rejects a private root inside the workspace during discovery', async () => {
    const test = await fixture();
    await expect(test.inspect({ homeRoot: join(test.workspace, 'private') })).rejects.toMatchObject(
      { code: 'PROVIDER_UNAVAILABLE' },
    );
  });

  it('retains the inert CLI-created project but rejects executable resources and other projects', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    const profile = await prepareAntigravityProfile(installation);
    const projects = join(profile.home, '.gemini', 'config', 'projects');
    await mkdir(projects);
    const file = join(projects, 'default-cli-project.json');
    const project = {
      id: 'default-cli-project',
      name: 'Native default project',
      projectResources: {},
    };
    await writeFile(file, JSON.stringify(project));
    expect((await prepareAntigravityProfile(installation)).home).toBe(profile.home);
    await writeFile(file, '{invalid');
    await expect(prepareAntigravityProfile(installation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    await writeFile(file, JSON.stringify({ ...project, unexpected: true }));
    await expect(prepareAntigravityProfile(installation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    await writeFile(file, JSON.stringify({ ...project, projectResources: { hooks: {} } }));
    await expect(prepareAntigravityProfile(installation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    await writeFile(file, JSON.stringify(project));
    await writeFile(join(projects, 'external-project.json'), '{}');
    await expect(prepareAntigravityProfile(installation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('retains native history across token rotation and separates another account', async () => {
    const test = await fixture();
    const first = await test.inspect();
    const profile = await prepareAntigravityProfile(first);
    expect(basename(profile.home)).toMatch(/^account-[A-Za-z0-9_-]{43}$/);
    const history = join(profile.home, '.gemini', 'antigravity-cli', 'native-history');
    await writeFile(history, 'native context');
    test.rotateToken();
    const rotated = await test.inspect();
    expect(rotated.fingerprint).toBe(first.fingerprint);
    expect(rotated.authenticationFingerprint).not.toBe(first.authenticationFingerprint);
    expect((await prepareAntigravityProfile(rotated)).home).toBe(profile.home);
    expect(await readFile(history, 'utf8')).toBe('native context');
    test.switchAccount();
    expect((await prepareAntigravityProfile(await test.inspect())).home).not.toBe(profile.home);
    expect(profile.environment.values.GOOGLE_API_KEY).toBeUndefined();
    expect(profile.environment.values.HOME).toBe(profile.home);
  });

  it('rejects workspace hooks before preparing a native profile', async () => {
    const test = await fixture();
    await mkdir(join(test.workspace, '.agents'));
    await writeFile(join(test.workspace, '.agents', 'hooks.json'), '{}');
    await expect(test.inspect()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('detects executable changes without executing the fixture', async () => {
    const test = await fixture();
    const first = await test.inspect();
    await writeFile(test.executable, 'different controlled executable');
    expect((await test.inspect()).fingerprint).not.toBe(first.fingerprint);
  });

  it('rejects a mismatched private profile binding', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    const profile = await prepareAntigravityProfile(installation);
    await writeFile(join(profile.home, '.specflow-profile.json'), '{}');
    await expect(prepareAntigravityProfile(installation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects a linked configuration parent before touching its target', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    const home = join(test.homeRoot, 'discovery');
    const target = join(test.root, 'global-configuration');
    await mkdir(home, { recursive: true });
    await mkdir(target);
    await writeFile(join(target, 'sentinel'), 'untouched');
    await symlink(target, join(home, '.gemini'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(prepareAntigravityProfile(installation, { home })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    await expect(readFile(join(target, 'config', 'hooks.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(join(target, 'sentinel'), 'utf8')).toBe('untouched');
  });

  it('rejects a private home inside the admitted workspace before writing', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    await expect(
      prepareAntigravityProfile({ ...installation, homeRoot: test.workspace }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('rejects profiles exceeding the native Windows HOME limit before creating them', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    await expect(
      prepareAntigravityProfile(installation, {
        home: join(installation.homeRoot, 'x'.repeat(240)),
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
  it('accounts for generated configuration and atomic temporary filenames before creating HOME', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    const home = join(installation.homeRoot, 'x'.repeat(220 - installation.homeRoot.length));
    expect(home.length).toBeLessThan(260);
    await expect(prepareAntigravityProfile(installation, { home })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    await expect(lstat(home)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('supports a realistic long session HOME with bounded sibling temporary filenames', async () => {
    const test = await fixture();
    const installation = await test.inspect();
    const prefix = join(installation.homeRoot, '');
    const home = join(prefix, 'x'.repeat(198 - prefix.length - 1));
    expect(home.length).toBe(198);
    const profile = await prepareAntigravityProfile(installation, { home });
    expect(profile.home).toBe(home);
    expect(
      JSON.parse(await readFile(join(home, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8')),
    ).toMatchObject({ toolPermission: 'proceed-in-sandbox' });
  });
});
