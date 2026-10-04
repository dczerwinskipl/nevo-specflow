import { describe, expect, it } from 'vitest';

import {
  initRuntime,
  type RuntimeSetupChoice,
  type RuntimeSetupUi,
} from '../src/index';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

class ScriptedUi implements RuntimeSetupUi {
  readonly notes: string[] = [];

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
  ): Promise<T> {
    const value = this.selections.shift();
    if (!value) throw new Error('Missing scripted selection.');
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
  it('owns password auth, hashing, authorization and project/local split', async () => {
    const contribution = await initRuntime({
      ui: new ScriptedUi(
        [true, true, false, false],
        ['admin'],
        ['demo', '<default>', 'Demo User'],
        ['test123', 'test123'],
      ),
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
  });

  it('owns no-auth attribution and still assigns capabilities to the local identity', async () => {
    const contribution = await initRuntime({
      ui: new ScriptedUi([false], ['developer'], ['demo-user', 'Demo User']),
    });

    expect(contribution.projectConfig).toMatchObject({
      auth: {
        mode: 'none',
        users: { 'demo-user': { name: 'Demo User' } },
      },
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }],
      },
    });
    expect(contribution.localConfig).toEqual({
      auth: { localUserId: 'demo-user' },
    });
  });

  it('supports multiple OIDC instances and keeps each client secret local', async () => {
    const contribution = await initRuntime({
      ui: new ScriptedUi(
        [true, false, true, false, true, false, false],
        ['demo', 'admin'],
        [
          'Company SSO',
          'company',
          '<default>',
          'company-client-id',
          'demo@example.com',
          '<default>',
          'Demo User',
          'Customer SSO',
          'customer',
          'https://login.customer.example',
          'customer-client-id',
          'demo@customer.example',
        ],
        ['company-secret', 'customer-secret'],
      ),
    });

    expect(contribution.projectConfig).toMatchObject({
      server: { publicOrigin: 'http://127.0.0.1:4318' },
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
                name: 'Customer SSO',
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
  });
});
