import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROBE_TEXT } from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import {
  DocsDocumentInactiveErrorSchema,
  DocsDocumentNotFoundErrorSchema,
  DocsDocumentSkippedErrorSchema,
  WorkspaceDocsArticleSchema,
  WorkspaceDocsErrorSchema,
  WorkspaceDocsSearchSchema,
  WorkspaceDocsTreeSchema,
  type WorkspaceDocsArticle,
  type WorkspaceDocsSearch,
  type WorkspaceDocsTree,
} from '@nevo/specflow-contracts/docs';
import { DEFAULT_DOCS_SETTINGS, type CreateEmbeddingProvider } from '@nevo/specflow-docs';
import {
  addWorkspace,
  bootstrapProjectHome,
  provisionLinkedWorkspaceIdentity,
  updateWorkspaceRegistry,
} from '@nevo/specflow-engine/testing';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '../../src/config/types';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

/*
 * One Runtime over a real Engine with two registered checkouts (Project Home and a linked
 * worktree) whose documentation conflicts, a fake embedding provider and no network. The cases
 * share the fixture and run in order: the last ones change the primary checkout.
 */

// Real Git and an Engine bootstrap: slow on Windows.
const setupTimeoutMs = process.platform === 'win32' ? 120000 : 45000;

const TRUSTED_URL = 'http://127.0.0.1:1/v1';
const TRUSTED_MODEL = 'm';
const WORKTREE_ENDPOINT = 'http://recorder.invalid/v1|elsewhere';

const roots: string[] = [];
const endpoints = new Set<string>();
let hold: Promise<void> | undefined;

/** The fake endpoint; records the URL of every provider and can hold the background refresh. */
const createProvider: CreateEmbeddingProvider = (settings, { signal }) => {
  endpoints.add(`${settings.baseUrl}|${settings.model}`);
  const provider = createFakeEmbeddingProvider();
  if (signal === undefined) {
    return provider;
  }

  // Only the refresh's providers carry a signal.
  return {
    ...provider,
    embed: async (texts, purpose) => {
      if (hold !== undefined && texts[0] !== PROBE_TEXT) {
        await hold;
      }

      return provider.embed(texts, purpose);
    },
  };
};

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  roots.push(dir);

  return dir;
}

function doc(frontmatter: Record<string, string>, body: string): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);

  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

const hub = (id: string, body: string, extra: Record<string, string> = {}) =>
  doc({ id, type: 'hub', title: `${id} title`, status: 'current', ...extra }, body);

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, 'docs', ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, 'docs', path), content);
  }
}

const SEMANTIC = 'docs:\n  search:\n    semantic: true\n';

interface Fixture {
  engine: SpecFlowEngine;
  primaryRoot: string;
  primaryId: string;
  linkedRoot: string;
  linkedId: string;
  goneRoot: string;
  goneId: string;
  bareId: string;
  bareRoot: string;
}

async function registerLinked(
  engine: SpecFlowEngine,
  root: string,
  branch: string,
): Promise<{ root: string; id: string }> {
  const linked = await tempDir('specflow-docs-linked-');
  git(root, 'worktree', 'add', '-q', '-b', branch, linked, 'HEAD');
  const registration = await provisionLinkedWorkspaceIdentity(
    engine.context,
    linked,
    randomUUID(),
    true,
  );
  await updateWorkspaceRegistry(engine.context, (registry) => addWorkspace(registry, registration));

  return { root: linked, id: registration.workspaceId };
}

