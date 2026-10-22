import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationFromRequest,
  readCanonicalSpecDocument,
} from '@nevo/specflow-engine/testing';
import { CreateOptionsSchema } from '@nevo/specflow-contracts/specs';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { noAuthConfig, passwordConfig } from '../auth/support/config';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

describe('an invalid Git policy section degrades reads and keeps mutations fail-closed', () => {
  it('serves create-options without Git, keeps other reads working and refuses Create', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-policy-invalid-')));
    roots.push(root);
    git(root, 'init', '-q');
    await mkdir(join(root, '.nevo'));
    await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
    await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
    git(root, 'add', '.gitignore', '.nevo/config.yaml');
    git(
      root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'initial',
    );
    const engine = await bootstrapProjectHome(root);
    const created = await createSpecificationFromRequest(engine, {
      operationId: randomUUID(),
      title: 'Before the typo',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });

    // A typo in the Git section (here an unknown key).
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: false\n  secretTypoKey: true\n',
    );

    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' as const } },
      { specs: { engine } },
    );
    try {
      const options = await app.inject('/api/specs/create-options');
      expect(options.statusCode, options.body).toBe(200);
      const body = JSON.parse(options.body) as {
        newWorktree: unknown;
        workspaces: { reason?: string; selectable: boolean }[];
        baseRefs: unknown[];
        commits?: unknown;
      };
      expect(Value.Check(CreateOptionsSchema, body)).toBe(true);
      expect(body.newWorktree).toEqual({ status: 'unavailable', reason: 'git-policy-invalid' });
      expect(body.workspaces).toHaveLength(1);
      expect(body.workspaces[0]).toMatchObject({ selectable: false, reason: 'git-policy-invalid' });
      expect(body.baseRefs).toEqual([]);
      expect(body.commits).toBeUndefined();
      // The cause is for the operator log, never for the response.
      expect(options.body).not.toContain('secretTypoKey');
      expect(options.body).not.toContain('Unsupported');
      expect(options.body).not.toContain('GIT_POLICY_INVALID');

      // Reads that never needed the policy keep working.
      for (const url of [
        '/api/specs/overview?collection=current',
        '/api/specs/overview?collection=archive',
        `/api/specs/${created.specId}/workspace`,
      ]) {
        const read = await app.inject(url);
        expect(read.statusCode, `${url}: ${read.body}`).toBe(200);
      }
      const document = await readCanonicalSpecDocument(engine, created.specId, 'overview');
      expect(document).toBeDefined();

      // The mutation reads the policy for every target: fail closed, nothing created.
      const create = await app.inject({
        method: 'POST',
        url: '/api/specs',
        payload: {
          title: 'Must not be created',
          target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
        },
      });
      expect(create.statusCode).toBe(503);
      expect(JSON.parse(create.body)).toEqual({
        error: 'GIT_POLICY_INVALID',
        code: 'GIT_POLICY_INVALID',
      });
      expect(create.body).not.toContain('secretTypoKey');
    } finally {
      await app.close();
    }
  }, 240000);

  it('mirrors it in the demo Runtime: options without Git and a closed Create', async () => {
    const app = await createRuntimeApp(
      {
        ...noAuthConfig(),
        authentication: { ...noAuthConfig().authentication, localUserId: undefined },
      },
      { dataMode: 'demo', demoScenarios: true },
    );
    try {
      const scenario = 'demoScenario=git-policy-invalid';
      const options = await app.inject(`/api/demo/specs/create-options?${scenario}`);
      expect(options.statusCode, options.body).toBe(200);
      const body = JSON.parse(options.body) as {
        newWorktree: unknown;
        workspaces: { reason?: string; selectable: boolean }[];
      };
      expect(body.newWorktree).toEqual({ status: 'unavailable', reason: 'git-policy-invalid' });
      expect(body.workspaces.every((w) => !w.selectable && w.reason === 'git-policy-invalid')).toBe(
        true,
      );

      const catalogue = JSON.parse((await app.inject('/api/demo/specification-creation')).body) as {
        revision: string;
      };
      const create = await app.inject({
        method: 'POST',
        url: `/api/demo/specifications?${scenario}`,
        payload: {
          operationId: randomUUID(),
          title: 'Closed',
          catalogueRevision: catalogue.revision,
          archetypeId: 'feature',
          archetypeVersion: '2',
          optionalDocumentIds: [],
        },
      });
      expect(create.statusCode, create.body).toBe(503);
      expect(JSON.parse(create.body)).toMatchObject({ code: 'GIT_POLICY_INVALID' });
    } finally {
      await app.close();
    }
  });
});
