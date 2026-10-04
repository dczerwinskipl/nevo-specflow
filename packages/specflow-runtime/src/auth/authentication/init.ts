import type { RuntimeSetupUi } from '../../init/contracts';
import { RuntimeConfigError } from '../../config/error';
import { absoluteHttpsUrl } from '../../config/value';
import {
  isValidOidcProviderId,
  isValidOidcProviderName,
  OIDC_PROVIDER_NAME_MAX_LENGTH,
  normalizeOidcProviderName,
  oidcProviderIdFromName,
  oidcProviderNameKey,
} from './config/oidc-policy';
import type { RuntimeUserConfig } from './config/model';
import { hashPassword as hashRuntimePassword } from './password/hash';
import { normalizePasswordUsername } from './password/username';

export interface AuthInitResult {
  readonly projectAuth: Record<string, unknown>;
  readonly localAuth: Record<string, unknown>;
  readonly canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>;
  readonly requiresPublicOrigin: boolean;
  readonly summary: readonly string[];
}

export interface AuthInitOptions {
  readonly ui: RuntimeSetupUi;
  readonly hashPassword?: (password: string) => Promise<string>;
  readonly onUserCreated: (userId: string, user: RuntimeUserConfig) => Promise<void>;
}

interface OidcProjectSetup {
  readonly name: string;
  readonly enabled: true;
  readonly issuer: string;
  readonly clientId: string;
  readonly allowedEmails: Readonly<Record<string, string>>;
}

const NEW_USER = Symbol('new-user');
const EXISTING_USER = Symbol('existing-user');

export async function initAuth(options: AuthInitOptions): Promise<AuthInitResult> {
  const { ui } = options;
  const authenticationEnabled = await ui.confirm('Enable authentication?', false);

  if (!authenticationEnabled) {
    ui.note(
      'SpecFlow will trust a workstation-local identity without showing a login screen.',
      'Authentication',
    );
    const userId = await requiredInput(ui, 'Local user id', 'local-user');
    const displayName = await requiredInput(ui, 'Display name', 'Local User');
    const canonicalUsers = new Map<string, RuntimeUserConfig>();
    await addCanonicalUser(options, canonicalUsers, userId, { name: displayName });

    return {
      projectAuth: {
        mode: 'none',
        users: usersConfig(canonicalUsers),
        providers: {
          password: { enabled: false },
          oidc: { instances: {} },
        },
      },
      localAuth: { localUserId: userId },
      canonicalUsers,
      requiresPublicOrigin: false,
      summary: [
        'Authentication: trusted local identity (no sign-in)',
        `Local identity: ${formatUser(canonicalUsers, userId)}`,
        ...canonicalUserSummary(canonicalUsers),
      ],
    };
  }

  const canonicalUsers = new Map<string, RuntimeUserConfig>();
  const passwordAccounts = dictionary<{ userId: string; passwordHash: string }>();
  const projectOidc = dictionary<OidcProjectSetup>();
  const localOidc = dictionary<{ clientSecret: string }>();

  let passwordEnabled: boolean;
  do {
    passwordEnabled = await ui.confirm('Enable username/password login?', true);
    if (passwordEnabled) {
      await addPasswordAccount(options, canonicalUsers, passwordAccounts);
      while (await ui.confirm('Add another password account?', false)) {
        await addPasswordAccount(options, canonicalUsers, passwordAccounts);
      }
    }

    let addOidc = await ui.confirm('Add an OIDC provider?', !passwordEnabled);
    while (addOidc) {
      const provider = await addOidcProvider(options, canonicalUsers, projectOidc);
      projectOidc[provider.id] = provider.project;
      localOidc[provider.id] = { clientSecret: provider.clientSecret };
      addOidc = await ui.confirm('Add another OIDC provider?', false);
    }

    if (!passwordEnabled && Object.keys(projectOidc).length === 0) {
      ui.note(
        'Authentication requires at least one login method. ' +
          'Enable password login or add an OIDC provider.',
        'Authentication',
      );
    }
  } while (!passwordEnabled && Object.keys(projectOidc).length === 0);

  return {
    projectAuth: {
      mode: 'required',
      users: usersConfig(canonicalUsers),
      providers: {
        password: { enabled: passwordEnabled },
        oidc: { instances: projectOidc },
      },
    },
    localAuth: {
      providers: {
        ...(passwordEnabled ? { password: { accounts: passwordAccounts } } : {}),
        ...(Object.keys(localOidc).length > 0 ? { oidc: { instances: localOidc } } : {}),
      },
    },
    canonicalUsers,
    requiresPublicOrigin: Object.keys(projectOidc).length > 0,
    summary: requiredAuthSummary(canonicalUsers, passwordEnabled, passwordAccounts, projectOidc),
  };
}

