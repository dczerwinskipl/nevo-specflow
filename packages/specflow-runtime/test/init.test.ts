import { describe, expect, it } from 'vitest';

import { initRuntime, type RuntimeInitPrompter, type RuntimeInitPromptChoice } from '../src/index.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

class ScriptedPrompter implements RuntimeInitPrompter {
  constructor(
    private readonly selections: string[],
    private readonly inputs: string[],
    private readonly secrets: string[] = [],
  ) {}

  select<T extends string>(
    _message: string,
    _choices: readonly RuntimeInitPromptChoice<T>[],
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

  secret(_message: string): Promise<string> {
    const value = this.secrets.shift();
    if (value === undefined) throw new Error('Missing scripted secret.');
    return Promise.resolve(value);
  }
}

describe('Runtime project initialization', () => {
  it('owns password auth defaults, hashing and project/local split', async () => {
    const contribution = await initRuntime({
      prompter: new ScriptedPrompter(
        ['password'],
        ['demo', '<default>', 'Demo User'],
        ['test123', 'test123'],
      ),
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(contribution.projectConfig).toMatchObject({
      server: {
        host: '127.0.0.1',
        port: 4318,
        tls: { enabled: false },
      },
      auth: {
        mode: 'required',
        users: {
          demo: { name: 'Demo User' },
        },
        providers: {
          password: { enabled: true },
          oidc: { enabled: false },
        },
      },
    });
    expect(contribution.projectConfig).not.toHaveProperty('auth.providers.password.accounts');
    expect(contribution.localConfig).toEqual({
      auth: {
        providers: {
          password: {
            accounts: {
              demo: {
                userId: 'demo',
                passwordHash: PASSWORD_HASH,
              },
            },
          },
        },
      },
    });
  });

  it('owns no-auth attribution semantics', async () => {
    const contribution = await initRuntime({
      prompter: new ScriptedPrompter(['none'], ['demo-user', 'Demo User']),
    });

    expect(contribution.projectConfig).toMatchObject({
      auth: {
        mode: 'none',
        users: {
          'demo-user': { name: 'Demo User' },
        },
      },
    });
    expect(contribution.localConfig).toEqual({
      auth: { localUserId: 'demo-user' },
    });
  });

  it('keeps the OIDC client secret local while Runtime owns callback defaults', async () => {
    const contribution = await initRuntime({
      prompter: new ScriptedPrompter(
        ['oidc'],
        ['<default>', 'demo-client-id', 'demo@example.com', '<default>', 'Demo User'],
        ['demo-client-secret'],
      ),
    });

    expect(contribution.projectConfig).toMatchObject({
      server: {
        publicOrigin: 'http://localhost:4318',
      },
      auth: {
        mode: 'required',
        users: {
          demo: { name: 'Demo User' },
        },
        providers: {
          oidc: {
            enabled: true,
            issuer: 'https://accounts.google.com',
            clientId: 'demo-client-id',
            allowedEmails: {
              'demo@example.com': 'demo',
            },
          },
        },
      },
    });
    expect(contribution.localConfig).toEqual({
      auth: {
        providers: {
          oidc: {
            clientSecret: 'demo-client-secret',
          },
        },
      },
    });
  });
});
