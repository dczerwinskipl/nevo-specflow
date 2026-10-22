import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationFromRequest,
} from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

describe('read endpoints never spawn Git (HTTP regression guard)', () => {
  it.each([
    ['overview current', () => '/api/specs/overview?collection=current'],
    ['overview archive', () => '/api/specs/overview?collection=archive'],
    ['workspace', (specId: string) => `/api/specs/${specId}/workspace`],
    ['create-options', () => '/api/specs/create-options'],
  ])(
    '%s spawns zero Git processes with git.enabled false',
    async (_name, url) => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-read-nogit-')));
      roots.push(root);
      git(root, 'init', '-q');
      await mkdir(join(root, '.nevo'));
      await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
      await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
      git(root, 'add', '.gitignore', '.nevo/config.yaml');
      git(
        root,
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=specflow@example.invalid',
        'commit',
        '-qm',
        'initial',
      );
      const engine = await bootstrapProjectHome(root);
      const created = await createSpecificationFromRequest(engine, {
        operationId: randomUUID(),
        title: 'Guarded HTTP read',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const config = passwordConfig();
      const app = await createRuntimeApp(
        { ...config, authentication: { ...config.authentication, mode: 'none' as const } },
        { specs: { engine } },
      );
      const spawns: unknown[] = [];
      const listener = (message: unknown): void => void spawns.push(message);
      subscribe('nevo.specflow.engine.git-process', listener);
      try {
        const response = await app.inject(url(created.specId));
        expect(response.statusCode, response.body).toBe(200);
        expect(spawns).toEqual([]);
      } finally {
        unsubscribe('nevo.specflow.engine.git-process', listener);
        await app.close();
      }
    },
    240000,
  );
});
