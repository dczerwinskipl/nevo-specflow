import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { serializeRuntimeConfig } from '@nevo/specflow-runtime';

import { initializeProject } from '../src/init/initialize-project.js';

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
  it('writes Runtime-owned project/local contributions into the product .nevo layout', async () => {
    const root = await repository();

    const result = await initializeProject({
      cwd: root,
      initRuntime: () =>
        Promise.resolve({
          projectConfig: {
            server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
            auth: {
              mode: 'none',
              users: { 'demo-user': { name: 'Demo User' } },
              providers: {
                password: { enabled: false },
                oidc: { enabled: false },
              },
            },
          },
          localConfig: {
            auth: { localUserId: 'demo-user' },
          },
        }),
      serializeConfig: serializeRuntimeConfig,
    });

    expect(result.projectConfigPath).toBe(join(root, '.nevo', 'config.yaml'));
    expect(result.localConfigPath).toBe(join(root, '.nevo', 'local', 'config.yaml'));

    const project = await readFile(result.projectConfigPath, 'utf8');
    const local = await readFile(result.localConfigPath, 'utf8');
    const gitignore = await readFile(join(root, '.gitignore'), 'utf8');

    expect(project).toContain('demo-user:');
    expect(local).toContain('localUserId: demo-user');
    expect(gitignore).toContain('.nevo/local/');
  });

  it('does not treat existing committed .nevo definitions as an initialized config', async () => {
    const root = await repository();

    await expect(
      initializeProject({
        cwd: root,
        initRuntime: () =>
          Promise.resolve({
            projectConfig: { demo: true },
            localConfig: { demo: true },
          }),
        serializeConfig: serializeRuntimeConfig,
      }),
    ).resolves.toMatchObject({
      projectConfigPath: join(root, '.nevo', 'config.yaml'),
    });
  });

  it('refuses an existing project config before invoking Runtime initialization', async () => {
    const root = await repository();
    await writeFile(join(root, '.nevo', 'config.yaml'), 'existing: true\n', 'utf8');
    let runtimeInitCalls = 0;

    await expect(
      initializeProject({
        cwd: root,
        initRuntime: () => {
          runtimeInitCalls += 1;
          return Promise.resolve({ projectConfig: {}, localConfig: {} });
        },
        serializeConfig: serializeRuntimeConfig,
      }),
    ).rejects.toThrowError(/already initialized/);

    expect(runtimeInitCalls).toBe(0);
  });
});
