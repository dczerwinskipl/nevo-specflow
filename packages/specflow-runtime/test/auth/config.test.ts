import { describe, expect, it } from 'vitest';

import { assertNoProjectAuthSecrets, parseAuthConfig } from '../../src/auth/config.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

function requiredAuthConfig() {
  const allowedEmails: Record<string, string> = {
    'demo@example.com': 'demo-user',
  };

  return {
    mode: 'required',
    users: {
      'demo-user': { name: 'Demo User' },
    },
    providers: {
      password: {
        enabled: true,
        accounts: {
          demo: {
            userId: 'demo-user',
            passwordHash: PASSWORD_HASH,
          },
        },
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
