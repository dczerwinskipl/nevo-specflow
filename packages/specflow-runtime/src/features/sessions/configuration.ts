import { isAbsolute } from 'node:path';

import { RuntimeConfigError } from '../../config/parsing/runtime-config-error';
import { onlyKeys, record } from '../../config/parsing/value-parsers';

const NATIVE_PROVIDERS = ['claude', 'codex', 'antigravity'] as const;
const PROVIDERS = ['mock', ...NATIVE_PROVIDERS] as const;

export type NativeSessionProviderId = (typeof NATIVE_PROVIDERS)[number];
export type SessionProviderId = (typeof PROVIDERS)[number];

/**
 * Why a provider the Runtime knows runs no driver while managed Sessions are enabled: the project
 * does not allow it, or this workstation turned an allowed provider off.
 */
export interface WithheldSessionProvider {
  readonly providerId: SessionProviderId;
  readonly reason: 'not-allowed' | 'not-enabled';
}

/**
 * The effective Session configuration: project policy (`.nevo/config.yaml`) composed with the
 * workstation's enablement (`.nevo/local/config.yaml`). A provider's `enabled` is effective: the
 * feature is enabled, the project allows the provider and the workstation did not turn it off.
 */
export interface SessionsFeatureConfig {
  enabled: boolean;
  providers: {
    mock: { enabled: boolean };
    claude?: { enabled: boolean; executable?: string };
    codex?: { enabled: boolean; executable?: string };
    antigravity?: { enabled: boolean; executable?: string };
  };
  /** Known providers that run no driver, listed in the catalogue with the reason. */
  withheld?: readonly WithheldSessionProvider[];
}

export interface SessionsConfigurationDocuments {
  /** The project config's `sessions` value. */
  readonly project: unknown;
  /** The local config's `sessions` value; absent with no local file or no `sessions` there. */
  readonly local?: unknown;
}

const PROJECT_FILE = '.nevo/config.yaml';
const LOCAL_FILE = '.nevo/local/config.yaml';

/**
 * The project allows providers (`sessions.enabled`, `providers.<id>.allowed`); the workstation
 * enables them (`providers.<id>.enabled`, native `executable`). An allowed provider is enabled
 * unless the workstation sets `enabled: false`. Every value that would let one file decide what
 * the other owns is refused here, before composition.
 */
export function parseSessionsFeatureConfig(
  documents: SessionsConfigurationDocuments,
): SessionsFeatureConfig {
  const project = parseProject(documents.project);
  const local = parseLocal(documents.local);
  for (const providerId of PROVIDERS) {
    if (local[providerId]?.enabled === true && !project.allowed.has(providerId)) {
      throw new RuntimeConfigError(
        `sessions.providers.${providerId}.enabled in ${LOCAL_FILE} enables a provider the project does not allow. ` +
          `Remove it, or ask a maintainer to set sessions.providers.${providerId}.allowed: true in ${PROJECT_FILE}.`,
      );
    }
  }

  if (!project.enabled) {
    return { enabled: false, providers: { mock: { enabled: false } } };
  }

  const effective = (providerId: SessionProviderId) =>
    project.allowed.has(providerId) && local[providerId]?.enabled !== false;
  const withheld: WithheldSessionProvider[] = [];
  for (const providerId of PROVIDERS) {
    if (!project.allowed.has(providerId)) {
      // The test-only mock is never advertised to a project that does not allow it.
      if (providerId !== 'mock') {
        withheld.push({ providerId, reason: 'not-allowed' });
      }
    } else if (!effective(providerId)) {
      withheld.push({ providerId, reason: 'not-enabled' });
    }
  }

  const native = (providerId: NativeSessionProviderId) => {
    if (!project.allowed.has(providerId)) {
      return {};
    }

    const executable = local[providerId]?.executable;

    return {
      [providerId]: {
        enabled: effective(providerId),
        ...(executable === undefined ? {} : { executable }),
      },
    };
  };

  return {
    enabled: true,
    providers: {
      mock: { enabled: effective('mock') },
      ...native('claude'),
      ...native('codex'),
      ...native('antigravity'),
    },
    ...(withheld.length > 0 ? { withheld } : {}),
  };
}