async function addPasswordAccount(
  options: AuthInitOptions,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  accounts: Record<string, { userId: string; passwordHash: string }>,
): Promise<void> {
  const owner =
    canonicalUsers.size === 0
      ? NEW_USER
      : await chooseUserMode(options.ui, 'Password account belongs to');

  let userId: string;
  let username: string;

  if (owner === NEW_USER) {
    while (true) {
      username = normalizePasswordUsername(await requiredInput(options.ui, 'Username', 'user'));
      if (Object.hasOwn(accounts, username)) {
        options.ui.note(`Password account '${username}' already exists.`, 'Username');
        continue;
      }
      if (canonicalUsers.has(username)) {
        options.ui.note(
          `User '${username}' already exists. ` +
            'Choose Existing user to add another login method.',
          'Username',
        );
        continue;
      }
      break;
    }

    userId = username;
    const displayName = await requiredInput(options.ui, 'Display name', username);
    await addCanonicalUser(options, canonicalUsers, userId, { name: displayName });
  } else {
    userId = await chooseExistingUser(options.ui, canonicalUsers);
    username = await uniquePasswordUsername(options.ui, accounts, userId);
  }

  const password = await confirmedSecret(options.ui, 'Password', 'Confirm password');
  const passwordHash = await (options.hashPassword ?? hashRuntimePassword)(password);
  accounts[username] = { userId, passwordHash };
}

async function addOidcProvider(
  options: AuthInitOptions,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  existing: Readonly<Record<string, OidcProjectSetup>>,
): Promise<{
  readonly id: string;
  readonly project: OidcProjectSetup;
  readonly clientSecret: string;
}> {
  const { ui } = options;
  const name = await requiredOidcProviderName(ui, existing);
  const generatedId = oidcProviderIdFromName(name);
  const suggestedId = generatedId === '' ? 'company' : generatedId;
  const id = await requiredProviderId(ui, existing, suggestedId);
  const issuer = await requiredOidcIssuer(ui);
  const clientId = await requiredInput(ui, 'Client ID');
  const clientSecret = await requiredSecret(ui, 'Client secret');
  const allowedEmails = dictionary<string>();

  do {
    let email: string;
    while (true) {
      email = (await requiredInput(ui, 'Allowed email')).trim().toLowerCase();
      if (email.includes('@') && !Object.hasOwn(allowedEmails, email)) break;
      ui.note(
        Object.hasOwn(allowedEmails, email)
          ? `Identity '${email}' is already configured for this provider.`
          : 'Enter a valid email address.',
        'OIDC identity',
      );
    }

    const userId = await resolveOidcUser(options, canonicalUsers, email);
    allowedEmails[email] = userId;
  } while (await ui.confirm('Add another allowed identity for this provider?', false));

  return {
    id,
    project: { name, enabled: true, issuer, clientId, allowedEmails },
    clientSecret,
  };
}

async function resolveOidcUser(
  options: AuthInitOptions,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  email: string,
): Promise<string> {
  if (canonicalUsers.has(email)) return email;

  // OIDC supplies the human-facing profile at sign-in time. The normalized
  // allowed email is the stable configured identity and fallback display value.
  await addCanonicalUser(options, canonicalUsers, email, { name: email });
  return email;
}

async function addCanonicalUser(
  options: AuthInitOptions,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  userId: string,
  user: RuntimeUserConfig,
): Promise<void> {
  if (canonicalUsers.has(userId)) {
    throw new Error(`Canonical user '${userId}' already exists.`);
  }
  canonicalUsers.set(userId, user);
  await options.onUserCreated(userId, user);
}

async function chooseUserMode(
  ui: RuntimeSetupUi,
  message: string,
): Promise<typeof NEW_USER | typeof EXISTING_USER> {
  return ui.select<typeof NEW_USER | typeof EXISTING_USER>(
    message,
    [
      { value: NEW_USER, label: 'New user' },
      { value: EXISTING_USER, label: 'Existing user' },
    ],
    NEW_USER,
  );
}

async function chooseExistingUser(
  ui: RuntimeSetupUi,
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
): Promise<string> {
  return ui.select(
    'Existing user',
    [...canonicalUsers.entries()].map(([id, user]) => ({
      value: id,
      label: user.name === id ? id : `${user.name} (${id})`,
    })),
  );
}

async function uniquePasswordUsername(
  ui: RuntimeSetupUi,
  accounts: Readonly<Record<string, unknown>>,
  defaultValue: string,
): Promise<string> {
  while (true) {
    const username = normalizePasswordUsername(await requiredInput(ui, 'Username', defaultValue));
    if (!Object.hasOwn(accounts, username)) return username;
    ui.note(`Password account '${username}' already exists.`, 'Username');
  }
}

