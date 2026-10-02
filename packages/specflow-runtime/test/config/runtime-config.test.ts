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
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$' + 'yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

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
    oidc:
      enabled: false
`;

function requiredAuthConfig() {
  const allowedEmails: Record<string, string> = {
    'demo@example.com': 'demo-user',
  };

  return {
    server: {
      host: '127.0.0.1',
      port: 4318,
      publicOrigin: 'https://specflow.example.test:4318',
      tls: {
        enabled: true,
        certFile: '.nevo/local/tls/cert.pem',
        keyFile: '.nevo/local/tls/key.pem',
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
        oidc: {
          enabled: true,
          issuer: 'https://issuer.example.test',
          clientId: 'client-id',
          clientSecret: 'fake-local-secret',
          allowedEmails,
        },
      },
    },
  };
}

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
            oidc: { enabled: false },
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
          oidc: { enabled: false, allowedEmails: {} },
        },
      },
    });
  });

  it('validates a fully configured required-auth setup', () => {
    expect(parseRuntimeConfig(requiredAuthConfig())).toMatchObject({
      auth: {
        mode: 'required',
        users: {
          'demo-user': { name: 'Demo User' },
        },
      },
    });
  });

  it('rejects an unsupported password hash when password auth is enabled', () => {
    const config = requiredAuthConfig();
    config.auth.providers.password.accounts.demo.passwordHash = '$scrypt$32768$8$1$invalid$invalid';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      'auth.providers.password.accounts.demo.passwordHash must use a supported SpecFlow password hash format.',
    );
  });

  it('rejects OIDC email collisions after normalization', () => {
    const config = requiredAuthConfig();
    config.auth.providers.oidc.allowedEmails = {
      'Demo@example.com': 'demo-user',
      ' demo@example.com ': 'demo-user',
    };

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /duplicate email after normalization.*demo@example\.com/i,
    );
  });

  it('requires issuer, client id, and client secret when OIDC is enabled', () => {
    const config = requiredAuthConfig();
    const { issuer, ...oidc } = config.auth.providers.oidc;
    expect(issuer).toBe('https://issuer.example.test');

    expect(() =>
      parseRuntimeConfig({
        ...config,
        auth: {
          ...config.auth,
          providers: {
            ...config.auth.providers,
            oidc,
          },
        },
      }),
    ).toThrowError(/issuer, clientId, and clientSecret are required/);
  });

  it('requires an explicit public origin when OIDC is enabled', () => {
    const config = requiredAuthConfig();
    const { publicOrigin: _, ...server } = config.server;

    expect(() => parseRuntimeConfig({ ...config, server })).toThrowError(
      /publicOrigin is required/,
    );
  });

  it('rejects required auth on a non-loopback bind when Runtime TLS is disabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '0.0.0.0',
          port: 4318,
          publicOrigin: 'http://specflow.example.test:4318',
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          users: { 'demo-user': { name: 'Demo User' } },
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
            oidc: { enabled: false },
          },
        },
      }),
    ).toThrowError(/without Runtime TLS is allowed only when server\.host is loopback/);
  });

  it('allows required password auth without publicOrigin only on loopback', () => {
    expect(
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        auth: {
          mode: 'required',
          users: { 'demo-user': { name: 'Demo User' } },
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
            oidc: { enabled: false },
          },
        },
      }),
    ).toMatchObject({
      server: { host: '127.0.0.1' },
      auth: { mode: 'required' },
    });
  });

  it('rejects reverse-proxy HTTPS publicOrigin when Runtime TLS is disabled', () => {
    const config = requiredAuthConfig();
    config.server.tls.enabled = false;

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /publicOrigin must use HTTP when server\.tls\.enabled=false/,
    );
  });

  it('allows plaintext required auth only when bind and public origin are loopback', () => {
    const config = requiredAuthConfig();
    config.server.tls.enabled = false;
    config.server.publicOrigin = 'http://localhost:4318';

    expect(parseRuntimeConfig(config)).toMatchObject({
      server: {
        host: '127.0.0.1',
        publicOrigin: 'http://localhost:4318',
        tls: { enabled: false },
      },
      auth: { mode: 'required' },
    });
  });

  it('rejects a non-loopback public origin when required auth uses loopback plaintext', () => {
    const config = requiredAuthConfig();
    config.server.tls.enabled = false;
    config.server.publicOrigin = 'http://specflow.example.test:4318';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /without Runtime TLS requires server\.publicOrigin to be loopback/,
    );
  });

  it('rejects an HTTP publicOrigin when Runtime TLS is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          publicOrigin: 'http://localhost:4318',
          tls: {
            enabled: true,
            certFile: '.nevo/local/tls/cert.pem',
            keyFile: '.nevo/local/tls/key.pem',
          },
        },
        auth: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { enabled: false },
          },
        },
      }),
    ).toThrowError(/publicOrigin must use HTTPS when server\.tls\.enabled=true/);
  });

  it('requires both TLS files when TLS is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: true, certFile: '.nevo/local/tls/cert.pem' },
        },
        auth: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { enabled: false },
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
            oidc: { enabled: false },
          },
        },
      }),
    ).toThrowError(/requires at least one enabled authentication provider/);
  });

  it('does not allow authentication providers in none mode', () => {
    const config = requiredAuthConfig();
    config.auth.mode = 'none';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /auth\.mode=none cannot enable authentication providers/,
    );
  });

  it('does not allow localUserId in required mode', () => {
    const config = requiredAuthConfig();

    expect(() =>
      parseRuntimeConfig({
        ...config,
        auth: {
          ...config.auth,
          localUserId: 'demo-user',
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
                  passwordHash: 'unused-while-disabled',
                },
              },
            },
            oidc: { enabled: false },
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
            oidc: { enabled: false },
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
              oidc: {
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
              oidc: {
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
          oidc: {
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
    await mkdir(join(cwd, '.nevo/local'), { recursive: true });
    await writeFile(join(cwd, '.nevo/config.yaml'), PROJECT_CONFIG, 'utf8');
    await writeFile(join(cwd, '.nevo/local/config.yaml'), 'server:\n  port: 9443\n', 'utf8');

    const loaded = await loadRuntimeConfig({ cwd });

    expect(loaded.config.server.port).toBe(9443);
    expect(loaded.sources.project).toBe(join(cwd, '.nevo/config.yaml'));
    expect(loaded.sources.local).toBe(join(cwd, '.nevo/local/config.yaml'));
  });

  it('rejects OIDC client secrets from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-project-secret-'));
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
      PROJECT_CONFIG.replace(
        'oidc:\n      enabled: false',
        'oidc:\n      enabled: false\n      clientSecret: committed-secret',
      ),
      'utf8',
    );

    await expect(loadRuntimeConfig({ cwd })).rejects.toThrowError(
      /auth\.providers\.oidc\.clientSecret must be configured only in the local SpecFlow config/,
    );
  });

  it('rejects password hashes from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-password-secret-'));
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
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