async function createFixture(): Promise<Fixture> {
  const primaryRoot = await tempDir('specflow-docs-primary-');
  git(primaryRoot, 'init', '-q');
  await mkdir(join(primaryRoot, '.nevo'));
  await writeFile(join(primaryRoot, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(primaryRoot, '.nevo/config.yaml'),
    `runtime: {}\ngit:\n  enabled: false\n${SEMANTIC}`,
  );
  git(primaryRoot, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    primaryRoot,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  const engine = await bootstrapProjectHome(primaryRoot);
  const linked = await registerLinked(engine, primaryRoot, 'test/docs-linked');
  const gone = await registerLinked(engine, primaryRoot, 'test/docs-gone');
  await rm(gone.root, { recursive: true, force: true, maxRetries: 5 });
  // No docs folder at all.
  const bare = await registerLinked(engine, primaryRoot, 'test/docs-bare');

  await write(primaryRoot, {
    'README.md': hub('home', '# Home\n\nStart with the [guide](guide.md).'),
    'guide.md': hub('guide', '# Guide\n\n## Install\n\nInstall the widget with npm.'),
    'temp.md': hub('temp', '# Temp\n\nA short-lived page.'),
    'ideas/draft.md': hub('idea', '# Idea\n\nInstall ideas for the widget, not yet decided.'),
    'old.md': hub('old', '# Old\n\nRetired.', { status: 'superseded', superseded_by: 'guide' }),
    'bad.md': hub('bad', '# Bad', { type: 'nonsense' }),
    'twin-a.md': hub('twin', '# Twin A'),
    'twin-b.md': hub('twin', '# Twin B'),
    'docs.yaml': 'proposals: [ideas/]\n',
  });
  // The same document ids with other text, and an endpoint of its own that must never be used.
  await writeFile(
    join(linked.root, '.nevo/config.yaml'),
    `runtime: {}\ngit:\n  enabled: false\n${SEMANTIC}ai:\n  embeddings:\n    baseUrl: http://recorder.invalid/v1\n    model: elsewhere\n`,
  );
  await mkdir(join(linked.root, '.nevo/local'), { recursive: true });
  await writeFile(
    join(linked.root, '.nevo/local/config.yaml'),
    'ai:\n  embeddings:\n    baseUrl: http://recorder.invalid/v1\n    model: elsewhere\n',
  );
  await write(linked.root, {
    'README.md': hub('home', '# Home\n\nStart with the [guide](guide.md).'),
    'guide.md': hub('guide', '# Guide\n\n## Install\n\nInstall the gadget with pnpm.'),
  });

  return {
    engine,
    primaryRoot,
    primaryId: engine.workspace.workspaceId,
    linkedRoot: linked.root,
    linkedId: linked.id,
    goneRoot: gone.root,
    goneId: gone.id,
    bareId: bare.id,
    bareRoot: bare.root,
  };
}

const USER_IDS = [
  'reader',
  'member',
  'specReader',
  'sessionReader',
  'otherProject',
  'mixed',
  'stranger',
];

let fixture: Fixture;
let app: FastifyInstance;
let store: InMemoryAuthenticationStore;
let port: number;

function config(projectId: string): RuntimeConfig {
  const password = passwordConfig();
  port = password.server.port;

  return {
    ...password,
    authentication: {
      ...password.authentication,
      users: {
        ...Object.fromEntries(USER_IDS.map((id) => [id, { name: id }])),
      },
      providers: {
        ...password.authentication.providers,
        password: { enabled: true, accounts: {} },
      },
    },
    // Global and project viewers read the documentation; a grant bounded to a Specification or a
    // Session, to another project, or to a Specification of this project admits none of it.
    authorization: {
      assignments: [
        { userId: 'reader', role: 'viewer', scope: {} },
        { userId: 'member', role: 'viewer', scope: { projectId } },
        { userId: 'specReader', role: 'viewer', scope: { specId: 'S1' } },
        { userId: 'sessionReader', role: 'viewer', scope: { sessionId: 'session-1' } },
        { userId: 'otherProject', role: 'viewer', scope: { projectId: 'other' } },
        { userId: 'mixed', role: 'viewer', scope: { projectId, specId: 'S1' } },
      ],
    },
    docs: {
      docs: DEFAULT_DOCS_SETTINGS,
      embeddings: { protocol: 'openai-compatible', baseUrl: TRUSTED_URL, model: TRUSTED_MODEL },
    },
  };
}

const cookie = (userId: string) => ({
  cookie: `${authCookieNames(port).session}=${store.createSession({
    userId,
    authenticatedWith: { kind: 'password' },
  })}`,
});

/** Every status carries `no-store`: the guard's 401 and 403 and a validation 400 included. */
async function get(runtime: FastifyInstance, url: string, userId?: string) {
  const response = await runtime.inject({ url, ...(userId ? { headers: cookie(userId) } : {}) });
  expect(response.headers['cache-control'], `${url} -> ${String(response.statusCode)}`).toBe(
    'no-store',
  );

  return response;
}

const ws = (id: string) => `/api/workspaces/${id}/docs`;
const article = (id: string, documentId: string) => `${ws(id)}/documents/${documentId}`;
const search = (id: string, query: string) => `${ws(id)}/search?${query}`;

/** Polls (macrotask turns, no timers) until `check` accepts the answer. */
async function until<T>(read: () => Promise<T>, check: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const value = await read();
    if (check(value)) {
      return value;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('The condition was not met in time.');
}

beforeAll(async () => {
  fixture = await createFixture();
  store = new InMemoryAuthenticationStore();
  const projectId = fixture.engine.context.project.projectId;
  app = await createRuntimeApp(config(projectId), {
    auth: { store },
    specs: { engine: fixture.engine },
    docs: { createProvider, startRefresh: false },
  });
}, setupTimeoutMs);

afterAll(async () => {
  await app?.close();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })));
});

