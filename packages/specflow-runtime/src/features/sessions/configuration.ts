import { record, onlyKeys } from '../../config/parsing/value-parsers';
import { RuntimeConfigError } from '../../config/parsing/runtime-config-error';
import { isAbsolute } from 'node:path';

export interface SessionsFeatureConfig {
  enabled: boolean;
  providers: {
    mock: { enabled: boolean };
    claude?: { enabled: boolean; executable?: string };
    codex?: { enabled: boolean; executable?: string };
    antigravity?: { enabled: boolean; executable?: string };
  };
}
export function parseSessionsFeatureConfig(value: unknown): SessionsFeatureConfig {
  if (value === undefined) {
    return { enabled: false, providers: { mock: { enabled: false } } };
  }

  const sessions = record(value, 'sessions');
  onlyKeys(sessions, new Set(['enabled', 'providers']), 'sessions');
  const providers =
    sessions.providers === undefined ? {} : record(sessions.providers, 'sessions.providers');
  onlyKeys(providers, new Set(['mock', 'claude', 'codex', 'antigravity']), 'sessions.providers');
  const antigravity =
    providers.antigravity === undefined
      ? undefined
      : record(providers.antigravity, 'sessions.providers.antigravity');
  if (antigravity) {
    onlyKeys(antigravity, new Set(['enabled', 'executable']), 'sessions.providers.antigravity');
    if (antigravity.enabled !== undefined && typeof antigravity.enabled !== 'boolean') {
      throw new RuntimeConfigError('sessions.providers.antigravity.enabled must be boolean.');
    }

    if (
      antigravity.executable !== undefined &&
      (typeof antigravity.executable !== 'string' ||
        !isAbsolute(antigravity.executable) ||
        antigravity.executable.includes('\0'))
    ) {
      throw new RuntimeConfigError(
        'sessions.providers.antigravity.executable must be an absolute native executable path.',
      );
    }
  }

  const codex =
    providers.codex === undefined ? undefined : record(providers.codex, 'sessions.providers.codex');
  if (codex) {
    onlyKeys(codex, new Set(['enabled', 'executable']), 'sessions.providers.codex');
    if (codex.enabled !== undefined && typeof codex.enabled !== 'boolean') {
      throw new RuntimeConfigError('sessions.providers.codex.enabled must be boolean.');
    }

    if (
      codex.executable !== undefined &&
      (typeof codex.executable !== 'string' ||
        !isAbsolute(codex.executable) ||
        codex.executable.includes('\0'))
    ) {
      throw new RuntimeConfigError(
        'sessions.providers.codex.executable must be an absolute native executable path.',
      );
    }
  }

  const claude =
    providers.claude === undefined
      ? undefined
      : record(providers.claude, 'sessions.providers.claude');
  if (claude) {
    onlyKeys(claude, new Set(['enabled', 'executable']), 'sessions.providers.claude');
    if (claude.enabled !== undefined && typeof claude.enabled !== 'boolean') {
      throw new RuntimeConfigError('sessions.providers.claude.enabled must be boolean.');
    }

    if (
      claude.executable !== undefined &&
      (typeof claude.executable !== 'string' ||
        !isAbsolute(claude.executable) ||
        claude.executable.includes('\0'))
    ) {
      throw new RuntimeConfigError(
        'sessions.providers.claude.executable must be an absolute native executable path.',
      );
    }
  }

  const mock =
    providers.mock === undefined ? {} : record(providers.mock, 'sessions.providers.mock');
  onlyKeys(mock, new Set(['enabled']), 'sessions.providers.mock');
  for (const [name, flag] of [
    ['sessions.enabled', sessions.enabled],
    ['sessions.providers.mock.enabled', mock.enabled],
  ] as const) {
    if (flag !== undefined && typeof flag !== 'boolean') {
      throw new RuntimeConfigError(name + ' must be boolean.');
    }
  }

  return {
    enabled: sessions.enabled === true,
    providers: {
      mock: { enabled: mock.enabled === true },
      ...(antigravity
        ? {
            antigravity: {
              enabled: antigravity.enabled === true,
              ...(typeof antigravity.executable === 'string'
                ? { executable: antigravity.executable }
                : {}),
            },
          }
        : {}),
      ...(codex
        ? {
            codex: {
              enabled: codex.enabled === true,
              ...(typeof codex.executable === 'string' ? { executable: codex.executable } : {}),
            },
          }
        : {}),
      ...(claude
        ? {
            claude: {
              enabled: claude.enabled === true,
              ...(typeof claude.executable === 'string' ? { executable: claude.executable } : {}),
            },
          }
        : {}),
    },
  };
}
