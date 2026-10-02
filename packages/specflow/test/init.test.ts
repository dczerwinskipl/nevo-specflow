import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  type ConfigWriteOptions,
  initializeProject,
} from '../src/init/initialize-project.js';
import type { ProjectLayout } from '../src/project/layout.js';

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

function layout(root: string): ProjectLayout {
  return {
    root,
    projectConfigPath: join(root, '.nevo', 'config.yaml'),
    localConfigPath: join(root, '.nevo', 'local', 'config.yaml'),
  };
}

const runtimeContribution = () =>
  Promise.resolve({
    projectConfig: { marker: 'runtime-project' },
    localConfig: { marker: 'runtime-local' },
  });

describe('project initialization', () => {
  it('writes Runtime-owned contributions under the product-owned runtime namespace', async () => {
    const root = await repository();

    const result = await initializeProject({
      layout: layout(root),
      initRuntime: runtimeContribution,
      isIgnored: () => Promise.resolve(true),
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

  it('does not leave staging files after successful initialization', async () => {
    const root = await repository();

    await initializeProject({
      layout: layout(root),
      initRuntime: runtimeContribution,
      isIgnored: () => Promise.resolve(true),
    });

    await expect(
      readFile(join(root, '.nevo', 'config.yaml.init.tmp'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(root, '.nevo', 'local', 'config.yaml.init.tmp'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not treat existing committed .nevo definitions as an initialized config', async () => {
    const root = await repository();

    await expect(
      initializeProject({
        layout: layout(root),
        initRuntime: runtimeContribution,
        isIgnored: () => Promise.resolve(true),
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
        layout: layout(root),
        initRuntime: () => {
          runtimeInitCalls += 1;
          return runtimeContribution();
        },
        isIgnored: () => Promise.resolve(true),
      }),
    ).rejects.toThrowError(/already initialized/);

    expect(runtimeInitCalls).toBe(0);
  });

  it('refuses to write local secrets when Git ignore cannot be proven effective', async () => {
    const root = await repository();
    await writeFile(join(root, '.gitignore'), '.nevo/local/\n!.nevo/local/config.yaml\n', 'utf8');

    await expect(
      initializeProject({
        layout: layout(root),
        initRuntime: runtimeContribution,
        isIgnored: () => Promise.resolve(false),
      }),
    ).rejects.toThrowError(/Git does not ignore \.nevo\/local\/config\.yaml/);

    await expect(readFile(join(root, '.nevo', 'config.yaml'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8')).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(
      '.nevo/local/\n!.nevo/local/config.yaml\n',
    );
  });

  it('appends a final canonical ignore rule when an existing rule is negated later', async () => {
    const root = await repository();
    await writeFile(join(root, '.gitignore'), '.nevo/local/\n!.nevo/local/config.yaml\n', 'utf8');
    const checks = [false, true];

    await initializeProject({
      layout: layout(root),
      initRuntime: runtimeContribution,
      isIgnored: () => Promise.resolve(checks.shift() ?? true),
    });

    expect((await readFile(join(root, '.gitignore'), 'utf8')).trimEnd()).toMatch(
      /\.nevo\/local\/$/u,
    );
  });

  it('rolls back local config and gitignore when the final project write fails', async () => {
    const root = await repository();
    await writeFile(join(root, '.gitignore'), 'node_modules/\n', 'utf8');

    const writeConfigFile = async (
      path: string,
      content: string,
      options: ConfigWriteOptions,
    ): Promise<void> => {
      if (!options.local) {
        throw new Error('simulated project write failure');
      }
      await writeFile(path, content, 'utf8');
    };

    await expect(
      initializeProject({
        layout: layout(root),
        initRuntime: runtimeContribution,
        isIgnored: () => Promise.resolve(true),
        writeConfigFile,
      }),
    ).rejects.toThrowError(/simulated project write failure/);

    await expect(readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8')).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    await expect(readFile(join(root, '.nevo', 'config.yaml'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules/\n');
  });
});
