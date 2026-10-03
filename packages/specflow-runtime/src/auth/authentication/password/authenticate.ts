import type { RuntimeAuthConfig } from '../config/model';
import { verifyPassword } from './hash';
import { normalizePasswordUsername } from './username';
import { configuredUser, type AuthUser } from '../session/model';

const DUMMY_PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

export async function authenticatePassword(
  auth: RuntimeAuthConfig,
  username: string,
  password: string,
): Promise<AuthUser | null> {
  if (!auth.providers.password.enabled) return null;

  const normalizedUsername = normalizePasswordUsername(username);
  const accounts = auth.providers.password.accounts;
  const account = Object.hasOwn(accounts, normalizedUsername)
    ? accounts[normalizedUsername]
    : undefined;
  const valid = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!account || !valid) return null;

  return configuredUser(auth, account.userId);
}
