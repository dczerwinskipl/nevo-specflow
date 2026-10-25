import { record, onlyKeys } from '../../config/parsing/value-parsers';
import { RuntimeConfigError } from '../../config/parsing/runtime-config-error';

export interface SessionsFeatureConfig {
  enabled: boolean;
  providers: { mock: { enabled: boolean } };
}
export function parseSessionsFeatureConfig(value: unknown): SessionsFeatureConfig {
  if (value === undefined) return { enabled: false, providers: { mock: { enabled: false } } };
  const sessions = record(value, 'sessions');
  onlyKeys(sessions, new Set(['enabled', 'providers']), 'sessions');
  const providers =
    sessions.providers === undefined ? {} : record(sessions.providers, 'sessions.providers');
  onlyKeys(providers, new Set(['mock']), 'sessions.providers');
  const mock =
    providers.mock === undefined ? {} : record(providers.mock, 'sessions.providers.mock');
  onlyKeys(mock, new Set(['enabled']), 'sessions.providers.mock');
  for (const [name, flag] of [
    ['sessions.enabled', sessions.enabled],
    ['sessions.providers.mock.enabled', mock.enabled],
  ] as const) {
    if (flag !== undefined && typeof flag !== 'boolean')
      throw new RuntimeConfigError(name + ' must be boolean.');
  }
  return {
    enabled: sessions.enabled === true,
    providers: { mock: { enabled: mock.enabled === true } },
  };
}
