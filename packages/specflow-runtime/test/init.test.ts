import { describe, expect, it } from 'vitest';

import { initRuntime, type RuntimeSetupChoice, type RuntimeSetupUi } from '../src/index';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

class ScriptedUi implements RuntimeSetupUi {
  readonly notes: string[] = [];
  readonly selectDefaults: Array<string | undefined> = [];

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

  select<T extends string>(
    _message: string,
    _choices: readonly RuntimeSetupChoice<T>[],
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
    return Promise.resolve(value as T);
  }

  input(_message: string, defaultValue?: string): Promise<string> {
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

  it(
    'owns no-auth attribution and guarantees an administrator even after a non-admin selection',
    async () => {
    const ui = new ScriptedUi(
      [false],
      ['developer', '<default>'],
      ['demo-user', 'Demo User'],
    );
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
    },
  );

  it('defaults the bootstrap user to admin and additional users to developer', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['__new__', '<default>', '<default>'],
      ['demo', '<default>', 'Demo User', 'jane', '<default>', 'Jane User'],
      ['demo-password', 'demo-password', 'jane-password', 'jane-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.selectDefaults.slice(-2)).toEqual(['admin', 'developer']);
    expect(contribution.projectConfig).toMatchObject({
      authorization: {
        assignments: [
          { userId: 'demo', role: 'admin', scope: {} },
          { userId: 'jane', role: 'developer', scope: {} },
        ],
      },
    });
    const review = contribution.summary.join('\n');
    expect(review).toContain('Demo User (demo): admin');
    expect(review).toContain('Jane User (jane): developer');
  });

  it(
    'supports multiple OIDC instances, rejects ambiguous names, and reviews mappings without secrets',
    async () => {
    const ui = new ScriptedUi(
      [true, false, true, false, true, false, false],
      ['demo', '<default>'],
      [
        'Company SSO',
        'company',
        '<default>',
        'company-client-id',
        'demo@example.com',
        '<default>',
        'Demo User',
        ' company sso ',
        'Customer Workforce Identity',
        'customer',
        'https://login.customer.example',
        'customer-client-id',
        'demo@customer.example',
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
    },
  );
});
