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
}

interface OidcProjectSetup {
  readonly name: string;
  readonly enabled: true;
  readonly issuer: string;
  readonly clientId: string;
  readonly allowedEmails: Readonly<Record<string, string>>;
}

const CREATE_USER = Symbol('create-user');

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
    const canonicalUsers = new Map<string, RuntimeUserConfig>([[userId, { name: displayName }]]);

    return {
      projectAuth: {
        mode: 'none',
        users: usersConfig(canonicalUsers),
        providers: {
          password: { enabled: false },
          oidc: { instances: {} },
        },
      },
      localAuth: {
        localUserId: userId,
      },
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
      const provider = await addOidcProvider(ui, canonicalUsers, projectOidc);
      projectOidc[provider.id] = provider.project;
      localOidc[provider.id] = { clientSecret: provider.clientSecret };
      addOidc = await ui.confirm('Add another OIDC provider?', false);
    }

    if (!passwordEnabled && Object.keys(projectOidc).length === 0) {
      ui.note(
        'Authentication requires at least one login method. Enable password login or add an OIDC provider.',
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
    summary: requiredAuthSummary(
      canonicalUsers,
      passwordEnabled,
      passwordAccounts,
      projectOidc,
    ),
  };
}

async function addPasswordAccount(
  options: AuthInitOptions,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  accounts: Record<string, { userId: string; passwordHash: string }>,
): Promise<void> {
  const { ui } = options;
  let username: string;

  while (true) {
    username = normalizePasswordUsername(await requiredInput(ui, 'Username', 'user'));
    if (!Object.hasOwn(accounts, username)) break;
    ui.note(`Password account '${username}' already exists.`, 'Username');
  }

  const userId = await selectCanonicalUser(ui, canonicalUsers, username);
  const password = await confirmedSecret(ui, 'Password', 'Confirm password');
  const passwordHash = await (options.hashPassword ?? hashRuntimePassword)(password);
  accounts[username] = { userId, passwordHash };
}

async function addOidcProvider(
  ui: RuntimeSetupUi,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  existing: Readonly<Record<string, OidcProjectSetup>>,
): Promise<{
  readonly id: string;
  readonly project: OidcProjectSetup;
  readonly clientSecret: string;
}> {
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
          ? `Identity '${email}' is already mapped for this provider.`
          : 'Enter a valid email address.',
        'OIDC identity',
      );
    }

    const emailLocalPart = email.split('@')[0]?.trim() ?? '';
    const suggestedUserId = emailLocalPart === '' ? 'user' : emailLocalPart;
    const userId = await selectCanonicalUser(ui, canonicalUsers, suggestedUserId);
    allowedEmails[email] = userId;
  } while (await ui.confirm('Add another allowed identity for this provider?', false));

  return {
    id,
    project: {
      name,
      enabled: true,
      issuer,
      clientId,
      allowedEmails,
    },
    clientSecret,
  };
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
        `Provider name must be a single-line display name of at most ${String(OIDC_PROVIDER_NAME_MAX_LENGTH)} characters.`,
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

async function selectCanonicalUser(
  ui: RuntimeSetupUi,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  suggestedUserId: string,
): Promise<string> {
  if (canonicalUsers.size === 0) {
    return createCanonicalUser(ui, canonicalUsers, suggestedUserId);
  }

  const choices = [
    ...[...canonicalUsers.entries()].map(([id, user]) => ({
      value: id,
      label: `${user.name} (${id})`,
    })),
    { value: CREATE_USER, label: 'Create new user' },
  ] as const;
  const initialValue = canonicalUsers.has(suggestedUserId) ? suggestedUserId : CREATE_USER;
  const selected = await ui.select('Canonical user', choices, initialValue);

  return selected === CREATE_USER
    ? createCanonicalUser(ui, canonicalUsers, suggestedUserId)
    : selected;
}

async function createCanonicalUser(
  ui: RuntimeSetupUi,
  canonicalUsers: Map<string, RuntimeUserConfig>,
  suggestedUserId: string,
): Promise<string> {
  let userId: string;
  while (true) {
    userId = await requiredInput(ui, 'User id', suggestedUserId);
    if (!canonicalUsers.has(userId)) break;
    ui.note(`User '${userId}' already exists. Select it instead or choose another id.`, 'User');
  }

  const displayName = await requiredInput(ui, 'Display name', userId);
  canonicalUsers.set(userId, { name: displayName });
  return userId;
}

async function requiredProviderId(
  ui: RuntimeSetupUi,
  existing: Readonly<Record<string, OidcProjectSetup>>,
  suggested: string,
): Promise<string> {
  while (true) {
    const id = (await requiredInput(ui, 'Provider id', suggested)).trim();
    if (isValidOidcProviderId(id) && !Object.hasOwn(existing, id)) {
      return id;
    }

    ui.note(
      Object.hasOwn(existing, id)
        ? `OIDC provider '${id}' already exists.`
        : 'Provider id must be a lowercase slug containing letters, digits, and internal hyphens.',
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
    'Canonical users:',
    ...[...canonicalUsers.keys()].map(
      (userId) => `  - ${formatUser(canonicalUsers, userId)}`,
    ),
  ];
}

function usersConfig(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
): Record<string, RuntimeUserConfig> {
  const result = dictionary<RuntimeUserConfig>();
  for (const [userId, user] of canonicalUsers) {
    result[userId] = user;
  }
  return result;
}

function formatUser(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
  userId: string,
): string {
  const user = canonicalUsers.get(userId);
  return user ? `${user.name} (${userId})` : userId;
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
