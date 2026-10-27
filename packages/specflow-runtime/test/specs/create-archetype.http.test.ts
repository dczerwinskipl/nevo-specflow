// Linux-only integration (real Git): Create with an archetype over HTTP and the catalogue route.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  discoverSpecifications,
  workspaceRegistryPath,
  installDefinitionsForTesting,
} from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { ARCHETYPE_REQUEST } from '../support/archetype';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

async function fixture(options: { definitions?: boolean } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-archetype-')));
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
  if (options.definitions !== false) await installDefinitionsForTesting(engine);
  return { root, engine };
}

async function server(
  role: 'developer' | 'viewer' = 'developer',
  options: { definitions?: boolean } = {},
) {
  const { root, engine } = await fixture(options);
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role, scope: {} }] },
    },
    { auth: { store }, specs: { engine } },
  );
  return { root, engine, app, headers };
}

describe('GET /api/specs/archetypes', () => {
  it('serves the catalogue with its revision as ETag and revalidates with 304', async () => {
    const { app, headers } = await server();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/specs/archetypes', headers });
      expect(response.statusCode, response.body).toBe(200);
      const catalogue = response.json<{
        revision: string;
        defaultArchetypeId?: string;
        archetypes: { id: string; version: number; documents: { id: string }[] }[];
        documentTypes: { id: string; instructions: string }[];
      }>();
      expect(response.headers.etag).toBe(`"${catalogue.revision}"`);
      expect(catalogue.defaultArchetypeId).toBeUndefined();
      expect(catalogue.archetypes.map((item) => item.id)).toEqual([
        'architecture',
        'feature',
        'minimal',
      ]);
      expect(catalogue.documentTypes.every((type) => type.instructions.length > 0)).toBe(true);

      const again = await app.inject({
        method: 'GET',
        url: '/api/specs/archetypes',
        headers: { ...headers, 'if-none-match': response.headers.etag! },
      });
      expect(again.statusCode).toBe(304);
      const other = await app.inject({
        method: 'GET',
        url: '/api/specs/archetypes',
        headers: { ...headers, 'if-none-match': '"something-else"' },
      });
      expect(other.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('needs the same capability as create-options', async () => {
    const viewer = await server('viewer');
    try {
      expect(
        (await viewer.app.inject({ method: 'GET', url: '/api/specs/archetypes' })).statusCode,
      ).toBe(401);
      expect(
        (
          await viewer.app.inject({
            method: 'GET',
            url: '/api/specs/archetypes',
            headers: viewer.headers,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await viewer.app.inject({
            method: 'GET',
            url: '/api/specs/create-options',
            headers: viewer.headers,
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await viewer.app.close();
    }
  });
});

describe('a project without definitions', () => {
  it('serves an empty catalogue and refuses Create as DEFINITIONS_MISSING', async () => {
    const context = await server('developer', { definitions: false });
    try {
      const catalogue = await context.app.inject({
        method: 'GET',
        url: '/api/specs/archetypes',
        headers: context.headers,
      });
      expect(catalogue.statusCode, catalogue.body).toBe(200);
      expect(catalogue.json<{ archetypes: unknown[] }>().archetypes).toEqual([]);

      const created = await context.app.inject({
        method: 'POST',
        url: '/api/specs',
        headers: context.headers,
        payload: { ...ARCHETYPE_REQUEST, operationId: randomUUID(), title: 'No definitions' },
      });
      expect(created.statusCode, created.body).toBe(422);
      expect(created.json()).toEqual({
        error: 'DEFINITIONS_MISSING',
        code: 'DEFINITIONS_MISSING',
        details: { cause: 'definitions-missing' },
      });
      expect(existsSync(join(context.root, 'specs'))).toBe(false);
    } finally {
      await context.app.close();
    }
  });
});

describe('definition problems on the catalogue route', () => {
  const definition = (root: string, ...path: string[]) =>
    join(root, '.nevo', 'definitions', ...path);

  it('reports a rejected file in problems, keeps the other archetypes and changes the ETag', async () => {
    const context = await server();
    try {
      const get = (extra: Record<string, string> = {}) =>
        context.app.inject({
          method: 'GET',
          url: '/api/specs/archetypes',
          headers: { ...context.headers, ...extra },
        });
      const clean = await get();
      expect(clean.json<{ problems?: unknown }>().problems).toBeUndefined();
      const cleanTag = clean.headers.etag!;

      await writeFile(
        definition(context.root, 'specification-archetype', 'feature.yaml'),
        'kind: specification-archetype\n: [broken',
      );
      const broken = await get({ 'if-none-match': cleanTag });
      expect(broken.statusCode).toBe(200);
      const body = broken.json<{
        archetypes: { id: string }[];
        problems: { source: string; code: string }[];
      }>();
      expect(body.archetypes.map((item) => item.id)).toEqual(['architecture', 'minimal']);
      expect(body.problems).toEqual([
        expect.objectContaining({
          source: 'specification-archetype/feature.yaml',
          code: 'yaml-invalid',
        }),
      ]);
      const brokenTag = broken.headers.etag!;
      expect(brokenTag).not.toBe(cleanTag);
      expect((await get({ 'if-none-match': brokenTag })).statusCode).toBe(304);

      // Only the problem changes (another broken text): the valid catalogue and its revision do not.
      await writeFile(
        definition(context.root, 'specification-archetype', 'feature.yaml'),
        'kind: specification-archetype\nid: feature\n',
      );
      const reworded = await get({ 'if-none-match': brokenTag });
      const rewordedBody = reworded.json<{ revision: string }>();
      expect(reworded.statusCode).toBe(200);
      expect(rewordedBody.revision).toBe(broken.json<{ revision: string }>().revision);
    } finally {
      await context.app.close();
    }
  });

  it('names the cause when the archetype is rejected or not defined', async () => {
    const context = await server();
    try {
      await writeFile(
        definition(context.root, 'specification-archetype', 'feature.yaml'),
        'kind: specification-archetype\n: [broken',
      );
      await rm(definition(context.root, 'specification-archetype', 'architecture.yaml'));
      const catalogue = await context.app.inject({
        method: 'GET',
        url: '/api/specs/archetypes',
        headers: context.headers,
      });
      const { revision } = catalogue.json<{ revision: string }>();
      const post = (archetypeId: string) =>
        context.app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: context.headers,
          payload: {
            ...ARCHETYPE_REQUEST,
            archetypeId,
            operationId: randomUUID(),
            title: 'Cause',
            catalogueRevision: revision,
          },
        });
      const invalid = await post('feature');
      expect(invalid.statusCode, invalid.body).toBe(422);
      expect(invalid.json()).toMatchObject({
        code: 'ARCHETYPE_UNKNOWN',
        details: { cause: 'archetype-invalid' },
      });
      const absent = await post('architecture');
      expect(absent.json()).toMatchObject({
        code: 'ARCHETYPE_UNKNOWN',
        details: { cause: 'archetype-not-defined' },
      });
    } finally {
      await context.app.close();
    }
  });
});

describe('POST /api/specs with an archetype', () => {
  const post = (context: Awaited<ReturnType<typeof server>>, payload: Record<string, unknown>) =>
    context.app.inject({
      method: 'POST',
      url: '/api/specs',
      headers: context.headers,
      payload: { ...ARCHETYPE_REQUEST, operationId: randomUUID(), ...payload },
    });

  it('creates the suggested and added documents and answers their ids', async () => {
    const context = await server();
    try {
      const response = await post(context, {
        title: 'Feature over HTTP',
        archetypeId: 'feature',
        optionalDocumentIds: ['ux', 'behaviour'],
        addedDocuments: [{ path: 'notes/n.md', type: 'note', content: 'n' }],
        folders: ['assets'],
      });
      expect(response.statusCode, response.body).toBe(201);
      const created = response.json<{ documentIds: string[]; relativeManifestPath: string }>();
      expect(created.documentIds).toHaveLength(4);
      const manifest = await readFile(join(context.root, created.relativeManifestPath), 'utf8');
      expect(manifest).toContain('id: feature');
      expect(manifest).toContain('notes/n.md');
    } finally {
      await context.app.close();
    }
  });

  it.each([
    ['a stale catalogue revision', { catalogueRevision: 'stale' }, 409, 'CATALOGUE_STALE'],
    ['a stale archetype version', { archetypeVersion: 9 }, 409, 'CATALOGUE_STALE'],
    ['an unknown archetype', { archetypeId: 'nope' }, 422, 'ARCHETYPE_UNKNOWN'],
    ['an unknown suggestion', { optionalDocumentIds: ['nope'] }, 422, 'ARCHETYPE_UNKNOWN'],
    [
      'a reserved path',
      { addedDocuments: [{ path: 'specification.yaml', content: '' }] },
      400,
      'DOCUMENT_PATH_INVALID',
    ],
    [
      'a case-insensitive duplicate path',
      {
        addedDocuments: [
          { path: 'a.md', content: '' },
          { path: 'A.md', content: '' },
        ],
      },
      409,
      'DOCUMENT_PATH_CONFLICT',
    ],
    [
      'content above the limit in bytes',
      { addedDocuments: [{ path: 'big.md', content: '€'.repeat(400_000) }] },
      400,
      'DOCUMENT_OPERATION_INVALID',
    ],
  ])(
    'answers %s with its status and code and writes nothing',
    async (_name, patch, status, code) => {
      const context = await server();
      try {
        const response = await post(context, { title: 'Refused', ...patch });
        expect(response.statusCode, response.body).toBe(status);
        expect(response.json()).toMatchObject({ error: code, code });
        expect(existsSync(join(context.root, 'specs'))).toBe(false);
        expect(await discoverSpecifications(context.engine)).toEqual([]);
      } finally {
        await context.app.close();
      }
    },
  );

  it('rejects a body without the archetype selection as a validation error', async () => {
    const context = await server();
    try {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/specs',
        headers: context.headers,
        payload: { title: 'No archetype' },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await context.app.close();
    }
  });

  it('answers 413 above the route body limit, before parsing it, and accepts a large valid body', async () => {
    const context = await server();
    try {
      const registryBefore = await readFile(workspaceRegistryPath(context.engine.context), 'utf8');
      const tooLarge = await post(context, {
        title: 'Too large',
        addedDocuments: [{ path: 'a.md', content: 'x'.repeat(2 * 1024 * 1024) }],
      });
      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
      expect(await readFile(workspaceRegistryPath(context.engine.context), 'utf8')).toBe(
        registryBefore,
      );
      expect(existsSync(join(context.root, 'specs'))).toBe(false);

      // Above Fastify's default 1 MiB but within the content caps and the route limit.
      const large = await post(context, {
        title: 'Large but valid',
        addedDocuments: [{ path: 'a.md', content: 'x'.repeat(1024 * 1024 - 1024) }],
      });
      expect(large.statusCode, large.body.slice(0, 200)).toBe(201);
    } finally {
      await context.app.close();
    }
  });

  it('replays the stored result for the same operation whatever catalogue revision the retry carries', async () => {
    const context = await server();
    try {
      const operationId = randomUUID();
      const first = await post(context, { title: 'Replayed', operationId });
      expect(first.statusCode, first.body).toBe(201);
      const retry = await post(context, {
        title: 'Replayed',
        operationId,
        catalogueRevision: 'revision-of-an-older-catalogue',
      });
      expect(retry.statusCode, retry.body).toBe(201);
      expect(retry.json()).toEqual(first.json());
      expect(await discoverSpecifications(context.engine)).toHaveLength(1);
    } finally {
      await context.app.close();
    }
  });
});