describe('workspace documentation over HTTP', () => {
  it('serves each workspace its own text and uses only the trusted embedding endpoint', async () => {
    const { primaryId: primary, linkedId: linked } = fixture;
    const bodyOf = async (id: string) =>
      (await get(app, article(id, 'guide'), 'reader')).json<WorkspaceDocsArticle>();

    const first = await bodyOf(primary);
    const second = await bodyOf(linked);
    expect(Value.Check(WorkspaceDocsArticleSchema, first)).toBe(true);
    expect(first).toMatchObject({ workspaceId: primary });
    expect(first.body).toContain('widget');
    expect(first.body).not.toContain('gadget');
    expect(second).toMatchObject({ workspaceId: linked });
    expect(second.body).toContain('gadget');
    expect(second.body).not.toContain('widget');
    expect(second.corpusRevision).not.toBe(first.corpusRevision);

    // The same query ranks the same id in each, with that checkout's own excerpt.
    const snippet = async (id: string) => {
      const response = await get(app, search(id, 'q=install%20package&limit=1'), 'reader');
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json<WorkspaceDocsSearch>();
      expect(Value.Check(WorkspaceDocsSearchSchema, body)).toBe(true);
      expect(body.workspaceId).toBe(id);

      return response.body;
    };

    const fromPrimary = await snippet(primary);
    expect(fromPrimary).toContain('widget');
    expect(fromPrimary).not.toContain('gadget');
    // The worktree's first searches may still be lexical while its index is prepared.
    const fromLinked = await snippet(linked);
    expect(fromLinked).toContain('gadget');
    expect(fromLinked).not.toContain('widget');

    // A checkout's own `ai.embeddings` is never read: the worktree reached the fake provider only
    // through the Runtime's endpoint (hybrid in the end, so the endpoint was used for it).
    const hybrid = await until(
      async () =>
        (await get(app, search(linked, 'q=install'), 'reader')).json<WorkspaceDocsSearch>(),
      (body) => body.mode === 'hybrid',
    );
    expect(hybrid.workspaceId).toBe(linked);
    expect([...endpoints]).toEqual([`${TRUSTED_URL}|${TRUSTED_MODEL}`]);
    expect(endpoints.has(WORKTREE_ENDPOINT)).toBe(false);
  });

  it('answers 401 first, then 403 without revealing workspaces, and 200 to a project or global viewer', async () => {
    const { primaryId, linkedId } = fixture;
    const unknown = randomUUID();
    const own = [ws(primaryId), article(primaryId, 'guide'), search(primaryId, 'q=install')];
    for (const url of own) {
      const unauthenticated = await get(app, url);
      expect(unauthenticated.statusCode, url).toBe(401);
    }

    for (const userId of ['stranger', 'specReader', 'sessionReader', 'otherProject', 'mixed']) {
      for (const url of [...own, ws(unknown), article(unknown, 'guide'), ws(linkedId)]) {
        const forbidden = await get(app, url, userId);
        expect(forbidden.statusCode, `${userId} ${url}`).toBe(403);
        expect(forbidden.json()).toEqual({ error: 'forbidden' });
      }
    }

    for (const userId of ['reader', 'member']) {
      for (const url of [...own, ws(linkedId)]) {
        expect((await get(app, url, userId)).statusCode, `${userId} ${url}`).toBe(200);
      }
    }

    // Validation answers 400 before the guard, and still without caching.
    for (const url of [
      ws('not-a-uuid'),
      search(primaryId, 'limit=5'),
      search(primaryId, 'q=%20'),
      search(primaryId, 'q=install&limit=0'),
      search(primaryId, 'q=install&limit=51'),
      search(primaryId, 'q=install&snippets=1'),
      search(primaryId, 'q=install&includeProposals=yes'),
      search(primaryId, 'q=install&context=help'),
    ]) {
      expect((await get(app, url, 'reader')).statusCode, url).toBe(400);
    }
  });

  it('answers 503 before 403 when the Runtime has no Engine', async () => {
    const noEngine = await createRuntimeApp(config('unused'), {
      auth: { store },
      docs: { createProvider, startRefresh: false },
    });
    try {
      const url = ws(fixture.primaryId);
      expect((await get(noEngine, url)).statusCode).toBe(401);
      for (const userId of ['stranger', 'reader']) {
        const unavailable = await get(noEngine, url, userId);
        expect(unavailable.statusCode, userId).toBe(503);
        expect(unavailable.json()).toMatchObject({ code: 'DOCS_UNAVAILABLE' });
        expect(Value.Check(WorkspaceDocsErrorSchema, unavailable.json())).toBe(true);
      }
    } finally {
      await noEngine.close();
    }
  });

  it('reads one corpus revision across tree, article and search, with their skipped lists', async () => {
    const id = fixture.primaryId;
    const treeResponse = await get(app, ws(id), 'reader');
    expect(treeResponse.statusCode, treeResponse.body).toBe(200);
    const tree = treeResponse.json<WorkspaceDocsTree>();
    expect(Value.Check(WorkspaceDocsTreeSchema, tree)).toBe(true);
    expect(tree.workspaceId).toBe(id);
    expect(tree.docsRoot).toBe('docs');
    expect(tree.rootIndexDocumentId).toBe('home');
    expect(tree.documents.map((d) => [d.documentId, d.path, d.proposal])).toEqual(
      expect.arrayContaining([
        ['guide', 'guide.md', false],
        ['idea', 'ideas/draft.md', true],
      ]),
    );
    expect(tree.inactive).toEqual([
      expect.objectContaining({ documentId: 'old', supersededBy: 'guide' }),
    ]);
    // Paths are relative to docs.root, the reasons included.
    expect(tree.skipped.map((s) => s.path).sort()).toEqual(['bad.md', 'twin-a.md', 'twin-b.md']);
    // ... and so are the paths inside a reason (a duplicate names its twin).
    expect(tree.skipped.find((s) => s.path === 'twin-a.md')?.error).toBe(
      "duplicate id 'twin' (also in twin-b.md)",
    );

    const read = (await get(app, article(id, 'guide'), 'reader')).json<WorkspaceDocsArticle>();
    const found = (await get(app, search(id, 'q=install'), 'reader')).json<WorkspaceDocsSearch>();
    expect(read.corpusRevision).toBe(tree.corpusRevision);
    expect(found.corpusRevision).toBe(tree.corpusRevision);
    expect(read.skipped).toEqual(tree.skipped);
    expect(found.skipped).toEqual(tree.skipped);
    expect(read.sections.map((s) => s.headingPath)).toContainEqual(['Guide', 'Install']);

    // Hybrid, relative hits, and the proposal counted but left out.
    expect(found.mode).toBe('hybrid');
    expect(found.results.map((r) => r.file)).toContain('guide.md');
    expect(found.results.map((r) => r.id)).not.toContain('idea');
    expect(found.proposalsLeftOut).toBe(1);
    const included = (
      await get(app, search(id, 'q=install&includeProposals=true'), 'reader')
    ).json<WorkspaceDocsSearch>();
    expect(included.results.map((r) => r.file)).toContain('ideas/draft.md');
    expect(included.proposalsLeftOut).toBe(0);
    expect(included.corpusRevision).toBe(tree.corpusRevision);
  });

  it('answers each document state with the corpus it was decided in', async () => {
    const id = fixture.primaryId;
    const revision = (await get(app, ws(id), 'reader')).json<WorkspaceDocsTree>().corpusRevision;

    const inactive = await get(app, article(id, 'old'), 'reader');
    expect(inactive.statusCode).toBe(410);
    expect(Value.Check(DocsDocumentInactiveErrorSchema, inactive.json())).toBe(true);
    expect(inactive.json()).toMatchObject({
      code: 'DOCS_DOCUMENT_INACTIVE',
      workspaceId: id,
      corpusRevision: revision,
      status: 'superseded',
      supersededBy: { documentId: 'guide', title: 'guide title' },
    });

    const skipped = await get(app, article(id, 'twin'), 'reader');
    expect(skipped.statusCode).toBe(404);
    expect(Value.Check(DocsDocumentSkippedErrorSchema, skipped.json())).toBe(true);
    expect(skipped.json()).toMatchObject({
      code: 'DOCS_DOCUMENT_SKIPPED',
      workspaceId: id,
      corpusRevision: revision,
    });
    const reasons = skipped.json<{ skipped: { path: string; error: string }[] }>().skipped;
    expect(reasons.map((r) => r.path).sort()).toEqual(['twin-a.md', 'twin-b.md']);
    // Parsed values, not raw JSON (where Windows separators are escaped).
    for (const { path, error } of reasons) {
      expect(`${path} ${error}`).not.toMatch(/docs[/\\]/u);
    }

    const treeTwins = (await get(app, ws(id), 'reader'))
      .json<WorkspaceDocsTree>()
      .skipped.filter((entry) => entry.path.startsWith('twin'));
    expect(reasons).toEqual(treeTwins);
    expect(treeTwins).toHaveLength(2);

    const missing = await get(app, article(id, 'nope'), 'reader');
    expect(missing.statusCode).toBe(404);
    expect(Value.Check(DocsDocumentNotFoundErrorSchema, missing.json())).toBe(true);
    expect(missing.json()).toMatchObject({
      code: 'DOCS_DOCUMENT_NOT_FOUND',
      workspaceId: id,
      corpusRevision: revision,
    });

    // A document of another workspace is not found here and nothing names the other one.
    const other = await get(app, article(fixture.linkedId, 'old'), 'reader');
    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: 'DOCS_DOCUMENT_NOT_FOUND' });
    expect(other.body).not.toContain(id);
  });

  it('changes the revision after a dirty edit and answers 404 for a deleted document', async () => {
    const id = fixture.primaryId;
    const revisionOf = async () =>
      (await get(app, ws(id), 'reader')).json<WorkspaceDocsTree>().corpusRevision;
    const before = await revisionOf();
    const linkedBefore = (await get(app, ws(fixture.linkedId), 'reader')).json<WorkspaceDocsTree>();

    await write(fixture.primaryRoot, {
      'guide.md': hub('guide', '# Guide\n\n## Install\n\nInstall the widget with yarn.'),
    });
    const edited = (await get(app, article(id, 'guide'), 'reader')).json<WorkspaceDocsArticle>();
    expect(edited.body).toContain('yarn');
    expect(edited.corpusRevision).not.toBe(before);
    expect(await revisionOf()).toBe(edited.corpusRevision);
    const found = (await get(app, search(id, 'q=install'), 'reader')).json<WorkspaceDocsSearch>();
    expect(found.corpusRevision).toBe(edited.corpusRevision);

    // The other workspace's revision is untouched.
    expect(
      (await get(app, ws(fixture.linkedId), 'reader')).json<WorkspaceDocsTree>().corpusRevision,
    ).toBe(linkedBefore.corpusRevision);

    expect((await get(app, article(id, 'temp'), 'reader')).statusCode).toBe(200);
    await unlink(join(fixture.primaryRoot, 'docs/temp.md'));
    const deleted = await get(app, article(id, 'temp'), 'reader');
    expect(deleted.statusCode).toBe(404);
    expect(deleted.json()).toMatchObject({
      code: 'DOCS_DOCUMENT_NOT_FOUND',
      corpusRevision: await revisionOf(),
    });
  });

  it('answers 404 for an unregistered workspace and 409 for a registered one that cannot be read', async () => {
    const unknown = await get(app, ws(randomUUID()), 'reader');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: 'DOCS_WORKSPACE_NOT_FOUND' });
    expect(Value.Check(WorkspaceDocsErrorSchema, unknown.json())).toBe(true);

    // The registered worktree's folder was removed.
    for (const url of [
      ws(fixture.goneId),
      article(fixture.goneId, 'guide'),
      search(fixture.goneId, 'q=install'),
    ]) {
      const unavailable = await get(app, url, 'reader');
      expect(unavailable.statusCode, url).toBe(409);
      expect(unavailable.json()).toMatchObject({ code: 'DOCS_WORKSPACE_UNAVAILABLE' });
      expect(unavailable.json<{ error: string }>().error).not.toContain(fixture.goneRoot);
    }
  });

  it('answers 503 for a workspace without a documentation folder or with invalid settings, re-read per request', async () => {
    const id = fixture.bareId;
    const missing = await get(app, ws(id), 'reader');
    expect(missing.statusCode).toBe(503);
    expect(missing.json()).toMatchObject({ code: 'DOCS_NOT_CONFIGURED', docsRoot: 'docs' });
    expect(Value.Check(WorkspaceDocsErrorSchema, missing.json())).toBe(true);

    // The folder appears with an invalid docs.yaml; no restart needed.
    await write(fixture.bareRoot, { 'docs.yaml': 'bogus: true\n' });
    const invalid = await get(app, ws(id), 'reader');
    expect(invalid.statusCode).toBe(503);
    expect(invalid.json()).toMatchObject({ code: 'DOCS_UNAVAILABLE' });
    const { error } = invalid.json<{ error: string }>();
    expect(error).not.toContain(fixture.bareRoot);
    expect(error).not.toContain('docs.yaml');

    await write(fixture.bareRoot, { 'docs.yaml': '', 'README.md': hub('home', '# Home') });
    expect((await get(app, ws(id), 'reader')).statusCode).toBe(200);
  });

  it('shows the index progress while the background refresh embeds, then answers hybrid under the same revision', async () => {
    const id = fixture.primaryId;
    const sections = Array.from({ length: 20 }, (_, n) => `## Part ${String(n)}\n\nText.`);
    await write(fixture.primaryRoot, { 'big.md': hub('big', `# Big\n\n${sections.join('\n\n')}`) });
    let release!: () => void;
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const first = (await get(app, search(id, 'q=part'), 'reader')).json<WorkspaceDocsSearch>();
      expect(first.mode).toBe('lexical');
      expect(first).toMatchObject({ reason: { code: 'index-building' } });

      const building = await until(
        async () => (await get(app, search(id, 'q=part'), 'reader')).json<WorkspaceDocsSearch>(),
        (body) => body.indexProgress !== undefined,
      );
      expect(Value.Check(WorkspaceDocsSearchSchema, building)).toBe(true);
      expect(building.mode).toBe('lexical');
      expect(building.indexProgress).toMatchObject({ embedded: 0 });
      expect(building.indexProgress?.total).toBeGreaterThan(0);

      release();
      const done = await until(
        async () => (await get(app, search(id, 'q=part'), 'reader')).json<WorkspaceDocsSearch>(),
        (body) => body.mode === 'hybrid' && body.indexProgress === undefined,
      );
      // The index changed, the corpus did not.
      expect(done.corpusRevision).toBe(first.corpusRevision);
      expect(done.corpusRevision).toBe(building.corpusRevision);
    } finally {
      release();
      hold = undefined;
    }
  });
});
