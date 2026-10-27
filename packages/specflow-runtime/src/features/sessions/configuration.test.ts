import { describe, expect, it } from 'vitest';
import { parseSessionsFeatureConfig } from './configuration';

describe('project Session feature configuration', () => {
  it('requires explicit flags for storage and the mock provider', () => {
    expect(parseSessionsFeatureConfig(undefined)).toEqual({
      enabled: false,
      providers: { mock: { enabled: false } },
    });
    expect(parseSessionsFeatureConfig({ enabled: true })).toEqual({
      enabled: true,
      providers: { mock: { enabled: false } },
    });
    expect(
      parseSessionsFeatureConfig({ enabled: true, providers: { mock: { enabled: true } } }),
    ).toEqual({ enabled: true, providers: { mock: { enabled: true } } });
  });
  it('rejects misspelled providers, flags and untyped values', () => {
    for (const input of [
      { enable: true },
      { enabled: 'true' },
      { providers: { cluade: { enabled: true } } },
      { providers: { mock: { enable: true } } },
      { providers: { claude: { enabled: 'true' } } },
      { providers: { claude: { executable: 'claude' } } },
      { providers: { claude: { allowUnsafe: true } } },
      { providers: { codex: { allowUnsafe: true } } },
      { providers: { codex: { enabled: 'true' } } },
      { providers: { codex: { executable: 'codex' } } },
    ])
      expect(() => parseSessionsFeatureConfig(input)).toThrow();
  });
  it('supports explicit Codex enablement without a certification override', () => {
    expect(
      parseSessionsFeatureConfig({ enabled: true, providers: { codex: { enabled: true } } }),
    ).toEqual({
      enabled: true,
      providers: { mock: { enabled: false }, codex: { enabled: true } },
    });
  });
  it('supports explicit Claude enablement independently of the mock', () => {
    expect(
      parseSessionsFeatureConfig({ enabled: true, providers: { claude: { enabled: true } } }),
    ).toEqual({
      enabled: true,
      providers: { mock: { enabled: false }, claude: { enabled: true } },
    });
  });
});
