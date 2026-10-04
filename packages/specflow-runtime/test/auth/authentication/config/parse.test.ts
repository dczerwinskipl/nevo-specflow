import { describe, expect, it } from 'vitest';
import { OIDC_PROVIDER_NAME_MAX_LENGTH } from '@nevo/specflow-contracts/authentication';

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
        instances: {
          company: {
            name: 'Company SSO',
            enabled: true,
            issuer: 'https://issuer.example.test',
            clientId: 'client-id',
            clientSecret: 'local-secret',
            allowedEmails: {
              'demo@example.com': 'demo-user',
            } as Record<string, string>,
          },
        },
      },
    },
  };
}

describe('authentication config parsing', () => {
  it('returns narrowed enabled OIDC instances with stable ids and display names', () => {
    const parsed = parseAuthConfig(requiredAuthConfig());
    expect(parsed.providers.oidc.instances.company).toMatchObject({
      name: 'Company SSO',
      enabled: true,
      issuer: 'https://issuer.example.test',
      clientId: 'client-id',
      clientSecret: 'local-secret',
    });
  });

  it.each([
    ['company', true],
    ['company-sso-2', true],
    ['a'.repeat(64), true],
    ['Company', false],
    ['company_sso', false],
    ['-company', false],
    ['company-', false],
    ['a'.repeat(65), false],
  ])('validates OIDC provider id %s consistently', (providerId, valid) => {
    const config = requiredAuthConfig();
    const candidate = {
      ...config,
      providers: {
        ...config.providers,
        oidc: {
          instances: {
            [providerId]: config.providers.oidc.instances.company,
          },
        },
      },
    };

    if (valid) {
      expect(() => parseAuthConfig(candidate)).not.toThrow();
    } else {
      expect(() => parseAuthConfig(candidate)).toThrowError(
        /provider ids must be lowercase slugs/i,
      );
    }
  });

  it('normalizes, bounds and de-duplicates visible OIDC provider names', () => {
    const normalized = requiredAuthConfig();
    normalized.providers.oidc.instances.company.name = ' Company SSO ';
    expect(parseAuthConfig(normalized).providers.oidc.instances.company?.name).toBe('Company SSO');

    const tooLong = requiredAuthConfig();
    tooLong.providers.oidc.instances.company.name = 'A'.repeat(OIDC_PROVIDER_NAME_MAX_LENGTH + 1);
    expect(() => parseAuthConfig(tooLong)).toThrowError(/display name of at most/i);

    const duplicate = requiredAuthConfig();
    expect(() =>
      parseAuthConfig({
        ...duplicate,
        providers: {
          ...duplicate.providers,
          oidc: {
            instances: {
              company: duplicate.providers.oidc.instances.company,
              customer: {
                ...duplicate.providers.oidc.instances.company,
                name: ' company sso ',
              },
            },
          },
        },
      }),
    ).toThrowError(/duplicates the visible provider name/i);
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
    insecure.providers.oidc.instances.company.issuer = 'http://issuer.example.test';
    expect(() => parseAuthConfig(insecure)).toThrowError(/must be an absolute HTTPS URL/);

    const missingSecret = requiredAuthConfig();
    delete (missingSecret.providers.oidc.instances.company as { clientSecret?: string })
      .clientSecret;
    expect(() => parseAuthConfig(missingSecret)).toThrowError(/clientSecret are required/);
  });

  it('rejects normalized OIDC email collisions without rewriting opaque secrets', () => {
    const collision = requiredAuthConfig();
    collision.providers.oidc.instances.company.allowedEmails = {
      'Demo@example.com': 'demo-user',
      ' demo@example.com ': 'demo-user',
    };
    expect(() => parseAuthConfig(collision)).toThrowError(/duplicate email after normalization/i);

    const secret = requiredAuthConfig();
    secret.providers.oidc.instances.company.clientSecret = ' secret-with-significant-spaces ';
    const parsed = parseAuthConfig(secret);
    const company = parsed.providers.oidc.instances.company;
    expect(company?.enabled && company.clientSecret).toBe(' secret-with-significant-spaces ');
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
    config.providers.oidc.instances.company.allowedEmails = {
      'proto@example.com': '__proto__',
    };

    const parsed = parseAuthConfig(config);
    expect(Object.getPrototypeOf(parsed.users)).toBeNull();
    expect(Object.hasOwn(parsed.users, '__proto__')).toBe(true);
    expect(parsed.users.__proto__).toEqual({ name: 'Proto User' });
  });
});
