import { isSupportedPasswordHash } from '../auth/password.js';

import type {
  RuntimeConfig,
  RuntimeGoogleProviderConfig,
  RuntimePasswordProviderConfig,
  RuntimeUserConfig,
} from './types.js';

type ConfigRecord = Record<string, unknown>;

const ROOT_KEYS = new Set(['server', 'auth']);
const SERVER_KEYS = new Set(['host', 'port', 'publicOrigin', 'tls']);
const TLS_KEYS = new Set(['enabled', 'certFile', 'keyFile']);
const AUTH_KEYS = new Set(['mode', 'localUserId', 'users', 'providers']);
const PROVIDER_KEYS = new Set(['password', 'google']);
const PASSWORD_KEYS = new Set(['enabled', 'accounts']);
const PASSWORD_ACCOUNT_KEYS = new Set(['userId', 'passwordHash']);
const GOOGLE_KEYS = new Set(['enabled', 'clientId', 'clientSecret', 'allowedEmails']);
const USER_KEYS = new Set(['name']);

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

  const users = parseUsers(auth.users);
  const password = parsePasswordProvider(providers.password);
  const google = parseGoogleProvider(providers.google);

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

  const localUserId = optionalNonEmptyString(auth.localUserId, 'auth.localUserId');
  if (localUserId) {
    assertUserExists(users, localUserId, 'auth.localUserId');
  }

  for (const [username, account] of Object.entries(password.accounts)) {
    assertUserExists(users, account.userId, `auth.providers.password.accounts.${username}.userId`);
  }

  for (const [email, userId] of Object.entries(google.allowedEmails)) {
    assertUserExists(users, userId, `auth.providers.google.allowedEmails.${email}`);
  }

  if (password.enabled && Object.keys(password.accounts).length === 0) {
    throw new RuntimeConfigError(
      'auth.providers.password.accounts must contain at least one account when password auth is enabled.',
    );
  }

  if (google.enabled) {
    if (!publicOrigin) {
      throw new RuntimeConfigError(
        'server.publicOrigin is required when the Google OIDC provider is enabled.',
      );
    }
    if (!google.clientId || !google.clientSecret) {
      throw new RuntimeConfigError(
        'auth.providers.google.clientId and clientSecret are required when Google OIDC is enabled.',
      );
    }
    if (Object.keys(google.allowedEmails).length === 0) {
      throw new RuntimeConfigError(
        'auth.providers.google.allowedEmails must contain at least one mapping when Google OIDC is enabled.',
      );
    }
  }

  if (mode === 'none' && (password.enabled || google.enabled)) {
    throw new RuntimeConfigError('auth.mode=none cannot enable authentication providers.');
  }

  if (mode === 'required' && localUserId) {
    throw new RuntimeConfigError('auth.localUserId is only valid when auth.mode=none.');
  }

  if (mode === 'required' && !password.enabled && !google.enabled) {
    throw new RuntimeConfigError(
      'auth.mode=required requires at least one enabled authentication provider.',
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
      ...(localUserId ? { localUserId } : {}),
      users,
      providers: {
        password,
        google,
      },
    },
  };
}

function parseUsers(value: unknown): Readonly<Record<string, RuntimeUserConfig>> {
  if (value === undefined) {
    return {};
  }

  const users = record(value, 'auth.users');
  const result: Record<string, RuntimeUserConfig> = {};

  for (const [userId, rawUser] of Object.entries(users)) {
    const path = `auth.users.${userId}`;
    nonEmptyKey(userId, 'auth.users');
    const user = record(rawUser, path);
    onlyKeys(user, USER_KEYS, path);
    result[userId] = {
      name: nonEmptyString(user.name, `${path}.name`),
    };
  }

  return result;
}

function parsePasswordProvider(value: unknown): RuntimePasswordProviderConfig {
  const path = 'auth.providers.password';
  const config = record(value, path);
  onlyKeys(config, PASSWORD_KEYS, path);

  const enabled = boolean(config.enabled, `${path}.enabled`);
  const accountsValue = config.accounts;
  const accounts = accountsValue === undefined ? {} : record(accountsValue, `${path}.accounts`);
  const result: Record<string, { userId: string; passwordHash: string }> = {};

  for (const [username, rawAccount] of Object.entries(accounts)) {
    nonEmptyKey(username, `${path}.accounts`);
    const accountPath = `${path}.accounts.${username}`;
    const account = record(rawAccount, accountPath);
    onlyKeys(account, PASSWORD_ACCOUNT_KEYS, accountPath);

    const passwordHash = nonEmptyString(account.passwordHash, `${accountPath}.passwordHash`);
    if (enabled && !isSupportedPasswordHash(passwordHash)) {
      throw new RuntimeConfigError(
        `${accountPath}.passwordHash must use the supported SpecFlow password hash format.`,
      );
    }

    result[username] = {
      userId: nonEmptyString(account.userId, `${accountPath}.userId`),
      passwordHash,
    };
  }

  return {
    enabled,
    accounts: result,
  };
}

function parseGoogleProvider(value: unknown): RuntimeGoogleProviderConfig {
  const path = 'auth.providers.google';
  const config = record(value, path);
  onlyKeys(config, GOOGLE_KEYS, path);

  const allowedEmailsValue = config.allowedEmails;
  const allowedEmails =
    allowedEmailsValue === undefined ? {} : record(allowedEmailsValue, `${path}.allowedEmails`);
  const mappings: Record<string, string> = {};

  for (const [email, rawUserId] of Object.entries(allowedEmails)) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail?.includes('@')) {
      throw new RuntimeConfigError(
        `${path}.allowedEmails contains an invalid email key '${email}'.`,
      );
    }
    if (Object.hasOwn(mappings, normalizedEmail)) {
      throw new RuntimeConfigError(
        `${path}.allowedEmails contains a duplicate email after normalization: '${email}'.`,
      );
    }
    mappings[normalizedEmail] = nonEmptyString(rawUserId, `${path}.allowedEmails.${email}`);
  }

  return {
    enabled: boolean(config.enabled, `${path}.enabled`),
    ...(config.clientId === undefined
      ? {}
      : { clientId: nonEmptyString(config.clientId, `${path}.clientId`) }),
    ...(config.clientSecret === undefined
      ? {}
      : { clientSecret: nonEmptyString(config.clientSecret, `${path}.clientSecret`) }),
    allowedEmails: mappings,
  };
}

function assertUserExists(
  users: Readonly<Record<string, RuntimeUserConfig>>,
  userId: string,
  path: string,
): void {
  if (!(userId in users)) {
    throw new RuntimeConfigError(`${path} references unknown user '${userId}'.`);
  }
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

function nonEmptyKey(value: string, path: string): void {
  if (value.trim() === '') {
    throw new RuntimeConfigError(`${path} must not contain empty keys.`);
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
