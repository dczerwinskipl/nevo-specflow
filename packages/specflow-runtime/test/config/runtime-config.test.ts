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
        providers: {
          password: { enabled: false },
          google: { enabled: false },
        },
      },
    });
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
          providers: {
            password: { enabled: false },
            google: { enabled: true },
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

  it('fails closed when the required project config is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-config-missing-'));

    await expect(loadRuntimeConfig({ cwd })).rejects.toBeInstanceOf(RuntimeConfigError);
  });
});