async function requiredOidcProviderName(
  ui: RuntimeSetupUi,
  existing: Readonly<Record<string, OidcProjectSetup>>,
): Promise<string> {
  const existingNames = new Set(
    Object.values(existing).map((provider) => oidcProviderNameKey(provider.name)),
  );

  while (true) {
    const name = normalizeOidcProviderName(
      await requiredInput(ui, 'OIDC provider name', 'Company SSO'),
    );
    if (!isValidOidcProviderName(name)) {
      ui.note(
        `Provider name must be a single-line display name of at most ${String(
          OIDC_PROVIDER_NAME_MAX_LENGTH,
        )} characters.`,
        'OIDC provider name',
      );
      continue;
    }

    if (existingNames.has(oidcProviderNameKey(name))) {
      ui.note(
        `An OIDC provider named '${name}' already exists. Provider names must be unique.`,
        'OIDC provider name',
      );
      continue;
    }

    return name;
  }
}

async function requiredOidcIssuer(ui: RuntimeSetupUi): Promise<string> {
  while (true) {
    const value = await requiredInput(ui, 'Issuer URL', 'https://accounts.google.com');
    try {
      return absoluteHttpsUrl(value, 'OIDC issuer');
    } catch (error) {
      if (!(error instanceof RuntimeConfigError)) throw error;
      ui.note(error.message, 'OIDC issuer');
    }
  }
}

async function requiredProviderId(
  ui: RuntimeSetupUi,
  existing: Readonly<Record<string, OidcProjectSetup>>,
  suggested: string,
): Promise<string> {
  while (true) {
    const id = (await requiredInput(ui, 'Provider id', suggested)).trim();
    if (isValidOidcProviderId(id) && !Object.hasOwn(existing, id)) return id;

    ui.note(
      Object.hasOwn(existing, id)
        ? `OIDC provider '${id}' already exists.`
        : 'Provider id must be a lowercase slug containing letters, digits, ' +
            'and internal hyphens.',
      'Provider id',
    );
  }
}

function requiredAuthSummary(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
  passwordEnabled: boolean,
  passwordAccounts: Readonly<Record<string, { userId: string; passwordHash: string }>>,
  oidcProviders: Readonly<Record<string, OidcProjectSetup>>,
): readonly string[] {
  const methods = [
    ...(passwordEnabled ? ['username/password'] : []),
    ...(Object.keys(oidcProviders).length > 0 ? ['OIDC'] : []),
  ];
  const lines = ['Authentication: required', `Login methods: ${methods.join(', ')}`];

  if (passwordEnabled) {
    lines.push('Password accounts:');
    for (const [username, account] of Object.entries(passwordAccounts)) {
      lines.push(`  - ${username} -> ${formatUser(canonicalUsers, account.userId)}`);
    }
  }

  if (Object.keys(oidcProviders).length > 0) {
    lines.push('OIDC providers:');
    for (const [providerId, provider] of Object.entries(oidcProviders)) {
      lines.push(`  - ${provider.name} [${providerId}]`);
      lines.push(`    Issuer: ${provider.issuer}`);
      lines.push(`    Client ID: ${provider.clientId}`);
      for (const [email, userId] of Object.entries(provider.allowedEmails)) {
        lines.push(`    ${email} -> ${formatUser(canonicalUsers, userId)}`);
      }
    }
  }

  return [...lines, ...canonicalUserSummary(canonicalUsers)];
}

function canonicalUserSummary(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
): readonly string[] {
  return [
    'Users:',
    ...[...canonicalUsers.keys()].map((userId) => `  - ${formatUser(canonicalUsers, userId)}`),
  ];
}

function usersConfig(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
): Record<string, RuntimeUserConfig> {
  const result = dictionary<RuntimeUserConfig>();
  for (const [userId, user] of canonicalUsers) result[userId] = user;
  return result;
}

function formatUser(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
  userId: string,
): string {
  const user = canonicalUsers.get(userId);
  if (!user || user.name === userId) return userId;
  return `${user.name} (${userId})`;
}

async function requiredInput(
  ui: RuntimeSetupUi,
  message: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const value = (await ui.input(message, defaultValue)).trim();
    if (value) return value;
  }
}

async function requiredSecret(ui: RuntimeSetupUi, message: string): Promise<string> {
  while (true) {
    const value = await ui.secret(message);
    if (value.length > 0) return value;
  }
}

async function confirmedSecret(
  ui: RuntimeSetupUi,
  message: string,
  confirmationMessage: string,
): Promise<string> {
  while (true) {
    const value = await requiredSecret(ui, message);
    const confirmation = await ui.secret(confirmationMessage);
    if (value === confirmation) return value;
    ui.note('The values do not match. Try again.', 'Password');
  }
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
