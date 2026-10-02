import type { RuntimeConfig } from './types.js';

type ConfigRecord = Record<string, unknown>;

const ROOT_KEYS = new Set(['server', 'auth']);
const SERVER_KEYS = new Set(['host', 'port', 'publicOrigin', 'tls']);
const TLS_KEYS = new Set(['enabled', 'certFile', 'keyFile']);
const AUTH_KEYS = new Set(['mode', 'providers']);
const PROVIDER_KEYS = new Set(['password', 'google']);
const ENABLED_KEYS = new Set(['enabled']);

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const root = record(value, 'config');
  onlyKeys(root, ROOT_KEYS, 'config');

  const server = record(root.server, 'server');
  onlyKeys(server, SERVER_KEYS, 'server');

  const tls = record(server.tls, 'server.tls');
  onlyKeys(tls, TLS_KEYS, 'server.tls');

  const auth = record(root.auth, 'auth');
  onlyKeys(auth, AUTH_KEYS, 'auth');

  const providers = record(auth.providers, 'auth.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'auth.providers');

  const password = provider(providers.password, 'auth.providers.password');
  const google = provider(providers.google, 'auth.providers.google');

  const host = nonEmptyString(server.host, 'server.host');
  if (host.includes('://') || /[/?#]/u.test(host)) {
    throw new RuntimeConfigError(
      'server.host must be a hostname or IP address without a protocol or path.',
    );
  }

  const port = integer(server.port, 'server.port');
  if (port < 1 || port > 65_535) {
    throw new RuntimeConfigError('server.port must be between 1 and 65535.');
  }

  const publicOrigin =
    server.publicOrigin === undefined
      ? undefined
      : absoluteHttpOrigin(server.publicOrigin, 'server.publicOrigin');

  const tlsEnabled = boolean(tls.enabled, 'server.tls.enabled');
  const certFile = optionalNonEmptyString(tls.certFile, 'server.tls.certFile');
  const keyFile = optionalNonEmptyString(tls.keyFile, 'server.tls.keyFile');

  if (tlsEnabled && (!certFile || !keyFile)) {
    throw new RuntimeConfigError(
      'server.tls.certFile and server.tls.keyFile are required when TLS is enabled.',
    );
  }

  const mode = auth.mode;
  if (mode !== 'none' && mode !== 'required') {
    throw new RuntimeConfigError("auth.mode must be either 'none' or 'required'.");
  }

  if (google.enabled && !publicOrigin) {
    throw new RuntimeConfigError(
      'server.publicOrigin is required when the Google OIDC provider is enabled.',
    );
  }

  return {
    server: {
      host,
      port,
      ...(publicOrigin ? { publicOrigin } : {}),
      tls: {
        enabled: tlsEnabled,
        ...(certFile ? { certFile } : {}),
        ...(keyFile ? { keyFile } : {}),
      },
    },
    auth: {
      mode,
      providers: {
        password,
        google,
      },
    },
  };
}

function provider(value: unknown, path: string): { enabled: boolean } {
  const config = record(value, path);
  onlyKeys(config, ENABLED_KEYS, path);
  return { enabled: boolean(config.enabled, `${path}.enabled`) };
}

function record(value: unknown, path: string): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RuntimeConfigError(`${path} must be an object.`);
  }
  return value as ConfigRecord;
}

function onlyKeys(value: ConfigRecord, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new RuntimeConfigError(`Unknown configuration key '${path}.${key}'.`);
    }
  }
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeConfigError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, path);
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RuntimeConfigError(`${path} must be an integer.`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RuntimeConfigError(`${path} must be a boolean.`);
  }
  return value;
}

function absoluteHttpOrigin(value: unknown, path: string): string {
  const raw = nonEmptyString(value, path);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeConfigError(`${path} must be an absolute HTTP(S) origin.`);
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search || url.hash) {
    throw new RuntimeConfigError(`${path} must be an absolute HTTP(S) origin without a path, query, or fragment.`);
  }

  return url.origin;
}
