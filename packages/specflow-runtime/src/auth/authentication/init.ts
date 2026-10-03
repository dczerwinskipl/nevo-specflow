import type { RuntimeInitPrompter } from '../../init/contracts';
import { hashPassword as hashRuntimePassword } from './password/hash';

export interface AuthInitResult {
  readonly projectAuth: Record<string, unknown>;
  readonly localAuth: Record<string, unknown>;
  readonly requiresPublicOrigin: boolean;
}

export interface AuthInitOptions {
  readonly prompter: RuntimeInitPrompter;
  readonly hashPassword?: (password: string) => Promise<string>;
}

export async function initAuth(options: AuthInitOptions): Promise<AuthInitResult> {
  const authMode = await options.prompter.select('Authentication', [
    { value: 'none', label: 'No authentication' },
    { value: 'password', label: 'Password login' },
    { value: 'oidc', label: 'OIDC' },
  ] as const);

  if (authMode === 'none') {
    const userId = await requiredInput(options.prompter, 'User id', 'local-user');
    const displayName = await requiredInput(options.prompter, 'Display name', 'Local User');

    return {
      projectAuth: {
        mode: 'none',
        users: {
          [userId]: { name: displayName },
        },
        providers: {
          password: { enabled: false },
          oidc: { enabled: false },
        },
      },
      localAuth: {
        localUserId: userId,
      },
      requiresPublicOrigin: false,
    };
  }

  if (authMode === 'password') {
    const username = await requiredInput(options.prompter, 'Username', 'user');
    const userId = await requiredInput(options.prompter, 'User id', username);
    const displayName = await requiredInput(options.prompter, 'Display name', userId);
    const password = await confirmedSecret(options.prompter, 'Password', 'Confirm password');
    const passwordHash = await (options.hashPassword ?? hashRuntimePassword)(password);

    return {
      projectAuth: {
        mode: 'required',
        users: {
          [userId]: { name: displayName },
        },
        providers: {
          password: { enabled: true },
          oidc: { enabled: false },
        },
      },
      localAuth: {
        providers: {
          password: {
            accounts: {
              [username]: {
                userId,
                passwordHash,
              },
            },
          },
        },
      },
      requiresPublicOrigin: false,
    };
  }

  const issuer = await requiredInput(options.prompter, 'Issuer URL', 'https://accounts.google.com');
  const clientId = await requiredInput(options.prompter, 'Client ID');
  const clientSecret = await requiredSecret(options.prompter, 'Client secret');
  const allowedEmail = await requiredInput(options.prompter, 'Allowed email');
  const suggestedUserId = allowedEmail.split('@')[0]?.trim() ?? 'user';
  const userId = await requiredInput(options.prompter, 'User id', suggestedUserId);
  const displayName = await requiredInput(options.prompter, 'Display name', userId);

  return {
    projectAuth: {
      mode: 'required',
      users: {
        [userId]: { name: displayName },
      },
      providers: {
        password: { enabled: false },
        oidc: {
          enabled: true,
          issuer,
          clientId,
          allowedEmails: {
            [allowedEmail]: userId,
          },
        },
      },
    },
    localAuth: {
      providers: {
        oidc: {
          clientSecret,
        },
      },
    },
    requiresPublicOrigin: true,
  };
}

async function requiredInput(
  prompter: RuntimeInitPrompter,
  message: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const value = (await prompter.input(message, defaultValue)).trim();
    if (value) return value;
  }
}

async function requiredSecret(prompter: RuntimeInitPrompter, message: string): Promise<string> {
  while (true) {
    const value = await prompter.secret(message);
    if (value.length > 0) return value;
  }
}

async function confirmedSecret(
  prompter: RuntimeInitPrompter,
  message: string,
  confirmationMessage: string,
): Promise<string> {
  while (true) {
    const value = await requiredSecret(prompter, message);
    const confirmation = await prompter.secret(confirmationMessage);
    if (value === confirmation) return value;
  }
}
