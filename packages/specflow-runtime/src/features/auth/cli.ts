import { Command } from 'commander';

import { hashPassword } from './authentication/password-login/hash';
import { PASSWORD_MAX_LENGTH } from './authentication/password-login/policy';

export interface AuthCommandContext {
  readonly stdout: (line: string) => void;
  readonly readPasswordFromStdin?: () => Promise<string>;
}

export function createAuthCommand(context: AuthCommandContext): Command {
  const auth = new Command('auth').description('Authentication utilities');

  auth
    .command('hash-password')
    .description('Generate a password hash for local Runtime configuration')
    .requiredOption('--password-stdin', 'read exactly one password line from stdin')
    .action(async () => {
      if (!context.readPasswordFromStdin) {
        throw new Error('Password stdin is not available in this CLI context.');
      }

      const password = passwordFromStdin(await context.readPasswordFromStdin());
      context.stdout(await hashPassword(password));
    });

  return auth;
}

function passwordFromStdin(input: string): string {
  const password = input.endsWith('\r\n')
    ? input.slice(0, -2)
    : input.endsWith('\n')
      ? input.slice(0, -1)
      : input;

  if (password.includes('\n') || password.includes('\r')) {
    throw new Error('Password input must contain exactly one line.');
  }
  if (password.length === 0) {
    throw new Error('Password must not be empty.');
  }
  if ([...password].length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  return password;
}
