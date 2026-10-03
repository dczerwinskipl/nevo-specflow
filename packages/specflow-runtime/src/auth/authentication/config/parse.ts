import { RuntimeConfigError } from '../../../config/error';
import {
  absoluteHttpsUrl,
  boolean,
  nonEmptyKey,
  nonEmptyString,
  opaqueNonEmptyString,
  onlyKeys,
  optionalNonEmptyString,
  record,
} from '../../../config/value';
import { isSupportedPasswordHash } from '../password/hash';
import { PASSWORD_USERNAME_MAX_LENGTH } from '../password/policy';
import { normalizePasswordUsername } from '../password/username';
import type {
  RuntimeAuthConfig,
  RuntimeOidcProviderConfig,
  RuntimePasswordProviderConfig,
  RuntimeUserConfig,
} from './model';

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
    providers: { password, oidc },
  };
}

function parseUsers(value: unknown): Readonly<Record<string, RuntimeUserConfig>> {
  if (value === undefined) return dictionary<RuntimeUserConfig>();

  const users = record(value, 'auth.users');
  const result = dictionary<RuntimeUserConfig>();

  for (const [userId, rawUser] of Object.entries(users)) {
    const path = `auth.users.${userId}`;
    nonEmptyKey(userId, 'auth.users');
    const user = record(rawUser, path);
    onlyKeys(user, USER_KEYS, path);
    result[userId] = { name: nonEmptyString(user.name, `${path}.name`) };
  }

  return result;
}

function parsePasswordProvider(value: unknown): RuntimePasswordProviderConfig {
  const path = 'auth.providers.password';
  const config = record(value, path);
  onlyKeys(config, PASSWORD_KEYS, path);

  const enabled = boolean(config.enabled, `${path}.enabled`);
  const accountsValue = config.accounts;
  const accounts =
    accountsValue === undefined ? dictionary<unknown>() : record(accountsValue, `${path}.accounts`);
  const result = dictionary<{ userId: string; passwordHash: string }>();

  for (const [rawUsername, rawAccount] of Object.entries(accounts)) {
    nonEmptyKey(rawUsername, `${path}.accounts`);
    const username = normalizePasswordUsername(rawUsername);
    if ([...username].length > PASSWORD_USERNAME_MAX_LENGTH) {
      throw new RuntimeConfigError(
        `${path}.accounts usernames must be at most ${String(PASSWORD_USERNAME_MAX_LENGTH)} characters.`,
      );
    }
    if (Object.hasOwn(result, username)) {
      throw new RuntimeConfigError(
        `${path}.accounts contains a duplicate username after normalization: '${rawUsername}'.`,
      );
    }

    const accountPath = `${path}.accounts.${rawUsername}`;
    const account = record(rawAccount, accountPath);
    onlyKeys(account, PASSWORD_ACCOUNT_KEYS, accountPath);

    const passwordHash = opaqueNonEmptyString(account.passwordHash, `${accountPath}.passwordHash`);
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

  return { enabled, accounts: result };
}

function parseOidcProvider(value: unknown): RuntimeOidcProviderConfig {
  const path = 'auth.providers.oidc';
  const config = record(value, path);
  onlyKeys(config, OIDC_KEYS, path);

  const enabled = boolean(config.enabled, `${path}.enabled`);
  const issuer =
    config.issuer === undefined ? undefined : absoluteHttpsUrl(config.issuer, `${path}.issuer`);
  const clientId = optionalNonEmptyString(config.clientId, `${path}.clientId`);
  const clientSecret =
    config.clientSecret === undefined
      ? undefined
      : opaqueNonEmptyString(config.clientSecret, `${path}.clientSecret`);

  const allowedEmailsValue = config.allowedEmails;
  const allowedEmails =
    allowedEmailsValue === undefined
      ? dictionary<unknown>()
      : record(allowedEmailsValue, `${path}.allowedEmails`);
  const mappings = dictionary<string>();

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

  if (enabled) {
    if (!issuer || !clientId || !clientSecret) {
      throw new RuntimeConfigError(
        'auth.providers.oidc.issuer, clientId, and clientSecret are required when OIDC is enabled.',
      );
    }
    if (Object.keys(mappings).length === 0) {
      throw new RuntimeConfigError(
        'auth.providers.oidc.allowedEmails must contain at least one mapping when OIDC is enabled.',
      );
    }
    return {
      enabled: true,
      issuer,
      clientId,
      clientSecret,
      allowedEmails: mappings,
    };
  }

  return {
    enabled: false,
    ...(issuer ? { issuer } : {}),
    ...(clientId ? { clientId } : {}),
    ...(clientSecret ? { clientSecret } : {}),
    allowedEmails: mappings,
  };
}

function assertUserExists(
  users: Readonly<Record<string, RuntimeUserConfig>>,
  userId: string,
  path: string,
): void {
  if (!Object.hasOwn(users, userId)) {
    throw new RuntimeConfigError(`${path} references unknown user '${userId}'.`);
  }
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
