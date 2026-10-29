// Linux-only integration (real Git project, real Runtime, real files, symlinks): the read surface
// through HTTP -- document tree, document content, raw bytes and the workspace documents section.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DocumentContentSchema,
  DocumentTreeSchema,
  type DocumentContent,
  type DocumentTree,
} from '@nevo/specflow-contracts/documents';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  serializeSpecificationManifest,
  type SpecFlowEngine,
} from '@nevo/specflow-engine/testing';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

async function project(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-documents-')));
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
  return { root, engine: await bootstrapProjectHome(root) };
}

async function server(
  engine: SpecFlowEngine,
  assignments: { role: 'developer' | 'viewer'; scope: Record<string, string> }[] = [
    { role: 'developer', scope: {} },
  ],
) {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: {
        assignments: assignments.map((item) => ({ userId: 'demo-user', ...item })),
      },
    },
    { auth: { store }, specs: { engine } },
  );
  return { app, headers };
}

/** A Specification created through Create: feature archetype with its preselected suggestions. */
async function createFeature(engine: SpecFlowEngine, root: string) {
  const created = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Read surface',
    created: '2026-10-24',
    archetype: { id: 'feature', version: 1 },
    optionalDocumentIds: ['behaviour', 'ux', 'backend'],
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  return { ...created, dir: join(root, 'specs', 'active', created.slug) };
}

/** A hand-built Specification (own registry and files), in the active or the archive location. */
async function handBuilt(
  root: string,
  options: {
    slug: string;
    location?: 'active' | 'archive';
    documents?: { id: string; path: string; type: string }[];
    files: Record<string, string | Buffer>;
  },
) {
  const location = options.location ?? 'active';
  const dir = join(root, 'specs', location, options.slug);
  const specId = randomUUID();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'specification.yaml'),
    serializeSpecificationManifest({
      specId,
      slug: options.slug,
      title: 'Hand ' + options.slug,
      archetype: {
        id: 'minimal',
        version: 1,
        requirements: [{ documentType: 'overview', minCount: 1 }],
      },
      documents: options.documents ?? [{ id: 'overview', path: 'overview.md', type: 'overview' }],
      folders: [],
      status: 'draft',
      location,
      priority: 10,
      created: '2026-10-24',
      tasks: [],
    }),
  );
  for (const [path, content] of Object.entries(options.files)) {
    await mkdir(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(dir, ...path.split('/')), content);
  }
  return { specId, dir };
}

const tree = (specId: string) => `/api/specs/${specId}/document-tree`;
const doc = (specId: string, id: string, query = '') =>
  `/api/specs/${specId}/documents/${id}${query}`;
const raw = (specId: string, id: string, query = '') => `${doc(specId, id)}/raw${query}`;
const derivedId = (path: string): string =>
  'u-' + createHash('sha256').update(path, 'utf8').digest('hex').slice(0, 32);

