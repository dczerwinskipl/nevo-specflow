import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
  it('writes Runtime-owned contributions under the product-owned runtime namespace', async () => {
    const root = await repository();

    const result = await initializeProject({
      cwd: root,
      initRuntime: () =>
        Promise.resolve({
          projectConfig: { marker: 'runtime-project' },
          localConfig: { marker: 'runtime-local' },
        }),
    });

    expect(result.projectConfigPath).toBe(join(root, '.nevo', 'config.yaml'));
    expect(result.localConfigPath).toBe(join(root, '.nevo', 'local', 'config.yaml'));

    const project = await readFile(result.projectConfigPath, 'utf8');
    const local = await readFile(result.localConfigPath, 'utf8');
    const gitignore = await readFile(join(root, '.gitignore'), 'utf8');

    expect(project).toContain('runtime:');
    expect(project).toContain('marker: runtime-project');
    expect(local).toContain('runtime:');
    expect(local).toContain('marker: runtime-local');
    expect(gitignore).toContain('.nevo/local/');
  });

  it('does not treat existing committed .nevo definitions as an initialized config', async () => {
    const root = await repository();

    await expect(
      initializeProject({
        cwd: root,
        initRuntime: () =>
          Promise.resolve({
            projectConfig: { marker: 'project' },
            localConfig: { marker: 'local' },
          }),
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
      }),
    ).rejects.toThrowError(/already initialized/);

    expect(runtimeInitCalls).toBe(0);
  });
});
