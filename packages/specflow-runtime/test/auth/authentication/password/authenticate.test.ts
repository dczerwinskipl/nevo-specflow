import { describe, expect, it } from 'vitest';

import type { RuntimeAuthConfig } from '../../../../src/auth/authentication/config/model';
import { authenticatePassword } from '../../../../src/auth/authentication/password/authenticate';
import { PASSWORD_HASH } from '../../support/config';

const auth: RuntimeAuthConfig = {
  mode: 'required',
  users: { 'demo-user': { name: 'Demo User' } },
  providers: {
    password: {
      enabled: true,
      accounts: {
        demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
      },
    },
    oidc: { instances: {} },
  },
};

describe('password authentication', () => {
  it('uses the canonicalized account identifier', async () => {
    await expect(
      authenticatePassword(auth, ' Demo ', 'correct horse battery staple'),
    ).resolves.toEqual({ id: 'demo-user', name: 'Demo User' });
  });

  it('does not reveal whether the account or password was wrong', async () => {
    await expect(authenticatePassword(auth, 'missing', 'wrong password')).resolves.toBeNull();
    await expect(authenticatePassword(auth, 'demo', 'wrong password')).resolves.toBeNull();
  });
});
