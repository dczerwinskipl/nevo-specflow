import { parseAuthConfig, validateAuthRuntimeContext } from '../auth/config.js';
import { parseAuthorizationConfig } from '../authorization/config.js';
import { RuntimeConfigError } from './error.js';
import type { RuntimeConfig } from './types.js';
import {
  boolean,
  integer,
  nonEmptyString,
  onlyKeys,
  optionalNonEmptyString,
  record,
} from './value.js';

const ROOT_KEYS = new Set(['server', 'auth', 'authorization']);
const SERVER_KEYS = new Set(['host', 'port', 'publicOrigin', 'tls']);
const TLS_KEYS = new Set(['enabled', 'certFile', 'keyFile']);

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const root = record(value, 'config');
  onlyKeys(root, ROOT_KEYS, 'config');

  const server = record(root.server, 'server');
  onlyKeys(server, SERVER_KEYS, 'server');

  const tls = record(server.tls, 'server.tls');
  onlyKeys(tls, TLS_KEYS, 'server.tls');

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

  if (publicOrigin) {
    const publicProtocol = new URL(publicOrigin).protocol;
    if (tlsEnabled && publicProtocol !== 'https:') {
      throw new RuntimeConfigError(
        'server.publicOrigin must use HTTPS when server.tls.enabled=true.',
      );
    }
    if (!tlsEnabled && publicProtocol !== 'http:') {
      throw new RuntimeConfigError(
        'server.publicOrigin must use HTTP when server.tls.enabled=false; reverse-proxy TLS termination is not supported.',
      );
    }
  }

  const auth = parseAuthConfig(root.auth);
  const authorization = parseAuthorizationConfig(
    root.authorization,
    new Set(Object.keys(auth.users)),
  );

  validateAuthRuntimeContext(auth, {
    bindHost: host,
    tlsEnabled,
    ...(publicOrigin ? { publicOrigin } : {}),
  });

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
    auth,
    ...(root.authorization === undefined ? {} : { authorization }),
  };
}

function absoluteHttpOrigin(value: unknown, path: string): string {
  const raw = nonEmptyString(value, path);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeConfigError(`${path} must be an absolute HTTP(S) origin.`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new RuntimeConfigError(
      `${path} must be an absolute HTTP(S) origin without a path, query, or fragment.`,
    );
  }

  return url.origin;
}
