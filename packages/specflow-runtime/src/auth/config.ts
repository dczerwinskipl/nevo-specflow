import { RuntimeConfigError } from '../config/error.js';
import {
  absoluteHttpsUrl,
  boolean,
  childRecord,
  isRecord,
  nonEmptyKey,
  nonEmptyString,
  onlyKeys,
  optionalNonEmptyString,
  record,
} from '../config/value.js';
import { isSupportedPasswordHash } from './password.js';

export type AuthMode = 'none' | 'required';

export interface RuntimeUserConfig {
  readonly name: string;
}

export interface RuntimePasswordAccountConfig {
  readonly userId: string;
  readonly passwordHash: string;
}

export interface RuntimePasswordProviderConfig {
  readonly enabled: boolean;
  readonly accounts: Readonly<Record<string, RuntimePasswordAccountConfig>>;
}

export interface RuntimeOidcProviderConfig {
  readonly enabled: boolean;
  readonly issuer?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly allowedEmails: Readonly<Record<string, string>>;
}

export interface RuntimeAuthConfig {
  readonly mode: AuthMode;
  readonly localUserId?: string;
  readonly users: Readonly<Record<string, RuntimeUserConfig>>;
  readonly providers: {
    readonly password: RuntimePasswordProviderConfig;
    readonly oidc: RuntimeOidcProviderConfig;
  };
}

export const AUTH_CONFIG_REPLACE_PATHS = [
  'auth.providers.password.accounts',
  'auth.providers.oidc.allowedEmails',
] as const;

const AUTH_KEYS = new Set(['mode', 'localUserId', 'users', 'providers']);
const PROVIDER_KEYS = new Set(['password', 'oidc']);
const PASSWORD_KEYS = new Set(['enabled', 'accounts']);
const PASSWORD_ACCOUNT_KEYS = new Set(['userId', 'passwordHash']);
const OIDC_KEYS = new Set(['enabled', 'issuer', 'clientId', 'clientSecret', 'allowedEmails']);
const USER_KEYS = new Set(['name']);

export function parseAuthConfig(value: unknown): RuntimeAuthConfig {
  const auth = record(value, 'auth');
  onlyKeys(auth, AUTH_KEYS, 'auth');

  const providers = record(auth.providers, 'auth.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'auth.providers');

  const users = parseUsers(auth.users);
  const password = parsePasswordProvider(providers.password);
  const oidc = parseOidcProvider(providers.oidc);

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

  for (const [email, userId] of Object.entries(oidc.allowedEmails)) {
    assertUserExists(users, userId, `auth.providers.oidc.allowedEmails.${email}`);
  }

  if (password.enabled && Object.keys(password.accounts).length === 0) {
    throw new RuntimeConfigError(
      'auth.providers.password.accounts must contain at least one account when password auth is enabled.',
    );
  }

  if (oidc.enabled) {
    if (!oidc.issuer || !oidc.clientId || !oidc.clientSecret) {
      throw new RuntimeConfigError(
        'auth.providers.oidc.issuer, clientId, and clientSecret are required when OIDC is enabled.',
      );
    }
    if (Object.keys(oidc.allowedEmails).length === 0) {
      throw new RuntimeConfigError(
        'auth.providers.oidc.allowedEmails must contain at least one mapping when OIDC is enabled.',
      );
    }
  }

  if (mode === 'none' && (password.enabled || oidc.enabled)) {
    throw new RuntimeConfigError('auth.mode=none cannot enable authentication providers.');
  }

  if (mode === 'required' && localUserId) {
    throw new RuntimeConfigError('auth.localUserId is only valid when auth.mode=none.');
  }

  if (mode === 'required' && !password.enabled && !oidc.enabled) {
    throw new RuntimeConfigError(
      'auth.mode=required requires at least one enabled authentication provider.',
    );
  }

  return {
    mode,
    ...(localUserId ? { localUserId } : {}),
    users,
    providers: {
      password,
      oidc,
    },
  };
}

export interface AuthRuntimeContext {
  readonly bindHost: string;
  readonly publicOrigin?: string;
  readonly tlsEnabled: boolean;
}

export function validateAuthRuntimeContext(
  auth: RuntimeAuthConfig,
  context: AuthRuntimeContext,
): void {
  if (auth.providers.oidc.enabled && !context.publicOrigin) {
    throw new RuntimeConfigError(
      'server.publicOrigin is required when the OIDC provider is enabled.',
    );
  }

  if (auth.mode !== 'required' || context.tlsEnabled) {
    return;
  }

  if (!isLoopbackHost(context.bindHost)) {
    throw new RuntimeConfigError(
      'auth.mode=required without Runtime TLS is allowed only when server.host is loopback.',
    );
  }

  if (context.publicOrigin && !isLoopbackHost(new URL(context.publicOrigin).hostname)) {
    throw new RuntimeConfigError(
      'auth.mode=required without Runtime TLS requires server.publicOrigin to be loopback.',
    );
  }
}

export function assertNoProjectAuthSecrets(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const providers = childRecord(value, 'providers');
  const oidc = childRecord(providers, 'oidc');

  if (oidc && Object.hasOwn(oidc, 'clientSecret')) {
    throw new RuntimeConfigError(
      'auth.providers.oidc.clientSecret must be configured only in the local SpecFlow config.',
    );
  }

  const password = childRecord(providers, 'password');
  const accounts = childRecord(password, 'accounts');
  if (!accounts) {
    return;
  }

  for (const [username, rawAccount] of Object.entries(accounts)) {
    if (isRecord(rawAccount) && Object.hasOwn(rawAccount, 'passwordHash')) {
      throw new RuntimeConfigError(
        `auth.providers.password.accounts.${username}.passwordHash must be configured only in the local SpecFlow config.`,
      );
    }
  }
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
  const result: Record<string, RuntimePasswordAccountConfig> = {};

  for (const [username, rawAccount] of Object.entries(accounts)) {
    nonEmptyKey(username, `${path}.accounts`);
    const accountPath = `${path}.accounts.${username}`;
    const account = record(rawAccount, accountPath);
    onlyKeys(account, PASSWORD_ACCOUNT_KEYS, accountPath);

    const passwordHash = nonEmptyString(account.passwordHash, `${accountPath}.passwordHash`);
    if (enabled && !isSupportedPasswordHash(passwordHash)) {
      throw new RuntimeConfigError(
        `${accountPath}.passwordHash must use a supported SpecFlow password hash format.`,
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

function parseOidcProvider(value: unknown): RuntimeOidcProviderConfig {
  const path = 'auth.providers.oidc';
  const config = record(value, path);
  onlyKeys(config, OIDC_KEYS, path);

  const allowedEmailsValue = config.allowedEmails;
  const allowedEmails =
    allowedEmailsValue === undefined ? {} : record(allowedEmailsValue, `${path}.allowedEmails`);
  const mappings: Record<string, string> = {};

  for (const [email, rawUserId] of Object.entries(allowedEmails)) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
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
    ...(config.issuer === undefined
      ? {}
      : { issuer: absoluteHttpsUrl(config.issuer, `${path}.issuer`) }),
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

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }

  const parts = normalized.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)
  );
}
