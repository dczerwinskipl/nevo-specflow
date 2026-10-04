import type { RuntimeSetupUi } from '../../init/contracts';
import {
  OIDC_PROVIDER_ID_MAX_LENGTH,
  OIDC_PROVIDER_ID_PATTERN,
  type RuntimeUserConfig,
} from './config/model';
import { hashPassword as hashRuntimePassword } from './password/hash';
import { normalizePasswordUsername } from './password/username';

export interface AuthInitResult {
  readonly projectAuth: Record<string, unknown>;
  readonly localAuth: Record<string, unknown>;
  readonly users: Readonly<Record<string, RuntimeUserConfig>>;
  readonly requiresPublicOrigin: boolean;
  readonly summary: string;
}

export interface AuthInitOptions {
  readonly ui: RuntimeSetupUi;
  readonly hashPassword?: (password: string) => Promise<string>;
}

const NEW_USER = '__new__';
const OIDC_PROVIDER_ID_REGEX = new RegExp(OIDC_PROVIDER_ID_PATTERN, 'u');

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
    const users = { [userId]: { name: displayName } };

    return {
      projectAuth: {
        mode: 'none',
        users,
        providers: {
          password: { enabled: false },
          oidc: { instances: {} },
        },
      },
      localAuth: {
        localUserId: userId,
      },
      users,
      requiresPublicOrigin: false,
      summary: 'Authentication: disabled (trusted local identity)',
    };
  }

  const users = dictionary<RuntimeUserConfig>();
  const passwordAccounts = dictionary<{ userId: string; passwordHash: string }>();
  const projectOidc = dictionary<Record<string, unknown>>();
  const localOidc = dictionary<{ clientSecret: string }>();

  let passwordEnabled: boolean;
  do {
    passwordEnabled = await ui.confirm('Enable username/password login?', true);
    if (passwordEnabled) {
      await addPasswordAccount(options, users, passwordAccounts);
      while (await ui.confirm('Add another password account?', false)) {
        await addPasswordAccount(options, users, passwordAccounts);
      }
    }

    let addOidc = await ui.confirm('Add an OIDC provider?', !passwordEnabled);
    while (addOidc) {
      const provider = await addOidcProvider(ui, users, projectOidc);
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

  const methods = [
    ...(passwordEnabled ? ['username/password'] : []),
    ...Object.values(projectOidc).map((provider) => String(provider.name)),
  ];

  return {
    projectAuth: {
      mode: 'required',
      users,
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
    users,
    requiresPublicOrigin: Object.keys(projectOidc).length > 0,
    summary: `Authentication: ${methods.join(' + ')}`,
  };
}

async function addPasswordAccount(
  options: AuthInitOptions,
  users: Record<string, RuntimeUserConfig>,
  accounts: Record<string, { userId: string; passwordHash: string }>,
): Promise<void> {
  const { ui } = options;
  let username: string;

  while (true) {
    username = normalizePasswordUsername(await requiredInput(ui, 'Username', 'user'));
    if (!Object.hasOwn(accounts, username)) break;
    ui.note(`Password account '${username}' already exists.`, 'Username');
  }

  const userId = await selectCanonicalUser(ui, users, username);
  const password = await confirmedSecret(ui, 'Password', 'Confirm password');
  const passwordHash = await (options.hashPassword ?? hashRuntimePassword)(password);
  accounts[username] = { userId, passwordHash };
}

async function addOidcProvider(
  ui: RuntimeSetupUi,
  users: Record<string, RuntimeUserConfig>,
  existing: Readonly<Record<string, unknown>>,
): Promise<{
  readonly id: string;
  readonly project: Record<string, unknown>;
  readonly clientSecret: string;
}> {
  const name = await requiredInput(ui, 'OIDC provider name', 'Company SSO');
  const generatedId = providerIdFromName(name);
  const suggestedId = generatedId === '' ? 'company' : generatedId;
  const id = await requiredProviderId(ui, existing, suggestedId);
  const issuer = await requiredInput(ui, 'Issuer URL', 'https://accounts.google.com');
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
    const userId = await selectCanonicalUser(ui, users, suggestedUserId);
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

async function selectCanonicalUser(
  ui: RuntimeSetupUi,
  users: Record<string, RuntimeUserConfig>,
  suggestedUserId: string,
): Promise<string> {
  const existingIds = Object.keys(users);
  if (existingIds.length === 0) {
    return createCanonicalUser(ui, users, suggestedUserId);
  }

  const selected = await ui.select(
    'Canonical user',
    [
      ...existingIds.map((id) => ({
        value: id,
        label: users[id]?.name ? `${users[id].name} (${id})` : id,
      })),
      { value: NEW_USER, label: 'Create new user' },
    ],
    Object.hasOwn(users, suggestedUserId) ? suggestedUserId : NEW_USER,
  );

  return selected === NEW_USER ? createCanonicalUser(ui, users, suggestedUserId) : selected;
}

async function createCanonicalUser(
  ui: RuntimeSetupUi,
  users: Record<string, RuntimeUserConfig>,
  suggestedUserId: string,
): Promise<string> {
  let userId: string;
  while (true) {
    userId = await requiredInput(ui, 'User id', suggestedUserId);
    if (!Object.hasOwn(users, userId)) break;
    ui.note(`User '${userId}' already exists. Select it instead or choose another id.`, 'User');
  }

  const displayName = await requiredInput(ui, 'Display name', userId);
  users[userId] = { name: displayName };
  return userId;
}

async function requiredProviderId(
  ui: RuntimeSetupUi,
  existing: Readonly<Record<string, unknown>>,
  suggested: string,
): Promise<string> {
  while (true) {
    const id = (await requiredInput(ui, 'Provider id', suggested)).trim();
    if (
      id.length <= OIDC_PROVIDER_ID_MAX_LENGTH &&
      OIDC_PROVIDER_ID_REGEX.test(id) &&
      !Object.hasOwn(existing, id)
    ) {
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

function providerIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, OIDC_PROVIDER_ID_MAX_LENGTH)
    .replace(/-+$/u, '');
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
