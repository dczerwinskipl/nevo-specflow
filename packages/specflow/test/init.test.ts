import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRuntimeConfig } from '@nevo/specflow-runtime';

import { initializeProject } from '../src/init/initialize-project.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specflow-init-'));
  dirs.push(root);
  await mkdir(join(root, '.git'));
  await mkdir(join(root, '.nevo', 'agents', 'definitions'), { recursive: true });
  return root;
}

describe('project initialization', () => {
  it('creates committed and local password configuration without leaking the password hash', async () => {
    const root = await repository();

    const result = await initializeProject({
      cwd: root,
      input: {
        authMode: 'password',
        username: 'dominik',
        userId: 'dominik',
        displayName: 'Dominik',
        password: 'test123',
      },
      hashPassword: () => Promise.resolve(PASSWORD_HASH),
    });

    expect(result.projectConfigPath).toBe(join(root, '.nevo', 'config.yaml'));
    expect(result.localConfigPath).toBe(join(root, '.nevo', 'local', 'config.yaml'));

    const project = await readFile(result.projectConfigPath, 'utf8');
    const local = await readFile(result.localConfigPath, 'utf8');
    const gitignore = await readFile(join(root, '.gitignore'), 'utf8');

    expect(project).toContain('mode: required');
    expect(project).toContain('dominik:');
    expect(project).not.toContain(PASSWORD_HASH);
    expect(project).not.toContain('passwordHash');
    expect(local).toContain('passwordHash');
    expect(local).toContain(PASSWORD_HASH);
    expect(local).toContain('userId: dominik');
    expect(gitignore).toContain('.nevo/local/');

    const loaded = await loadRuntimeConfig({ cwd: root });
    expect(loaded.config.auth).toMatchObject({
      mode: 'required',
      users: { dominik: { name: 'Dominik' } },
      providers: {
        password: {
          enabled: true,
          accounts: {
            dominik: { userId: 'dominik' },
          },
        },
      },
    });
  });

  it('keeps no-auth attribution local while the canonical user remains committed', async () => {
    const root = await repository();

    await initializeProject({
      cwd: root,
      input: {
        authMode: 'none',
        userId: 'local-user',
        displayName: 'Local User',
      },
    });

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    const local = await readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8');

    expect(project).toContain('local-user:');
    expect(project).not.toContain('localUserId');
    expect(local).toContain('localUserId: local-user');

    const loaded = await loadRuntimeConfig({ cwd: root });
    expect(loaded.config.auth.localUserId).toBe('local-user');
  });

  it('keeps OIDC client secret local and commits identity mapping/provider metadata', async () => {
    const root = await repository();

    await initializeProject({
      cwd: root,
      input: {
        authMode: 'oidc',
        userId: 'dominik',
        displayName: 'Dominik',
        issuer: 'https://accounts.google.com',
        clientId: 'client-id',
        clientSecret: 'local-secret',
        allowedEmail: 'dominik@example.com',
      },
    });

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    const local = await readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8');

    expect(project).toContain('publicOrigin: http://localhost:4318');
    expect(project).toContain('issuer: https://accounts.google.com');
    expect(project).toContain('clientId: client-id');
    expect(project).toContain('dominik@example.com: dominik');
    expect(project).not.toContain('local-secret');
    expect(local).toContain('clientSecret: local-secret');

    const loaded = await loadRuntimeConfig({ cwd: root });
    expect(loaded.config.auth.providers.oidc).toMatchObject({
      enabled: true,
      clientId: 'client-id',
      clientSecret: 'local-secret',
      allowedEmails: { 'dominik@example.com': 'dominik' },
    });
  });

  it('does not overwrite an initialized project', async () => {
    const root = await repository();
    const input = {
      authMode: 'none' as const,
      userId: 'local-user',
      displayName: 'Local User',
    };

    await initializeProject({ cwd: root, input });

    await expect(initializeProject({ cwd: root, input })).rejects.toThrowError(
      /already initialized/,
    );
  });
});
