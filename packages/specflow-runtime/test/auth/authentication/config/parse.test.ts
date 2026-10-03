import { describe, expect, it } from 'vitest';

import { parseAuthConfig } from '../../../../src/auth/authentication/config/parse';
import { PASSWORD_USERNAME_MAX_LENGTH } from '../../../../src/auth/authentication/password/policy';
import { PASSWORD_HASH } from '../../support/config';

function requiredAuthConfig() {
  return {
    mode: 'required',
    users: {
      'demo-user': { name: 'Demo User' },
    } as Record<string, { name: string }>,
    providers: {
      password: {
        enabled: true,
        accounts: {
          demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
        } as Record<string, { userId: string; passwordHash: string }>,
      },
      oidc: {
        enabled: true,
        issuer: 'https://issuer.example.test',
        clientId: 'client-id',
        clientSecret: 'local-secret',
        allowedEmails: {
          'demo@example.com': 'demo-user',
        } as Record<string, string>,
      },
    },
  };
}

describe('authentication config parsing', () => {
  it('returns a narrowed enabled OIDC configuration', () => {
    const parsed = parseAuthConfig(requiredAuthConfig());
    expect(parsed.providers.oidc).toMatchObject({
      enabled: true,
      issuer: 'https://issuer.example.test',
      clientId: 'client-id',
      clientSecret: 'local-secret',
    });
  });

  it('normalizes password account names and rejects collisions', () => {
    const normalized = requiredAuthConfig();
    normalized.providers.password.accounts = {
      ' Demo ': { userId: 'demo-user', passwordHash: PASSWORD_HASH },
    };
    expect(Object.keys(parseAuthConfig(normalized).providers.password.accounts)).toEqual(['demo']);

    const collision = requiredAuthConfig();
    collision.providers.password.accounts = {
      Demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
      ' demo ': { userId: 'demo-user', passwordHash: PASSWORD_HASH },
    };
    expect(() => parseAuthConfig(collision)).toThrowError(
      /duplicate username after normalization/i,
    );
  });

  it('keeps configured usernames inside the HTTP boundary using Unicode code-point length', () => {
    const maxUsername = '😀'.repeat(PASSWORD_USERNAME_MAX_LENGTH);
    const accepted = requiredAuthConfig();
    accepted.providers.password.accounts = {
      [maxUsername]: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
    };
    expect(() => parseAuthConfig(accepted)).not.toThrow();

    const rejected = requiredAuthConfig();
    rejected.providers.password.accounts = {
      [`${maxUsername}😀`]: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
    };
    expect(() => parseAuthConfig(rejected)).toThrowError(/usernames must be at most/);
  });

  it('requires HTTPS OIDC issuers and complete enabled-provider settings', () => {
    const insecure = requiredAuthConfig();
    insecure.providers.oidc.issuer = 'http://issuer.example.test';
    expect(() => parseAuthConfig(insecure)).toThrowError(/must be an absolute HTTPS URL/);

    const missingSecret = requiredAuthConfig();
    delete (missingSecret.providers.oidc as { clientSecret?: string }).clientSecret;
    expect(() => parseAuthConfig(missingSecret)).toThrowError(/clientSecret are required/);
  });

  it('rejects normalized OIDC email collisions without rewriting opaque secrets', () => {
    const collision = requiredAuthConfig();
    collision.providers.oidc.allowedEmails = {
      'Demo@example.com': 'demo-user',
      ' demo@example.com ': 'demo-user',
    };
    expect(() => parseAuthConfig(collision)).toThrowError(/duplicate email after normalization/i);

    const secret = requiredAuthConfig();
    secret.providers.oidc.clientSecret = ' secret-with-significant-spaces ';
    const parsed = parseAuthConfig(secret);
    expect(parsed.providers.oidc.enabled && parsed.providers.oidc.clientSecret).toBe(
      ' secret-with-significant-spaces ',
    );
  });

  it('does not treat inherited object properties as configured users', () => {
    const config = requiredAuthConfig();
    config.providers.password.accounts.demo = {
      userId: 'toString',
      passwordHash: PASSWORD_HASH,
    };

    expect(() => parseAuthConfig(config)).toThrowError(/references unknown user 'toString'/);
  });

  it('stores special dictionary keys without mutating object prototypes', () => {
    const config = requiredAuthConfig();
    config.users = Object.fromEntries([['__proto__', { name: 'Proto User' }]]);
    config.providers.password.accounts.demo = {
      userId: '__proto__',
      passwordHash: PASSWORD_HASH,
    };
    config.providers.oidc.allowedEmails = {
      'proto@example.com': '__proto__',
    };

    const parsed = parseAuthConfig(config);
    expect(Object.getPrototypeOf(parsed.users)).toBeNull();
    expect(Object.hasOwn(parsed.users, '__proto__')).toBe(true);
    expect(parsed.users.__proto__).toEqual({ name: 'Proto User' });
  });
});
