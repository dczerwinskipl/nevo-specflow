import { describe, expect, it } from 'vitest';

import {
  initRuntime,
  type RuntimeSetupChoice,
  type RuntimeSetupSelectValue,
  type RuntimeSetupUi,
} from '../src/index';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

class ScriptedUi implements RuntimeSetupUi {
  readonly notes: string[] = [];
  readonly selectDefaults: (RuntimeSetupSelectValue | undefined)[] = [];
  readonly inputMessages: string[] = [];

  constructor(
    private readonly confirmations: boolean[],
    private readonly selections: string[],
    private readonly inputs: string[],
    private readonly secrets: string[] = [],
  ) {}

  confirm(): Promise<boolean> {
    const value = this.confirmations.shift();
    if (value === undefined) throw new Error('Missing scripted confirmation.');
    return Promise.resolve(value);
  }

  select<T extends RuntimeSetupSelectValue>(
    _message: string,
    choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T> {
    this.selectDefaults.push(initialValue);
    const value = this.selections.shift();
    if (!value) throw new Error('Missing scripted selection.');

    if (value === '<default>') {
      if (initialValue === undefined) {
        throw new Error('Script requested a missing default selection.');
      }
      return Promise.resolve(initialValue);
    }

    if (value === '<create>') {
      const createChoice = choices.find((choice) => typeof choice.value === 'symbol');
      if (!createChoice) throw new Error('Script requested a missing create-user selection.');
      return Promise.resolve(createChoice.value);
    }

    const matchingChoice = choices.find((choice) => choice.value === value);
    if (!matchingChoice) {
      throw new Error(`Scripted selection '${value}' is not available.`);
    }
    return Promise.resolve(matchingChoice.value);
  }

  input(message: string, defaultValue?: string): Promise<string> {
    this.inputMessages.push(message);
    const value = this.inputs.shift();
    if (value === undefined) throw new Error('Missing scripted input.');
    return Promise.resolve(value === '<default>' ? (defaultValue ?? '') : value);
  }

  secret(): Promise<string> {
    const value = this.secrets.shift();
    if (value === undefined) throw new Error('Missing scripted secret.');
    return Promise.resolve(value);
  }

  note(message: string): void {
    this.notes.push(message);
  }
}

describe('Runtime project initialization', () => {
  it('owns password auth, hashing, authorization and a secret-free review', async () => {
    const ui = new ScriptedUi(
      [true, true, false, false],
      ['<default>'],
      ['demo', '<default>', 'Demo User'],
      ['test123', 'test123'],
    );
    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(contribution.projectConfig).toMatchObject({
      server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
      auth: {
        mode: 'required',
        users: { demo: { name: 'Demo User' } },
        providers: {
          password: { enabled: true },
          oidc: { instances: {} },
        },
      },
      authorization: {
        assignments: [{ userId: 'demo', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.projectConfig).not.toHaveProperty('auth.providers.password.accounts');
    expect(contribution.localConfig).toEqual({
      auth: {
        providers: {
          password: {
            accounts: {
              demo: { userId: 'demo', passwordHash: PASSWORD_HASH },
            },
          },
        },
      },
    });

    const review = contribution.summary.join('\n');
    expect(review).toContain('Authentication: required');
    expect(review).toContain('Login methods: username/password');
    expect(review).toContain('demo -> Demo User (demo)');
    expect(review).toContain('Demo User (demo): admin');
    expect(review).not.toContain('test123');
    expect(review).not.toContain(PASSWORD_HASH);
  });

  it('guarantees an administrator for trusted local setup', async () => {
    const ui = new ScriptedUi([false], ['developer', '<default>'], ['demo-user', 'Demo User']);
    const contribution = await initRuntime({ ui });

    expect(contribution.projectConfig).toMatchObject({
      auth: {
        mode: 'none',
        users: { 'demo-user': { name: 'Demo User' } },
      },
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.localConfig).toEqual({
      auth: { localUserId: 'demo-user' },
    });
    expect(ui.notes.join('\n')).toMatch(/at least one administrator is required/i);
    expect(contribution.summary.join('\n')).toContain('Demo User (demo-user): admin');
  });

  it('keeps bootstrap role defaults in canonical-user creation order for integer-like ids', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['<create>', '<default>', '<default>'],
      ['ten', '10', 'Ten User', 'two', '2', 'Two User'],
      ['ten-password', 'ten-password', 'two-password', 'two-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.selectDefaults.slice(-2)).toEqual(['admin', 'developer']);
    expect(contribution.projectConfig).toMatchObject({
      authorization: {
        assignments: [
          { userId: '10', role: 'admin', scope: {} },
          { userId: '2', role: 'developer', scope: {} },
        ],
      },
    });
    const review = contribution.summary.join('\n');
    expect(review.indexOf('Ten User (10): admin')).toBeLessThan(
      review.indexOf('Two User (2): developer'),
    );
  });

  it('allows a canonical user id that matched the former create-user sentinel', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['__new__', '<default>'],
      ['first', '__new__', 'Sentinel User', 'second'],
      ['first-password', 'first-password', 'second-password', 'second-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(contribution.projectConfig).toMatchObject({
      auth: {
        users: { __new__: { name: 'Sentinel User' } },
      },
      authorization: {
        assignments: [{ userId: '__new__', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.localConfig).toMatchObject({
      auth: {
        providers: {
          password: {
            accounts: {
              first: { userId: '__new__' },
              second: { userId: '__new__' },
            },
          },
        },
      },
    });
  });

  it('reprompts an invalid OIDC issuer before collecting downstream provider fields', async () => {
    const ui = new ScriptedUi(
      [true, false, true, false, false],
      ['<default>'],
      [
        'Company SSO',
        'company',
        'http://issuer.example.test',
        'https://issuer.example.test',
        'company-client-id',
        'demo@example.com',
        'demo',
        'Demo User',
        '<default>',
      ],
      ['company-secret'],
    );

    const contribution = await initRuntime({ ui });

    expect(ui.notes.join('\n')).toMatch(/absolute HTTPS URL/i);
    expect(ui.inputMessages).toEqual(
      expect.arrayContaining(['Issuer URL', 'Client ID', 'Allowed email']),
    );
    expect(ui.inputMessages.indexOf('Issuer URL')).toBeLessThan(
      ui.inputMessages.indexOf('Client ID'),
    );
    expect(contribution.projectConfig).toMatchObject({
      auth: {
        providers: {
          oidc: {
            instances: {
              company: { issuer: 'https://issuer.example.test' },
            },
          },
        },
      },
    });
  });

  it('reviews multiple OIDC mappings without secrets', async () => {
    const ui = new ScriptedUi(
      [true, false, true, false, true, false, false],
      ['demo', '<default>'],
      [
        'Company SSO',
        'Company',
        'company',
        '<default>',
        'company-client-id',
        'demo@example.com',
        '<default>',
        'Demo User',
        'A'.repeat(33),
        ' company sso ',
        'Customer Workforce Identity',
        'customer',
        'https://login.customer.example',
        'customer-client-id',
        'demo@customer.example',
        '<default>',
        '<default>',
      ],
      ['company-secret', 'customer-secret'],
    );

    const contribution = await initRuntime({ ui });

    expect(contribution.projectConfig).toMatchObject({
      server: { publicOrigin: 'http://127.0.0.1:5173' },
      auth: {
        mode: 'required',
        providers: {
          password: { enabled: false },
          oidc: {
            instances: {
              company: {
                name: 'Company SSO',
                clientId: 'company-client-id',
                allowedEmails: { 'demo@example.com': 'demo' },
              },
              customer: {
                name: 'Customer Workforce Identity',
                clientId: 'customer-client-id',
                allowedEmails: { 'demo@customer.example': 'demo' },
              },
            },
          },
        },
      },
    });
    expect(contribution.localConfig).toEqual({
      auth: {
        providers: {
          oidc: {
            instances: {
              company: { clientSecret: 'company-secret' },
              customer: { clientSecret: 'customer-secret' },
            },
          },
        },
      },
    });

    expect(ui.notes.join('\n')).toMatch(/lowercase slug/i);
    expect(ui.notes.join('\n')).toMatch(/at most 32 characters/i);
    expect(ui.notes.join('\n')).toMatch(/provider names must be unique/i);
    const review = contribution.summary.join('\n');
    expect(review).toContain('Company SSO [company]');
    expect(review).toContain('Issuer: https://accounts.google.com');
    expect(review).toContain('Client ID: company-client-id');
    expect(review).toContain('demo@example.com -> Demo User (demo)');
    expect(review).toContain('Customer Workforce Identity [customer]');
    expect(review).toContain('demo@customer.example -> Demo User (demo)');
    expect(review).toContain('Demo User (demo): admin');
    expect(review).not.toContain('company-secret');
    expect(review).not.toContain('customer-secret');
  });
});
