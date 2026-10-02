import { describe, expect, it } from 'vitest';

import { assertNoProjectAuthSecrets, parseAuthConfig } from '../../src/auth/config.js';
import { PASSWORD_USERNAME_MAX_LENGTH } from '../../src/auth/password-policy.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

function requiredAuthConfig() {
  const allowedEmails: Record<string, string> = {
    'demo@example.com': 'demo-user',
  };
  const accounts: Record<string, { userId: string; passwordHash: string }> = {
    demo: {
      userId: 'demo-user',
      passwordHash: PASSWORD_HASH,
    },
  };

  return {
    mode: 'required',
    users: {
      'demo-user': { name: 'Demo User' },
    },
    providers: {
      password: {
        enabled: true,
        accounts,
      },
      oidc: {
        enabled: true,
        issuer: 'https://issuer.example.test',
        clientId: 'client-id',
        clientSecret: 'local-secret',
        allowedEmails,
      },
    },
  };
}

describe('auth configuration', () => {
  it('owns provider parsing and auth invariants', () => {
    expect(parseAuthConfig(requiredAuthConfig())).toMatchObject({
      mode: 'required',
      providers: {
        password: { enabled: true },
        oidc: {
          enabled: true,
          issuer: 'https://issuer.example.test',
          clientId: 'client-id',
        },
      },
    });
  });

  it('keeps configured password usernames within the HTTP login boundary', () => {
    const maxUsername = 'u'.repeat(PASSWORD_USERNAME_MAX_LENGTH);
    const accepted = requiredAuthConfig();
    accepted.providers.password.accounts = {
      [maxUsername]: {
        userId: 'demo-user',
        passwordHash: PASSWORD_HASH,
      },
    };

    expect(() => parseAuthConfig(accepted)).not.toThrow();

    const rejected = requiredAuthConfig();
    rejected.providers.password.accounts = {
      [`${maxUsername}x`]: {
        userId: 'demo-user',
        passwordHash: PASSWORD_HASH,
      },
    };

    expect(() => parseAuthConfig(rejected)).toThrowError(
      new RegExp(`usernames must be at most ${String(PASSWORD_USERNAME_MAX_LENGTH)} characters`),
    );
  });

  it('requires HTTPS OIDC issuers', () => {
    const config = requiredAuthConfig();
    config.providers.oidc.issuer = 'http://issuer.example.test';

    expect(() => parseAuthConfig(config)).toThrowError(
      /auth\.providers\.oidc\.issuer must be an absolute HTTPS URL/,
    );
  });

  it('rejects normalized OIDC email collisions', () => {
    const config = requiredAuthConfig();
    config.providers.oidc.allowedEmails = {
      'Demo@example.com': 'demo-user',
      ' demo@example.com ': 'demo-user',
    };

    expect(() => parseAuthConfig(config)).toThrowError(
      /duplicate email after normalization.*demo@example\.com/i,
    );
  });

  it('owns project-secret rejection for auth', () => {
    expect(() =>
      assertNoProjectAuthSecrets({
        mode: 'required',
        providers: {
          password: { enabled: false },
          oidc: {
            enabled: false,
            clientSecret: 'committed-secret',
          },
        },
      }),
    ).toThrowError(/clientSecret must be configured only in the local SpecFlow config/);
  });
});
