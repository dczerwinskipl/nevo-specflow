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
  readonly selectMessages: string[] = [];
  readonly selectChoiceLabels: string[][] = [];
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
    message: string,
    choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T> {
    this.selectDefaults.push(initialValue);
    this.selectMessages.push(message);
    this.selectChoiceLabels.push(choices.map((choice) => choice.label));

    const token = this.selections.shift();
    if (!token) throw new Error('Missing scripted selection.');

    if (token === '<default>') {
      if (initialValue === undefined) {
        throw new Error('Script requested a missing default selection.');
      }
      return Promise.resolve(initialValue);
    }

    const symbolicLabel =
      token === '<new-user>'
        ? 'New user'
        : token === '<existing-user>'
          ? 'Existing user'
          : undefined;
    const matchingChoice = symbolicLabel
      ? choices.find((choice) => choice.label === symbolicLabel)
      : choices.find((choice) => choice.value === token);
    if (!matchingChoice) {
      throw new Error(`Scripted selection '${token}' is not available.`);
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
  it('uses username as the new password user id and assigns the role immediately', async () => {
    const ui = new ScriptedUi(
      [true, true, false, false],
      ['<default>'],
      ['demo', 'Demo User'],
      ['test123', 'test123'],
    );
    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.inputMessages).toEqual(['Username', 'Display name']);
    expect(ui.selectMessages).toEqual(['Role for Demo User']);
    expect(contribution.projectConfig).toMatchObject({
      auth: {
        mode: 'required',
        users: { demo: { name: 'Demo User' } },
      },
      authorization: {
        assignments: [{ userId: 'demo', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.localConfig).toMatchObject({
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
    expect(review).toContain('demo -> Demo User (demo)');
    expect(review).toContain('Demo User (demo): admin');
    expect(review).not.toContain('test123');
    expect(review).not.toContain(PASSWORD_HASH);
  });

  it('offers New user / Existing user when another password account is added', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['<default>', '<existing-user>', 'demo'],
      ['demo', 'Demo User', 'demo-alt'],
      ['first-password', 'first-password', 'second-password', 'second-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.selectMessages).toContain('Password account belongs to');
    const ownerChoices = ui.selectChoiceLabels[1];
    expect(ownerChoices).toEqual(['New user', 'Existing user']);
    expect(contribution.localConfig).toMatchObject({
      auth: {
        providers: {
          password: {
            accounts: {
              demo: { userId: 'demo' },
              'demo-alt': { userId: 'demo' },
            },
          },
        },
      },
    });
    expect(contribution.projectConfig).toMatchObject({
      authorization: {
        assignments: [{ userId: 'demo', role: 'admin', scope: {} }],
      },
    });
  });

  it('guarantees an administrator for trusted local setup', async () => {
    const ui = new ScriptedUi([false], ['developer', '<default>'], ['demo-user', 'Demo User']);
    const contribution = await initRuntime({ ui });

    expect(contribution.projectConfig).toMatchObject({
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }],
      },
    });
    expect(ui.notes.join('\n')).toMatch(/at least one administrator is required/i);
  });

  it('keeps bootstrap role defaults in actual creation order for integer-like usernames', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['<default>', '<new-user>', '<default>'],
      ['10', 'Ten User', '2', 'Two User'],
      ['ten-password', 'ten-password', 'two-password', 'two-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.selectDefaults.filter((value) => value === 'admin' || value === 'developer')).toEqual([
      'admin',
      'developer',
    ]);
    expect(contribution.projectConfig).toMatchObject({
      authorization: {
        assignments: [
          { userId: '10', role: 'admin', scope: {} },
          { userId: '2', role: 'developer', scope: {} },
        ],
      },
    });
  });

  it('allows the former sentinel text as an ordinary password username/user id', async () => {
    const ui = new ScriptedUi(
      [true, true, true, false, false],
      ['<default>', '<existing-user>', '__new__'],
      ['__new__', 'Sentinel User', 'second'],
      ['first-password', 'first-password', 'second-password', 'second-password'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(contribution.projectConfig).toMatchObject({
      auth: { users: { __new__: { name: 'Sentinel User' } } },
      authorization: {
        assignments: [{ userId: '__new__', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.localConfig).toMatchObject({
      auth: {
        providers: {
          password: {
            accounts: {
              __new__: { userId: '__new__' },
              second: { userId: '__new__' },
            },
          },
        },
      },
    });
  });

  it('reprompts an invalid OIDC issuer before collecting client or identity data', async () => {
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
      ],
      ['company-secret'],
    );

    const contribution = await initRuntime({ ui });

    expect(ui.notes.join('\n')).toMatch(/absolute HTTPS URL/i);
    expect(ui.inputMessages.filter((message) => message === 'Issuer URL')).toHaveLength(2);
    expect(ui.inputMessages.indexOf('Issuer URL')).toBeLessThan(
      ui.inputMessages.indexOf('Client ID'),
    );
    expect(ui.inputMessages).not.toContain('Display name');
    expect(ui.inputMessages).not.toContain('Browser origin for OIDC callbacks');
    expect(contribution.projectConfig).toMatchObject({
      server: { publicOrigin: 'http://127.0.0.1:5173' },
      auth: {
        users: { 'demo@example.com': { name: 'demo@example.com' } },
        providers: {
          oidc: {
            instances: {
              company: {
                issuer: 'https://issuer.example.test',
                allowedEmails: { 'demo@example.com': 'demo@example.com' },
              },
            },
          },
        },
      },
      authorization: {
        assignments: [{ userId: 'demo@example.com', role: 'admin', scope: {} }],
      },
    });
    expect(contribution.summary).toContain(
      'Web app / OIDC return: http://127.0.0.1:5173',
    );
    expect(contribution.summary).toContain(
      'Runtime API: http://127.0.0.1:4318 (API only)',
    );
  });

  it('can link an OIDC identity to an existing user without redefining user data or role', async () => {
    const ui = new ScriptedUi(
      [true, true, false, true, false, false],
      ['<default>', '<existing-user>', 'demo'],
      [
        'demo',
        'Demo User',
        'Company SSO',
        'company',
        '<default>',
        'company-client-id',
        'demo@example.com',
      ],
      ['password', 'password', 'company-secret'],
    );

    const contribution = await initRuntime({
      ui,
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(ui.selectMessages).toContain('OIDC identity demo@example.com belongs to');
    expect(ui.inputMessages.filter((message) => message === 'Display name')).toHaveLength(1);
    expect(contribution.projectConfig).toMatchObject({
      auth: {
        users: { demo: { name: 'Demo User' } },
        providers: {
          oidc: {
            instances: {
              company: {
                allowedEmails: { 'demo@example.com': 'demo' },
              },
            },
          },
        },
      },
      authorization: {
        assignments: [{ userId: 'demo', role: 'admin', scope: {} }],
      },
    });
  });
});
