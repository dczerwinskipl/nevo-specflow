import { describe, expect, it } from 'vitest';

import type { RuntimeAuthenticationConfig } from '../configuration/model';
import { verifyPasswordCredentials } from './verify-credentials';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

const auth: RuntimeAuthenticationConfig = {
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
      verifyPasswordCredentials(auth, ' Demo ', 'correct horse battery staple'),
    ).resolves.toEqual({ id: 'demo-user', name: 'Demo User' });
  });

  it('does not reveal whether the account or password was wrong', async () => {
    await expect(verifyPasswordCredentials(auth, 'missing', 'wrong password')).resolves.toBeNull();
    await expect(verifyPasswordCredentials(auth, 'demo', 'wrong password')).resolves.toBeNull();
  });
});
