import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadRuntimeConfig,
  mergeRuntimeConfigValues,
  parseRuntimeConfig,
  RuntimeConfigError,
} from '../../src/config/index';

const SUPPORTED_PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$' + 'yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

const PROJECT_CONFIG = `
runtime:
  server:
    host: 127.0.0.1
    port: 4318
    tls:
      enabled: false

  authentication:
    mode: none
    users:
      demo-user:
        name: Demo User
    providers:
      password:
        enabled: false
      oidc:
        instances: {}
`;

function loadFrom(cwd: string) {
  return loadRuntimeConfig({
    projectConfigPath: join(cwd, '.nevo/config.yaml'),
    localConfigPath: join(cwd, '.nevo/local/config.yaml'),
  });
}

it('loads project-owned Current Overview sections in declared order', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'specflow-overview-config-'));
  await mkdir(join(cwd, '.nevo/local'), { recursive: true });
  await writeFile(
    join(cwd, '.nevo/config.yaml'),
    `${PROJECT_CONFIG}\nspecs:\n  overview:\n    current:\n      sections:\n        - draft\n        - active\n`,
    'utf8',
  );
  expect((await loadFrom(cwd)).config.specs?.overview.current.sections).toEqual([
    'draft',
    'active',
  ]);
  await writeFile(
    join(cwd, '.nevo/local/config.yaml'),
    'specs:\n  overview:\n    current:\n      sections: []\n',
    'utf8',
  );
  await expect(loadFrom(cwd)).rejects.toThrow('project-owned');
});