describe('document tree and content of a created Specification', () => {
  it('shows four registered documents, complete, and reads them (the URL no longer answers 503)', async () => {
    const { root, engine } = await project();
    const created = await createFeature(engine, root);
    const { app, headers } = await server(engine);
    try {
      const response = await app.inject({ url: tree(created.specId), headers });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.json<DocumentTree>();
      expect(response.headers.etag).toBe(`"${body.revision}"`);
      // The wire shape is exactly the contract (the serializer would silently drop extra keys).
      expect(Value.Check(DocumentTreeSchema, body)).toBe(true);
      expect(body.documents.map((item) => item.id).sort()).toEqual([
        'backend',
        'behaviour',
        'overview',
        'ux',
      ]);
      expect(body.completeness.complete).toBe(true);
      expect(body.issues).toEqual([]);
      expect(body.capabilities.createFile).toEqual({ available: true });

      const again = await app.inject({
        url: tree(created.specId),
        headers: { ...headers, 'if-none-match': response.headers.etag! },
      });
      expect(again.statusCode).toBe(304);

      const read = await app.inject({ url: doc(created.specId, 'overview'), headers });
      expect(read.statusCode, read.body).toBe(200);
      expect(read.headers['cache-control']).toBe('no-store');
      const content = read.json<DocumentContent>();
      expect(Value.Check(DocumentContentSchema, content)).toBe(true);
      expect(content).toMatchObject({
        id: 'overview',
        path: 'overview.md',
        title: 'Read surface',
        classification: 'registered',
        type: 'overview',
        kind: 'text',
        editable: true,
      });
      expect(content.content).toContain('# Read surface');
      expect(content.revision).toBe(
        body.documents.find((item) => item.id === 'overview')!.revision,
      );
    } finally {
      await app.close();
    }
  }, 240000);

  it('lists a hand-added file as unclassified and reads it; a hand-deleted file is dangling and 404', async () => {
    const { root, engine } = await project();
    const created = await createFeature(engine, root);
    await writeFile(join(created.dir, 'extra.md'), '# Extra\n');
    await unlink(join(created.dir, 'ux.md'));
    const { app, headers } = await server(engine);
    try {
      const body = (await app.inject({ url: tree(created.specId), headers })).json<DocumentTree>();
      const extra = body.documents.find((item) => item.path === 'extra.md')!;
      expect(extra).toMatchObject({ classification: 'unclassified', id: derivedId('extra.md') });
      expect(body.dangling.map((item) => item.id)).toEqual(['ux']);

      const read = await app.inject({ url: doc(created.specId, extra.id), headers });
      expect(read.statusCode).toBe(200);
      expect(read.json<DocumentContent>()).toMatchObject({
        title: 'Extra',
        classification: 'unclassified',
      });

      const missing = await app.inject({ url: doc(created.specId, 'ux'), headers });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({
        error: 'DOCUMENT_FILE_MISSING',
        code: 'DOCUMENT_FILE_MISSING',
      });
      const rawMissing = await app.inject({ url: raw(created.specId, 'ux'), headers });
      expect(rawMissing.statusCode).toBe(404);
      const unknown = await app.inject({ url: doc(created.specId, 'nope'), headers });
      expect(unknown.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' });
      const unknownSpec = await app.inject({ url: tree(randomUUID()), headers });
      expect(unknownSpec.statusCode).toBe(404);
      expect(unknownSpec.json()).toEqual({
        error: 'DOCUMENT_NOT_FOUND',
        code: 'DOCUMENT_NOT_FOUND',
      });
    } finally {
      await app.close();
    }
  }, 240000);

  it('answers ?revision with 409 DOCUMENT_REVISION_UNAVAILABLE for any revision but the current one', async () => {
    const { root, engine } = await project();
    const created = await createFeature(engine, root);
    const { app, headers } = await server(engine);
    try {
      const current = (
        await app.inject({ url: doc(created.specId, 'overview'), headers })
      ).json<DocumentContent>().revision;
      expect(
        (
          await app.inject({
            url: doc(created.specId, 'overview', `?revision=${current}`),
            headers,
          })
        ).statusCode,
      ).toBe(200);
      const stale = await app.inject({
        url: doc(created.specId, 'overview', '?revision=nope'),
        headers,
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({
        error: 'DOCUMENT_REVISION_UNAVAILABLE',
        code: 'DOCUMENT_REVISION_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
  }, 240000);
});

describe('kinds and raw headers over HTTP', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );

  it('serves png and svg as images, a zip as an attachment, html as text and markdown with NUL as binary', async () => {
    const { root, engine } = await project();
    const hand = await handBuilt(root, {
      slug: 'kinds',
      files: {
        'overview.md': '# Kinds\n',
        'pic.png': png,
        'vector.svg': svg,
        'bundle.zip': Buffer.from('PK\x03\x04zip'),
        'page.html': '<script>alert(1)</script>',
        'nul.md': Buffer.from([0x23, 0x20, 0x00, 0x61]),
        'café “q”.bin': Buffer.from([1, 2, 3]),
      },
    });
    const { app, headers } = await server(engine);
    try {
      const safe = {
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'cross-origin-resource-policy': 'same-origin',
        'cache-control': 'private, no-cache',
      };
      const cases: [string, string, string, Buffer | string][] = [
        ['pic.png', 'image/png', 'inline', png],
        ['vector.svg', 'image/svg+xml', 'inline', svg],
        [
          'bundle.zip',
          'application/octet-stream',
          "attachment; filename*=UTF-8''bundle.zip",
          'PK\x03\x04zip',
        ],
        ['page.html', 'text/plain; charset=utf-8', 'inline', '<script>alert(1)</script>'],
        [
          'nul.md',
          'application/octet-stream',
          "attachment; filename*=UTF-8''nul.md",
          Buffer.from([0x23, 0x20, 0x00, 0x61]),
        ],
        [
          'café “q”.bin',
          'application/octet-stream',
          "attachment; filename*=UTF-8''caf%C3%A9%20%E2%80%9Cq%E2%80%9D.bin",
          Buffer.from([1, 2, 3]),
        ],
      ];
      for (const [path, contentType, disposition, bytes] of cases) {
        const id = derivedId(path);
        const response = await app.inject({ url: raw(hand.specId, id), headers });
        expect(response.statusCode, path).toBe(200);
        expect(response.headers['content-type'], path).toBe(contentType);
        expect(response.headers['content-disposition'], path).toBe(disposition);
        expect(response.headers).toMatchObject(safe);
        expect(response.headers.etag, path).toMatch(/^"[0-9a-f]{64}"$/u);
        expect(response.headers['content-length']).toBe(String(Buffer.byteLength(bytes)));
        expect(response.rawPayload.equals(Buffer.from(bytes)), path).toBe(true);
      }
      const download = await app.inject({
        url: raw(hand.specId, derivedId('pic.png'), '?download=1'),
        headers,
      });
      expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''pic.png");

      const json = await app.inject({ url: doc(hand.specId, derivedId('pic.png')), headers });
      expect(json.json<DocumentContent>()).toMatchObject({ kind: 'image', mediaType: 'image/png' });
      expect(json.json()).not.toHaveProperty('content');
      const nul = await app.inject({ url: doc(hand.specId, derivedId('nul.md')), headers });
      expect(nul.json<DocumentContent>()).toMatchObject({ kind: 'binary', editable: false });

      const etag = (await app.inject({ url: raw(hand.specId, derivedId('pic.png')), headers }))
        .headers.etag!;
      const cached = await app.inject({
        url: raw(hand.specId, derivedId('pic.png')),
        headers: { ...headers, 'if-none-match': etag },
      });
      expect(cached.statusCode).toBe(304);
    } finally {
      await app.close();
    }
  }, 240000);

  it('refuses text above 1 MiB as JSON (413) but serves it raw, and refuses raw above 25 MiB (413)', async () => {
    const { root, engine } = await project();
    const hand = await handBuilt(root, {
      slug: 'sizes',
      files: { 'overview.md': '# o\n', 'long.md': Buffer.alloc(1024 * 1024 + 1, 0x61) },
    });
    const huge = await open(join(hand.dir, 'huge.bin'), 'w');
    await huge.truncate(25 * 1024 * 1024 + 1);
    await huge.close();
    const { app, headers } = await server(engine);
    try {
      const id = derivedId('long.md');
      const json = await app.inject({ url: doc(hand.specId, id), headers });
      expect(json.statusCode).toBe(413);
      expect(json.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
      const served = await app.inject({ url: raw(hand.specId, id), headers });
      expect(served.statusCode).toBe(200);
      expect(served.rawPayload.length).toBe(1024 * 1024 + 1);
      expect(served.headers.etag).toMatch(/^"stat:1048577-\d+"$/u);
      const tooBig = await app.inject({ url: raw(hand.specId, derivedId('huge.bin')), headers });
      expect(tooBig.statusCode).toBe(413);
      expect(tooBig.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
      expect(tooBig.headers['content-disposition']).toBeUndefined();
    } finally {
      await app.close();
    }
  }, 240000);
});

describe('symlinks, collisions, archive and authorization over HTTP', () => {
  it('skips a symlink, reports it and never serves what it points to', async () => {
    const { root, engine } = await project();
    const outside = await mkdtemp(join(tmpdir(), 'specflow-outside-'));
    roots.push(outside);
    await writeFile(join(outside, 'secret.md'), '# SECRET\n');
    const hand = await handBuilt(root, {
      slug: 'links',
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      files: { 'overview.md': '# o\n' },
    });
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'note.md'));
    await symlink(join(outside, 'secret.md'), join(hand.dir, 'free.md'));
    const { app, headers } = await server(engine);
    try {
      const response = await app.inject({ url: tree(hand.specId), headers });
      const body = response.json<DocumentTree>();
      expect(body.skippedEntries).toBe(2);
      expect(body.issues.filter((issue) => issue.code === 'skipped-entry')).toEqual([
        { code: 'skipped-entry', path: 'free.md' },
        { code: 'skipped-entry', path: 'note.md' },
      ]);
      expect(response.body).not.toContain('SECRET');
      for (const url of [
        doc(hand.specId, 'note'),
        raw(hand.specId, 'note'),
        doc(hand.specId, derivedId('free.md')),
        raw(hand.specId, derivedId('free.md')),
      ]) {
        const attempt = await app.inject({ url, headers });
        expect(attempt.statusCode, url).toBe(404);
        expect(attempt.body).not.toContain('SECRET');
      }
    } finally {
      await app.close();
    }
  }, 240000);

  it('lists A.md and a.md with different ids and a path-case-collision issue, both readable', async () => {
    const { root, engine } = await project();
    const hand = await handBuilt(root, { slug: 'case', files: { 'overview.md': '# o\n' } });
    await writeFile(join(hand.dir, 'A.md'), '# upper');
    await writeFile(join(hand.dir, 'a.md'), '# lower');
    if ((await readdir(hand.dir)).filter((name) => name.toLowerCase() === 'a.md').length !== 2)
      return;
    const { app, headers } = await server(engine);
    try {
      const body = (await app.inject({ url: tree(hand.specId), headers })).json<DocumentTree>();
      expect(body.issues.filter((issue) => issue.code === 'path-case-collision')).toHaveLength(2);
      const upper = await app.inject({ url: doc(hand.specId, derivedId('A.md')), headers });
      const lower = await app.inject({ url: doc(hand.specId, derivedId('a.md')), headers });
      expect(upper.json<DocumentContent>().content).toBe('# upper');
      expect(lower.json<DocumentContent>().content).toBe('# lower');
    } finally {
      await app.close();
    }
  }, 240000);

  it('reads an archived Specification with every action archived', async () => {
    const { root, engine } = await project();
    const hand = await handBuilt(root, {
      slug: 'old',
      location: 'archive',
      files: { 'overview.md': '# Old\n' },
    });
    const { app, headers } = await server(engine);
    try {
      const body = (await app.inject({ url: tree(hand.specId), headers })).json<DocumentTree>();
      const archived = { available: false, reason: 'archived' };
      expect(body.documents[0]!.editable).toBe(false);
      expect(body.documents[0]!.actions).toMatchObject({
        rename: archived,
        move: archived,
        delete: archived,
      });
      expect(body.capabilities.createFile).toEqual(archived);
      const read = await app.inject({ url: doc(hand.specId, 'overview'), headers });
      expect(read.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  }, 240000);

  it('needs View of the Specification on every route (401 anonymous, 403 elsewhere)', async () => {
    const { root, engine } = await project();
    const created = await createFeature(engine, root);
    const { app, headers } = await server(engine, [
      { role: 'viewer', scope: { specId: randomUUID() } },
    ]);
    try {
      for (const url of [
        tree(created.specId),
        doc(created.specId, 'overview'),
        raw(created.specId, 'overview'),
        `/api/specs/${created.specId}/workspace`,
      ]) {
        expect((await app.inject(url)).statusCode, url).toBe(401);
        const forbidden = await app.inject({ url, headers });
        expect(forbidden.statusCode, url).toBe(403);
        expect(forbidden.body).not.toContain('Read surface');
      }
    } finally {
      await app.close();
    }
  }, 240000);
});

describe('workspace documents section', () => {
  it('lists the registered documents (kind = document type) and leaves unclassified and dangling out', async () => {
    const { root, engine } = await project();
    const created = await createFeature(engine, root);
    await writeFile(join(created.dir, 'stray.md'), '# Stray\n');
    await unlink(join(created.dir, 'backend.md'));
    const { app, headers } = await server(engine);
    try {
      const response = await app.inject({
        url: `/api/specs/${created.specId}/workspace`,
        headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      const section = response.json<SpecificationWorkspaceResponse>().sections.documents;
      expect(section.state).toBe('available');
      if (section.state !== 'available') return;
      expect(section.data.items.map((item) => [item.id, item.kind, item.filename])).toEqual([
        ['overview', 'overview', 'overview.md'],
        ['behaviour', 'behaviour', 'behaviour.md'],
        ['ux', 'ux', 'ux.md'],
      ]);
      expect(section.data.items[0]!.title).toBe('Read surface');
    } finally {
      await app.close();
    }
  }, 240000);
});
