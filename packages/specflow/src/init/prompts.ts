import type { ProjectInitInput } from './initialize-project.js';

export interface PromptChoice<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ProjectInitPrompter {
  select<T extends string>(message: string, choices: readonly PromptChoice<T>[]): Promise<T>;
  input(message: string, defaultValue?: string): Promise<string>;
  secret(message: string): Promise<string>;
}

export async function collectProjectInitInput(
  prompt: ProjectInitPrompter,
): Promise<ProjectInitInput> {
  const authMode = await prompt.select('Authentication', [
    { value: 'none', label: 'No authentication' },
    { value: 'password', label: 'Password login' },
    { value: 'oidc', label: 'OIDC' },
  ] as const);

  if (authMode === 'none') {
    const userId = await requiredInput(prompt, 'User id', 'local-user');
    const displayName = await requiredInput(prompt, 'Display name', 'Local User');
    return { authMode, userId, displayName };
  }

  if (authMode === 'password') {
    const username = await requiredInput(prompt, 'Username', 'user');
    const userId = await requiredInput(prompt, 'User id', username);
    const displayName = await requiredInput(prompt, 'Display name', userId);
    const password = await confirmedSecret(prompt, 'Password', 'Confirm password');
    return { authMode, username, userId, displayName, password };
  }

  const issuer = await requiredInput(prompt, 'Issuer URL', 'https://accounts.google.com');
  const clientId = await requiredInput(prompt, 'Client ID');
  const clientSecret = await requiredSecret(prompt, 'Client secret');
  const allowedEmail = await requiredInput(prompt, 'Allowed email');
  const suggestedUserId = allowedEmail.split('@')[0]?.trim() ?? 'user';
  const userId = await requiredInput(prompt, 'User id', suggestedUserId);
  const displayName = await requiredInput(prompt, 'Display name', userId);

  return {
    authMode,
    userId,
    displayName,
    issuer,
    clientId,
    clientSecret,
    allowedEmail,
  };
}

async function requiredInput(
  prompt: ProjectInitPrompter,
  message: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const value = (await prompt.input(message, defaultValue)).trim();
    if (value) return value;
  }
}

async function requiredSecret(prompt: ProjectInitPrompter, message: string): Promise<string> {
  while (true) {
    const value = await prompt.secret(message);
    if (value.length > 0) return value;
  }
}

async function confirmedSecret(
  prompt: ProjectInitPrompter,
  message: string,
  confirmationMessage: string,
): Promise<string> {
  while (true) {
    const value = await requiredSecret(prompt, message);
    const confirmation = await prompt.secret(confirmationMessage);
    if (value === confirmation) return value;
  }
}
