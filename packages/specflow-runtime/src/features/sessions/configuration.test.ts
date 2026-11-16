import { describe, expect, it } from 'vitest';
import { parseSessionsFeatureConfig } from './configuration';

const allowAll = {
  enabled: true,
  providers: {
    mock: { allowed: true },
    claude: { allowed: true },
    codex: { allowed: true },
    antigravity: { allowed: true },
  },
};

describe('Session configuration: project policy and workstation enablement', () => {
  it('is disabled without a project section or project enablement', () => {
    const disabled = { enabled: false, providers: { mock: { enabled: false } } };
    expect(parseSessionsFeatureConfig({ project: undefined })).toEqual(disabled);
    expect(
      parseSessionsFeatureConfig({
        project: { providers: { claude: { allowed: true } } },
        local: { providers: { claude: { enabled: true } } },
      }),
    ).toEqual(disabled);
  });

  it('enables an allowed provider when the workstation says nothing, and lists the rest', () => {
    expect(
      parseSessionsFeatureConfig({
        project: { enabled: true, providers: { claude: { allowed: true } } },
      }),
    ).toEqual({
      enabled: true,
      providers: { mock: { enabled: false }, claude: { enabled: true } },
      withheld: [
        { providerId: 'codex', reason: 'not-allowed' },
        { providerId: 'antigravity', reason: 'not-allowed' },
      ],
    });
  });

  it('composes the workstation opt-out and executable with project policy', () => {
    expect(
      parseSessionsFeatureConfig({
        project: allowAll,
        local: {
          providers: {
            mock: { enabled: false },
            claude: { executable: '/opt/claude/claude' },
            codex: { enabled: false, executable: '/opt/codex/codex' },
          },
        },
      }),
    ).toEqual({
      enabled: true,
      providers: {
        mock: { enabled: false },
        claude: { enabled: true, executable: '/opt/claude/claude' },
        codex: { enabled: false, executable: '/opt/codex/codex' },
        antigravity: { enabled: true },
      },
      withheld: [
        { providerId: 'mock', reason: 'not-enabled' },
        { providerId: 'codex', reason: 'not-enabled' },
      ],
    });
  });

  it('loads disabled while the project disables Sessions, with local opt-outs and paths', () => {
    expect(
      parseSessionsFeatureConfig({
        project: { enabled: false, providers: { claude: { allowed: true } } },
        local: { providers: { claude: { enabled: false, executable: '/opt/claude/claude' } } },
      }),
    ).toEqual({ enabled: false, providers: { mock: { enabled: false } } });
  });

  it('reports a provider the project does not allow as not allowed, even when turned off locally', () => {
    expect(
      parseSessionsFeatureConfig({
        project: { enabled: true, providers: { claude: { allowed: true } } },
        local: { providers: { codex: { enabled: false } } },
      }).withheld,
    ).toContainEqual({ providerId: 'codex', reason: 'not-allowed' });
  });

  it.each([
    [
      'a local executable of a provider the project does not allow',
      {
        project: { enabled: true, providers: { claude: { allowed: true } } },
        local: { providers: { codex: { executable: '/opt/codex/codex' } } },
      },
      /sessions\.providers\.codex\.executable in \.nevo\/local\/config\.yaml configures a provider the project does not allow/u,
    ],
    [
      'the former project enablement, with how to migrate',
      { project: { enabled: true, providers: { claude: { enabled: true } } } },
      /sessions\.providers\.claude\.enabled is no longer a project setting.*Replace 'enabled' with 'allowed'/u,
    ],
    [
      'an executable in project config',
      { project: { enabled: true, providers: { codex: { allowed: true, executable: '/x' } } } },
      /sessions\.providers\.codex\.executable is a workstation path.*\.nevo\/local\/config\.yaml/u,
    ],
    [
      'local feature enablement',
      { project: allowAll, local: { enabled: true } },
      /sessions\.enabled is project policy/u,
    ],
    [
      'local provider policy',
      { project: allowAll, local: { providers: { claude: { allowed: true } } } },
      /sessions\.providers\.claude\.allowed is project policy/u,
    ],
    [
      'a local enablement of a provider the project does not allow',
      {
        project: { enabled: true, providers: { claude: { allowed: true } } },
        local: { providers: { codex: { enabled: true } } },
      },
      /enables a provider the project does not allow/u,
    ],
    [
      'a local mock enablement the project does not allow',
      { project: { enabled: true }, local: { providers: { mock: { enabled: true } } } },
      /enables a provider the project does not allow/u,
    ],
  ])('refuses %s', (_name, documents, error) => {
    expect(() => parseSessionsFeatureConfig(documents)).toThrow(error);
  });

  it('rejects misspelled providers, keys and untyped values', () => {
    for (const documents of [
      { project: { enable: true } },
      { project: { enabled: 'true' } },
      { project: { providers: { cluade: { allowed: true } } } },
      { project: { providers: { claude: { allowed: 'true' } } } },
      { project: { providers: { claude: { allowUnsafe: true } } } },
      { project: allowAll, local: { providers: { claude: { enabled: 'true' } } } },
      { project: allowAll, local: { providers: { claude: { executable: 'claude' } } } },
      { project: allowAll, local: { providers: { mock: { executable: '/x' } } } },
      { project: allowAll, local: { providers: { codex: { allowUnsafe: true } } } },
      { project: allowAll, local: { providerz: {} } },
    ]) {
      expect(() => parseSessionsFeatureConfig(documents)).toThrow();
    }
  });

  it('never lets local configuration widen project policy', () => {
    const choices = [true, false, undefined] as const;
    for (const providerId of ['mock', 'claude', 'codex', 'antigravity'] as const) {
      for (const feature of choices) {
        for (const allowed of choices) {
          for (const enabled of choices) {
            const documents = {
              project: {
                ...(feature === undefined ? {} : { enabled: feature }),
                providers: { [providerId]: allowed === undefined ? {} : { allowed } },
              },
              local: {
                providers: { [providerId]: enabled === undefined ? {} : { enabled } },
              },
            };
            if (enabled === true && allowed !== true) {
              expect(() => parseSessionsFeatureConfig(documents)).toThrow(/does not allow/u);
              continue;
            }

            const config = parseSessionsFeatureConfig(documents);
            const effective = config.providers[providerId]?.enabled === true;
            expect(effective).toBe(feature === true && allowed === true && enabled !== false);
            // A provider is either run or withheld, never both (one reason per catalogue entry).
            const withheld = config.withheld?.some((entry) => entry.providerId === providerId);
            expect(effective && withheld).toBe(false);
          }
        }
      }
    }
  });

  it('keeps the test-only mock apart from the real providers', () => {
    // Allowing the mock grants no real provider; a real provider grants no mock.
    expect(
      parseSessionsFeatureConfig({
        project: { enabled: true, providers: { mock: { allowed: true } } },
      }),
    ).toEqual({
      enabled: true,
      providers: { mock: { enabled: true } },
      withheld: [
        { providerId: 'claude', reason: 'not-allowed' },
        { providerId: 'codex', reason: 'not-allowed' },
        { providerId: 'antigravity', reason: 'not-allowed' },
      ],
    });
    const realOnly = parseSessionsFeatureConfig({
      project: { enabled: true, providers: { claude: { allowed: true } } },
    });
    expect(realOnly.providers.mock).toEqual({ enabled: false });
    expect(realOnly.withheld?.map((entry) => entry.providerId)).not.toContain('mock');
  });
});
