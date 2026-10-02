import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadRuntimeConfig,
  mergeRuntimeConfigValues,
  parseRuntimeConfig,
  RuntimeConfigError,
} from '../../src/config/index.js';

const SUPPORTED_PASSWORD_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$' +
  'tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

const PROJECT_CONFIG = `
server:
  host: 127.0.0.1
  port: 4318
  tls:
    enabled: false

auth:
  mode: none
  providers:
    password:
      enabled: false
    google:
      enabled: false
`;

describe('runtime configuration', () => {
  it('parses the minimal project configuration', () => {
    expect(
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            google: { enabled: false },
          },
        },
      }),
    ).toEqual({
      server: {
        host: '127.0.0.1',
        port: 4318,
        tls: { enabled: false },
      },
      auth: {
        mode: 'none',
        users: {},
        providers: {
          password: { enabled: false, accounts: {} },
          google: { enabled: false, allowedEmails: {} },
        },
      },
    });
  });

  it('validates a fully configured required-auth setup', () => {
    expect(
      parseRuntimeConfig({
        server: {
          host: '0.0.0.0',
          port: 4318,
          publicOrigin: 'https://specflow.example.test:4318',
          tls: {
            enabled: true,
            certFile: '.nevo-local/tls/cert.pem',
            keyFile: '.nevo-local/tls/key.pem',
          },
        },
        auth: {
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
                  passwordHash: SUPPORTED_PASSWORD_HASH,
                },
              },
            },
            google: {
              enabled: true,
              clientId: 'example.apps.googleusercontent.com',
              clientSecret: 'fake-local-secret',
              allowedEmails: {
                'demo@example.com': 'demo-user',
              },
            },
          },
        },
      }),
    ).toMatchObject({
      auth: {
        mode: 'required',
        users: {
          'demo-user': { name: 'Demo User' },
        },
      },
    });
  });

  it('rejects an unsupported password hash when password auth is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
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
                  passwordHash: '$scrypt$32768$8$1$invalid$invalid',
                },
              },
            },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(
      'auth.providers.password.accounts.demo.passwordHash must use the supported SpecFlow password hash format.',
    );
  });

  it('rejects Google email collisions after normalization', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          publicOrigin: 'https://specflow.example.test:4318',
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          users: {
            'demo-user': { name: 'Demo User' },
          },
          providers: {
            password: { enabled: false },
            google: {
              enabled: true,
              clientId: 'example.apps.googleusercontent.com',
              clientSecret: 'fake-local-secret',
              allowedEmails: {
                'Demo@example.com': 'demo-user',
                'demo@example.com': 'demo-user',
              },
            },
          },
        },
      }),
    ).toThrowError(
      "auth.providers.google.allowedEmails contains a duplicate email after normalization: 'demo@example.com'.",
    );
  });

  it('requires an explicit public origin when Google OIDC is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '0.0.0.0',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          users: {
            'demo-user': { name: 'Demo User' },
          },
          providers: {
            password: { enabled: false },
            google: {
              enabled: true,
              clientId: 'example.apps.googleusercontent.com',
              clientSecret: 'fake-local-secret',
              allowedEmails: {
                'demo@example.com': 'demo-user',
              },
            },
          },
        },
      }),
    ).toThrowError(/publicOrigin is required/);
  });

  it('requires both TLS files when TLS is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: true, certFile: '.nevo-local/tls/cert.pem' },
        },
        auth: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(/certFile and server\.tls\.keyFile are required/);
  });

  it('requires at least one provider for required auth', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          providers: {
            password: { enabled: false },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(/requires at least one enabled authentication provider/);
  });

  it('does not allow authentication providers in none mode', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'none',
          users: {
            'demo-user': { name: 'Demo User' },
          },
          providers: {
            password: {
              enabled: true,
              accounts: {
                demo: {
                  userId: 'demo-user',
                  passwordHash: SUPPORTED_PASSWORD_HASH,
                },
              },
            },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(/auth\.mode=none cannot enable authentication providers/);
  });

  it('does not allow localUserId in required mode', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          localUserId: 'demo-user',
          users: {
            'demo-user': { name: 'Demo User' },
          },
          providers: {
            password: {
              enabled: true,
              accounts: {
                demo: {
                  userId: 'demo-user',
                  passwordHash: SUPPORTED_PASSWORD_HASH,
                },
              },
            },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(/auth\.localUserId is only valid when auth\.mode=none/);
  });

  it('rejects provider mappings to unknown users', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'none',
          providers: {
            password: {
              enabled: false,
              accounts: {
                demo: {
                  userId: 'missing-user',
                  passwordHash: 'fake',
                },
              },
            },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError(/references unknown user 'missing-user'/);
  });

  it('rejects unknown keys instead of silently ignoring configuration typos', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
          apiPort: 4319,
        },
        auth: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            google: { enabled: false },
          },
        },
      }),
    ).toThrowError("Unknown configuration key 'server.apiPort'.");
  });

  it('merges local objects recursively while replacing arrays and scalar values', () => {
    expect(
      mergeRuntimeConfigValues(
        {
          server: { host: '127.0.0.1', port: 4318 },
          values: ['project'],
        },
        {
          server: { port: 9000 },
          values: ['local'],
        },
      ),
    ).toEqual({
      server: { host: '127.0.0.1', port: 9000 },
      values: ['local'],
    });
  });

  it('replaces security-sensitive auth maps instead of merging stale entries', () => {
    expect(
      mergeRuntimeConfigValues(
        {
          auth: {
            providers: {
              password: {
                accounts: {
                  stale: { userId: 'stale-user', passwordHash: 'stale-hash' },
                },
              },
              google: {
                allowedEmails: {
                  'stale@example.com': 'stale-user',
                },
              },
            },
          },
        },
        {
          auth: {
            providers: {
              password: {
                accounts: {
                  demo: { userId: 'demo-user', passwordHash: 'local-hash' },
                },
              },
              google: {
                allowedEmails: {
                  'demo@example.com': 'demo-user',
                },
              },
            },
          },
        },
      ),
    ).toEqual({
      auth: {
        providers: {
          password: {
            accounts: {
              demo: { userId: 'demo-user', passwordHash: 'local-hash' },
            },
          },
          google: {
            allowedEmails: {
              'demo@example.com': 'demo-user',
            },
          },
        },
      },
    });
  });

  it('loads required project YAML and applies the optional local override', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-config-'));
    await writeFile(join(cwd, 'nevo-specflow.yaml'), PROJECT_CONFIG, 'utf8');
    await mkdir(join(cwd, '.nevo-local'));
    await writeFile(
      join(cwd, '.nevo-local/nevo-specflow.yaml'),
      'server:\n  port: 9443\n',
      'utf8',
    );

    const loaded = await loadRuntimeConfig({ cwd });

    expect(loaded.config.server.port).toBe(9443);
    expect(loaded.sources.project).toBe(join(cwd, 'nevo-specflow.yaml'));
    expect(loaded.sources.local).toBe(join(cwd, '.nevo-local/nevo-specflow.yaml'));
  });

  it('rejects Google client secrets from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-project-secret-'));
    await writeFile(
      join(cwd, 'nevo-specflow.yaml'),
      PROJECT_CONFIG.replace(
        'google:\n      enabled: false',
        'google:\n      enabled: false\n      clientSecret: committed-secret',
      ),
      'utf8',
    );

    await expect(loadRuntimeConfig({ cwd })).rejects.toThrowError(
      /auth\.providers\.google\.clientSecret must be configured only in the local SpecFlow config/,
    );
  });

  it('rejects password hashes from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-password-secret-'));
    await writeFile(
      join(cwd, 'nevo-specflow.yaml'),
      PROJECT_CONFIG.replace(
        'password:\n      enabled: false',
        `password:
      enabled: false
      accounts:
        demo:
          userId: demo-user
          passwordHash: ${SUPPORTED_PASSWORD_HASH}`,
      ),
      'utf8',
    );

    await expect(loadRuntimeConfig({ cwd })).rejects.toThrowError(
      /auth\.providers\.password\.accounts\.demo\.passwordHash must be configured only in the local SpecFlow config/,
    );
  });

  it('fails closed when the required project config is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-config-missing-'));

    await expect(loadRuntimeConfig({ cwd })).rejects.toBeInstanceOf(RuntimeConfigError);
  });
});
