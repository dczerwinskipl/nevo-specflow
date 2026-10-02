import type { RuntimeAuthConfig } from '../config/types.js';

import { verifyPassword } from './password.js';
import { configuredUser, type AuthUser } from './session.js';

// A fixed valid hash keeps unknown usernames on the same scrypt code path as configured accounts.
// It is not a credential and never authenticates a user.
const DUMMY_PASSWORD_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

export async function authenticatePassword(
  auth: RuntimeAuthConfig,
  username: string,
  password: string,
): Promise<AuthUser | null> {
  if (!auth.providers.password.enabled) {
    return null;
  }

  const account = auth.providers.password.accounts[username];
  const valid = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!account || !valid) {
    return null;
  }

  return configuredUser(auth, account.userId);
}