const LOCAL_PROJECT_POLICY_OVERRIDES = [
  `runtime:
  authentication:
    mode: required
`,
  `runtime:
  authentication:
    users:
      injected:
        name: Injected
`,
  `runtime:
  authentication:
    providers:
      password:
        enabled: true
`,
  `runtime:
  authentication:
    providers:
      oidc:
        issuer: https://issuer.example.test
`,
  `runtime:
  server:
    port: 9999
`,
  `runtime:
  server:
    tls:
      enabled: true
`,
] as const;

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
    authentication: {
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
          instances: {
            company: {
              name: 'Company SSO',
              enabled: true,
              issuer: 'https://issuer.example.test',
              clientId: 'client-id',
              clientSecret: 'fake-local-secret',
              allowedEmails,
            },
          },
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
        authentication: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { instances: {} },
          },
        },
      }),
    ).toEqual({
      server: {
        host: '127.0.0.1',
        port: 4318,
        tls: { enabled: false },
      },
      authentication: {
        mode: 'none',
        users: {},
        providers: {
          password: { enabled: false, accounts: {} },
          oidc: { instances: {} },
        },
      },
    });
  });

  it('validates a fully configured required-auth setup', () => {
    expect(parseRuntimeConfig(requiredAuthConfig())).toMatchObject({
      authentication: {
        mode: 'required',
        users: {
          'demo-user': { name: 'Demo User' },
        },
      },
    });
  });

  it('rejects an unsupported password hash when password auth is enabled', () => {
    const config = requiredAuthConfig();
    config.authentication.providers.password.accounts.demo.passwordHash =
      '$scrypt$32768$8$1$invalid$invalid';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      'authentication.providers.password.accounts.demo.passwordHash must use a supported SpecFlow password hash format.',
    );
  });

  it('rejects OIDC email collisions after normalization', () => {
    const config = requiredAuthConfig();
    config.authentication.providers.oidc.instances.company.allowedEmails = {
      'Demo@example.com': 'demo-user',
      ' demo@example.com ': 'demo-user',
    };

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /duplicate email after normalization.*demo@example\.com/i,
    );
  });

  it('requires issuer, client id, and client secret when OIDC is enabled', () => {
    const config = requiredAuthConfig();
    const company = config.authentication.providers.oidc.instances.company;
    const { issuer, ...provider } = company;
    expect(issuer).toBe('https://issuer.example.test');

    expect(() =>
      parseRuntimeConfig({
        ...config,
        authentication: {
          ...config.authentication,
          providers: {
            ...config.authentication.providers,
            oidc: { instances: { company: provider } },
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
        authentication: {
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
            oidc: { instances: {} },
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
        authentication: {
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
            oidc: { instances: {} },
          },
        },
      }),
    ).toMatchObject({
      server: { host: '127.0.0.1' },
      authentication: { mode: 'required' },
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
      authentication: { mode: 'required' },
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
        authentication: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { instances: {} },
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
        authentication: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { instances: {} },
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
        authentication: {
          mode: 'required',
          providers: {
            password: { enabled: false },
            oidc: { instances: {} },
          },
        },
      }),
    ).toThrowError(/requires password login or at least one enabled OIDC provider/);
  });

  it('does not allow authentication providers in none mode', () => {
    const config = requiredAuthConfig();
    config.authentication.mode = 'none';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /authentication\.mode=none cannot enable authentication providers/,
    );
  });

  it('does not allow localUserId in required mode', () => {
    const config = requiredAuthConfig();

    expect(() =>
      parseRuntimeConfig({
        ...config,
        authentication: {
          ...config.authentication,
          localUserId: 'demo-user',
        },
      }),
    ).toThrowError(/authentication\.localUserId is only valid when authentication\.mode=none/);
  });

  it('rejects provider mappings to unknown users', () => {
    expect(() =>
      parseRuntimeConfig({
        server: {
          host: '127.0.0.1',
          port: 4318,
          tls: { enabled: false },
        },
        authentication: {
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
            oidc: { instances: {} },
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
        authentication: {
          mode: 'none',
          providers: {
            password: { enabled: false },
            oidc: { instances: {} },
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

  it('replaces local password accounts instead of merging stale entries', () => {
    expect(
      mergeRuntimeConfigValues(
        {
          authentication: {
            providers: {
              password: {
                accounts: {
                  stale: { userId: 'stale-user', passwordHash: 'stale-hash' },
                },
              },
            },
          },
        },
        {
          authentication: {
            providers: {
              password: {
                accounts: {
                  demo: { userId: 'demo-user', passwordHash: 'local-hash' },
                },
              },
            },
          },
        },
      ),
    ).toEqual({
      authentication: {
        providers: {
          password: {
            accounts: {
              demo: { userId: 'demo-user', passwordHash: 'local-hash' },
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
    await writeFile(
      join(cwd, '.nevo/local/config.yaml'),
      'runtime:\n  authentication:\n    localUserId: demo-user\n',
      'utf8',
    );

    const loaded = await loadFrom(cwd);

    expect(loaded.config.authentication.localUserId).toBe('demo-user');
    expect(loaded.sources.project).toBe(join(cwd, '.nevo/config.yaml'));
    expect(loaded.sources.local).toBe(join(cwd, '.nevo/local/config.yaml'));
  });

  it('ignores unrelated product-owned top-level sections while loading Runtime config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-other-capability-'));
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
      `${PROJECT_CONFIG}\nworkflow:\n  default: standard\n`,
      'utf8',
    );

    const loaded = await loadFrom(cwd);

    expect(loaded.config.server.port).toBe(4318);
  });

  it('rejects OIDC client secrets from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-project-secret-'));
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
      PROJECT_CONFIG.replace(
        'oidc:\n        instances: {}',
        'oidc:\n        instances:\n          company:\n            clientSecret: committed-secret',
      ),
      'utf8',
    );

    await expect(loadFrom(cwd)).rejects.toThrowError(
      /Unknown configuration key 'authentication\.providers\.oidc\.instances\.company\.clientSecret'/,
    );
  });

  it('rejects password hashes from the project config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-password-secret-'));
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
      PROJECT_CONFIG.replace(
        'password:\n        enabled: false',
        `password:
        enabled: false
        accounts:
          demo:
            userId: demo-user
            passwordHash: ${SUPPORTED_PASSWORD_HASH}`,
      ),
      'utf8',
    );

    await expect(loadFrom(cwd)).rejects.toThrowError(
      /Unknown configuration key 'authentication\.providers\.password\.accounts'/,
    );
  });

  it('rejects local overrides of project-owned settings', async () => {
    for (const localConfig of LOCAL_PROJECT_POLICY_OVERRIDES) {
      const cwd = await mkdtemp(join(tmpdir(), 'specflow-local-ownership-'));
      await mkdir(join(cwd, '.nevo/local'), { recursive: true });
      await writeFile(join(cwd, '.nevo/config.yaml'), PROJECT_CONFIG, 'utf8');
      await writeFile(join(cwd, '.nevo/local/config.yaml'), localConfig, 'utf8');

      await expect(loadFrom(cwd)).rejects.toBeInstanceOf(RuntimeConfigError);
    }
  });

  it('accepts local password credentials for a committed canonical user', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-local-password-'));
    await mkdir(join(cwd, '.nevo/local'), { recursive: true });
    const project = PROJECT_CONFIG.replace('mode: none', 'mode: required').replace(
      'password:\n        enabled: false',
      'password:\n        enabled: true',
    );
    await writeFile(join(cwd, '.nevo/config.yaml'), project, 'utf8');
    await writeFile(
      join(cwd, '.nevo/local/config.yaml'),
      `runtime:
  authentication:
    providers:
      password:
        accounts:
          demo:
            userId: demo-user
            passwordHash: ${SUPPORTED_PASSWORD_HASH}
`,
      'utf8',
    );

    const loaded = await loadFrom(cwd);

    expect(loaded.config.authentication.providers.password.accounts.demo?.userId).toBe('demo-user');
  });

  it('fails closed when the required project config is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-config-missing-'));

    await expect(loadFrom(cwd)).rejects.toBeInstanceOf(RuntimeConfigError);
  });

  it('rejects credentials embedded in server.publicOrigin', () => {
    const config = requiredAuthConfig();
    config.server.publicOrigin = 'https://user:password@specflow.example.test:4318';

    expect(() => parseRuntimeConfig(config)).toThrowError(
      /without credentials, path, query, or fragment/,
    );
  });

  it('does not include local secret source text in YAML parse errors', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-local-yaml-secret-'));
    await mkdir(join(cwd, '.nevo/local'), { recursive: true });
    await writeFile(join(cwd, '.nevo/config.yaml'), PROJECT_CONFIG, 'utf8');
    await writeFile(
      join(cwd, '.nevo/local/config.yaml'),
      [
        'runtime:',
        '  authentication:',
        '    providers:',
        '      oidc:',
        '        clientSecret: [super-secret-value',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      await loadFrom(cwd);
      throw new Error('Expected malformed local YAML to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigError);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/Invalid YAML/);
      expect(message).not.toContain('super-secret-value');
      expect(message).not.toContain('clientSecret');
    }
  });
});