function parseProject(value: unknown): {
  enabled: boolean;
  allowed: ReadonlySet<SessionProviderId>;
} {
  if (value === undefined) {
    return { enabled: false, allowed: new Set() };
  }

  const sessions = record(value, 'sessions');
  onlyKeys(sessions, new Set(['enabled', 'providers']), 'sessions');
  boolean(sessions.enabled, 'sessions.enabled');
  const allowed = new Set<SessionProviderId>();
  for (const [providerId, entry] of providerEntries(sessions.providers)) {
    const path = `sessions.providers.${providerId}`;
    if ('enabled' in entry) {
      throw new RuntimeConfigError(
        `${path}.enabled is no longer a project setting. In ${PROJECT_FILE} the project allows a provider ` +
          `(${path}.allowed: true); each workstation enables it in ${LOCAL_FILE}, where an allowed provider is ` +
          `enabled unless it sets ${path}.enabled: false. Replace 'enabled' with 'allowed'.`,
      );
    }

    if ('executable' in entry) {
      throw new RuntimeConfigError(
        `${path}.executable is a workstation path and cannot be set in ${PROJECT_FILE}. Move it to ${path}.executable in ${LOCAL_FILE}.`,
      );
    }

    onlyKeys(entry, new Set(['allowed']), path);
    if (boolean(entry.allowed, `${path}.allowed`) === true) {
      allowed.add(providerId);
    }
  }

  return { enabled: sessions.enabled === true, allowed };
}

function parseLocal(
  value: unknown,
): Partial<Record<SessionProviderId, { enabled?: boolean; executable?: string }>> {
  if (value === undefined) {
    return {};
  }

  const sessions = record(value, 'sessions');
  for (const key of Object.keys(sessions)) {
    if (key !== 'providers') {
      throw new RuntimeConfigError(
        key === 'enabled'
          ? `sessions.enabled is project policy and cannot be set in ${LOCAL_FILE}. A workstation turns off a provider with sessions.providers.<provider>.enabled: false.`
          : `Unknown configuration key 'sessions.${key}' in ${LOCAL_FILE}.`,
      );
    }
  }

  const result: Partial<Record<SessionProviderId, { enabled?: boolean; executable?: string }>> = {};
  for (const [providerId, entry] of providerEntries(sessions.providers)) {
    const path = `sessions.providers.${providerId}`;
    if ('allowed' in entry) {
      throw new RuntimeConfigError(
        `${path}.allowed is project policy and cannot be set in ${LOCAL_FILE}; it belongs in ${PROJECT_FILE}.`,
      );
    }

    onlyKeys(entry, new Set(providerId === 'mock' ? ['enabled'] : ['enabled', 'executable']), path);
    const enabled = boolean(entry.enabled, `${path}.enabled`);
    const executable = entry.executable;
    if (
      executable !== undefined &&
      (typeof executable !== 'string' || !isAbsolute(executable) || executable.includes('\0'))
    ) {
      throw new RuntimeConfigError(
        `${path}.executable must be an absolute native executable path.`,
      );
    }

    result[providerId] = {
      ...(enabled === undefined ? {} : { enabled }),
      ...(executable === undefined ? {} : { executable }),
    };
  }

  return result;
}

function providerEntries(value: unknown): [SessionProviderId, Record<string, unknown>][] {
  if (value === undefined) {
    return [];
  }

  const providers = record(value, 'sessions.providers');
  onlyKeys(providers, new Set(PROVIDERS), 'sessions.providers');

  return Object.entries(providers).map(([providerId, entry]) => [
    providerId as SessionProviderId,
    record(entry, `sessions.providers.${providerId}`),
  ]);
}

function boolean(value: unknown, path: string): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new RuntimeConfigError(`${path} must be boolean.`);
  }

  return value;
}
