import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAuthorizationConfig } from '../../src/authorization/config.js';
import { loadRuntimeConfig } from '../../src/config/index.js';

const MINIMAL_PROJECT = `
server:
  host: 127.0.0.1
  port: 4318
  tls:
    enabled: false
auth:
  mode: none
  users:
    demo-user:
      name: Demo User
  providers:
    password:
      enabled: false
    oidc:
      enabled: false
authorization:
  assignments:
    - userId: demo-user
      role: developer
      scope:
        projectId: P1
`;

describe('SpecFlow authorization configuration', () => {
  it('accepts canonical assignment scope parent chains', () => {
    const knownUsers = new Set(['u1']);
    for (const scope of [
      {},
      { projectId: 'P1' },
      { projectId: 'P1', specId: 'S1' },
      { projectId: 'P1', specId: 'S1', sessionId: 'SE1' },
    ]) {
      expect(
        parseAuthorizationConfig(
          { assignments: [{ userId: 'u1', role: 'developer', scope }] },
          knownUsers,
        ).assignments,
      ).toHaveLength(1);
    }
  });

  it('rejects assignment scope holes', () => {
    const knownUsers = new Set(['u1']);
    expect(() =>
      parseAuthorizationConfig(
        {
          assignments: [{ userId: 'u1', role: 'developer', scope: { specId: 'S1' } }],
        },
        knownUsers,
      ),
    ).toThrowError(/canonical parent chain/);

    expect(() =>
      parseAuthorizationConfig(
        {
          assignments: [
            {
              userId: 'u1',
              role: 'developer',
              scope: { projectId: 'P1', sessionId: 'SE1' },
            },
          ],
        },
        knownUsers,
      ),
    ).toThrowError(/canonical parent chain/);
  });

  it('rejects unknown roles and project users', () => {
    expect(() =>
      parseAuthorizationConfig(
        { assignments: [{ userId: 'u1', role: 'owner', scope: {} }] },
        new Set(['u1']),
      ),
    ).toThrowError(/unknown role 'owner'/);

    expect(() =>
      parseAuthorizationConfig(
        { assignments: [{ userId: 'local-only', role: 'admin', scope: {} }] },
        new Set(['project-user']),
      ),
    ).toThrowError(/unknown project auth user 'local-only'/);
  });

  it('rejects authorization from local config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-authz-local-'));
    await writeFile(join(cwd, 'nevo-specflow.yaml'), MINIMAL_PROJECT, 'utf8');
    await mkdir(join(cwd, '.nevo-local'));
    await writeFile(
      join(cwd, '.nevo-local/nevo-specflow.yaml'),
      'authorization:\n  assignments: []\n',
      'utf8',
    );
    await expect(loadRuntimeConfig({ cwd })).rejects.toThrowError(/authorization is project-only/);
  });

  it('does not allow project assignments to depend on local-only users', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-authz-user-'));
    await writeFile(
      join(cwd, 'nevo-specflow.yaml'),
      MINIMAL_PROJECT.replace(
        'demo-user:\n      name: Demo User',
        'project-user:\n      name: Project User',
      ),
      'utf8',
    );
    await mkdir(join(cwd, '.nevo-local'));
    await writeFile(
      join(cwd, '.nevo-local/nevo-specflow.yaml'),
      'auth:\n  users:\n    demo-user:\n      name: Local User\n',
      'utf8',
    );
    await expect(loadRuntimeConfig({ cwd })).rejects.toThrowError(
      /unknown project auth user 'demo-user'/,
    );
  });
});
