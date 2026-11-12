import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROBE_TEXT, inspectFileStoreWriter } from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import {
  DocsSearchResultSchema,
  DocsStatusSchema,
  type DocsSearchResult,
  type DocsStatus,
} from '@nevo/specflow-contracts/docs';
import {
  DEFAULT_DOCS_SETTINGS,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
} from '@nevo/specflow-docs';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import { Value } from 'typebox/value';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../../src/config/types';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import type { DocsFeatureDependencies } from '../../src/features/docs';
import { createRuntimeApp } from '../../src/server/app';
import { noAuthConfig, passwordConfig } from '../auth/support/config';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Trusted local mode whose local user is a viewer. */
function localViewer(): RuntimeConfig {
  return {
    ...noAuthConfig(),
    authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
  };
}

/**
 * A project with two small documents, far below the read-time refresh bound; `large` adds a
 * document with more sections than a search embeds.
 */
function project(large = false): string {
  const root = mkdtempSync(join(tmpdir(), 'specflow-runtime-docs-'));
  roots.push(root);
  mkdirSync(join(root, 'docs'));
  const doc = (id: string, body: string) =>
    `---\nid: ${id}\ntype: hub\ntitle: ${id} title\nstatus: current\n---\n\n${body}\n`;
  writeFileSync(join(root, 'docs', 'guide.md'), doc('guide', '# Guide\n\nInstall the widget.'));
  writeFileSync(join(root, 'docs', 'other.md'), doc('other', '# Other\n\nUnrelated text.'));
  if (large) {
    const parts = Array.from({ length: 20 }, (_, n) => `## Part ${String(n)}\n\nText.`);
    writeFileSync(join(root, 'docs', 'big.md'), doc('big', `# Big\n\n${parts.join('\n\n')}`));
  }

  return root;
}

const semantic: DocsConfiguration = {
  docs: { ...DEFAULT_DOCS_SETTINGS, search: { semantic: true } },
  embeddings: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
};

const PROJECT_ID = 'docs-project';
/** Only the project id is read: the scope of `docs.view`. */
const engine = { context: { project: { projectId: PROJECT_ID } } } as unknown as SpecFlowEngine;

function docsApp(
  config: RuntimeConfig,
  docs: DocsFeatureDependencies,
  options: { semantic?: boolean; store?: InMemoryAuthenticationStore; engine?: false } = {},
) {
  return createRuntimeApp(
    { ...config, ...(options.semantic ? { docs: semantic } : {}) },
    {
      docs,
      ...(options.engine === false ? {} : { specs: { engine } }),
      ...(options.store ? { auth: { store: options.store } } : {}),
    },
  );
}

const fake: CreateEmbeddingProvider = () => createFakeEmbeddingProvider();

describe('GET /api/docs/search', () => {
  it('answers hybrid with the fake endpoint and lexical without semantic search', async () => {
    const hybrid = await docsApp(
      localViewer(),
      { projectRoot: project(), createProvider: fake, startRefresh: false },
      { semantic: true },
    );
    try {
      const response = await hybrid.inject('/api/docs/search?q=install%20widget&limit=1');
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json<DocsSearchResult>();
      expect(Value.Check(DocsSearchResultSchema, body)).toBe(true);
      expect(body).toMatchObject({ mode: 'hybrid', results: [{ id: 'guide' }] });
      expect(body.results).toHaveLength(1);
      expect(body.results[0]!.sections[0]).toMatchObject({ snippet: 'Install the widget.' });

      const without = await hybrid.inject('/api/docs/search?q=install&limit=1&snippets=false');
      const plainBody = without.json<DocsSearchResult>();
      expect(Value.Check(DocsSearchResultSchema, plainBody)).toBe(true);
      expect(plainBody.results[0]!.sections[0]).not.toHaveProperty('snippet');
    } finally {
      await hybrid.close();
    }

    // Semantic search off: lexical, and the start refresh writes nothing below `.nevo/`.
    const plain = project();
    const lexical = await docsApp(localViewer(), { projectRoot: plain, createProvider: fake });
    try {
      const response = await lexical.inject('/api/docs/search?q=install');
      expect(response.json()).toMatchObject({
        mode: 'lexical',
        reason: { code: 'semantic-disabled' },
        results: [{ id: 'guide' }],
      });
    } finally {
      await lexical.close();
    }

    expect(existsSync(join(plain, '.nevo'))).toBe(false);

    // Opted in without an endpoint: no start refresh, so no warning on every start.
    const noEndpoint = await createRuntimeApp(
      { ...localViewer(), docs: { docs: semantic.docs, embeddings: undefined } },
      { docs: { projectRoot: project(), createProvider: fake } },
    );
    try {
      const warn = vi.spyOn(noEndpoint.log, 'warn');
      await noEndpoint.ready();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await noEndpoint.close();
    }
  });

  it('needs authentication and docs.view at the project scope, and validates the query', async () => {
    const password = passwordConfig();
    const store = new InMemoryAuthenticationStore();
    const cookie = (userId: string) => ({
      cookie: `${authCookieNames(password.server.port).session}=${store.createSession({
        userId,
        authenticatedWith: { kind: 'password' },
      })}`,
    });
    const config: RuntimeConfig = {
      ...password,
      authentication: {
        ...password.authentication,
        users: {
          reader: { name: 'Reader' },
          member: { name: 'Member' },
          specReader: { name: 'Spec reader' },
          sessionReader: { name: 'Session reader' },
          stranger: { name: 'Stranger' },
        },
        providers: {
          ...password.authentication.providers,
          password: { enabled: true, accounts: {} },
        },
      },
      // Global and project viewers read the documentation; a grant bounded to a Specification or
      // a Session admits none of it.
      authorization: {
        assignments: [
          { userId: 'reader', role: 'viewer', scope: {} },
          { userId: 'member', role: 'viewer', scope: { projectId: PROJECT_ID } },
          { userId: 'specReader', role: 'viewer', scope: { specId: 'S1' } },
          { userId: 'sessionReader', role: 'viewer', scope: { sessionId: 'session-1' } },
        ],
      },
    };
    const app = await docsApp(config, { projectRoot: project() }, { store });
    try {
      const url = '/api/docs/search?q=install';
      expect((await app.inject(url)).statusCode).toBe(401);
      for (const userId of ['stranger', 'specReader', 'sessionReader']) {
        const forbidden = await app.inject({ url, headers: cookie(userId) });
        expect(forbidden.statusCode, userId).toBe(403);
        expect(forbidden.json()).toEqual({ error: 'forbidden' });
        // The status endpoint has the same access rule.
        const status = await app.inject({ url: '/api/docs/status', headers: cookie(userId) });
        expect(status.statusCode, userId).toBe(403);
      }

      expect((await app.inject('/api/docs/status')).statusCode).toBe(401);
      const reader = cookie('reader');
      expect((await app.inject({ url, headers: reader })).statusCode).toBe(200);
      expect((await app.inject({ url, headers: cookie('member') })).statusCode).toBe(200);
      const included = `${url}&includeNonAuthoritative=true`;
      expect((await app.inject({ url: included, headers: reader })).statusCode).toBe(200);
      for (const invalid of [
        '?q=install&limit=0',
        '?q=install&limit=51',
        '?q=%20',
        '?limit=5',
        '?q=install&includeNonAuthoritative=1',
        '?q=install&context=help',
      ]) {
        const response = await app.inject({ url: `/api/docs/search${invalid}`, headers: reader });
        expect(response.statusCode, invalid).toBe(400);
      }
    } finally {
      await app.close();
    }

    // Without an Engine there is no project to check `docs.view` at: 401 first, then 503.
    const noEngine = await docsApp(config, { projectRoot: project() }, { store, engine: false });
    try {
      for (const path of ['/api/docs/search?q=install', '/api/docs/status']) {
        expect((await noEngine.inject(path)).statusCode, path).toBe(401);
        const unavailable = await noEngine.inject({ url: path, headers: cookie('reader') });
        expect(unavailable.statusCode, path).toBe(503);
        expect(unavailable.json()).toEqual({
          error: 'Documentation search is unavailable.',
          code: 'DOCS_UNAVAILABLE',
        });
      }
    } finally {
      await noEngine.close();
    }
  });
});

describe('the start refresh', () => {
  it('does not delay readiness, leaves searches lexical while it runs and stops on close', async () => {
    const root = project();
    let started!: () => void;
    const embedding = new Promise<void>((resolve) => {
      started = resolve;
    });
    // The refresh's document requests hang until the Runtime closes and its signal aborts them;
    // searches get providers without a signal.
    const createProvider: CreateEmbeddingProvider = (_settings, { signal }) => {
      const provider = createFakeEmbeddingProvider();
      if (signal === undefined) {
        return provider;
      }

      return {
        ...provider,
        embed: (texts, purpose) => {
          if (texts[0] === PROBE_TEXT) {
            return provider.embed(texts, purpose);
          }

          started();

          return new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve({ ok: false, failure: { code: 'timeout', message: 'stopped' } });
            });
          });
        },
      };
    };

    const app = await docsApp(
      localViewer(),
      { projectRoot: root, createProvider },
      { semantic: true },
    );
    let closed = false;
    try {
      await app.ready();
      await embedding;
      const response = await app.inject('/api/docs/search?q=install');
      expect(response.json()).toMatchObject({
        mode: 'lexical',
        reason: { code: 'index-building' },
        results: [{ id: 'guide' }],
      });

      await app.close();
      closed = true;
      expect(
        await inspectFileStoreWriter({
          directory: join(root, '.nevo/local/cache/docs-index/vectors'),
        }),
      ).toEqual({ status: 'free' });
    } finally {
      if (!closed) {
        await app.close();
      }
    }
  });
});

describe('the search catch-up and GET /api/docs/status', () => {
  it('a large gap answers lexically, starts one in-process refresh and status shows its progress', async () => {
    const root = project(true);
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refreshes = 0;
    // The refresh's providers carry a signal; its one document request (fewer chunks than one
    // slice) counts the refresh and waits for `release`.
    const createProvider: CreateEmbeddingProvider = (_settings, { signal }) => {
      const provider = createFakeEmbeddingProvider();
      if (signal === undefined) {
        return provider;
      }

      return {
        ...provider,
        embed: async (texts, purpose) => {
          if (texts[0] !== PROBE_TEXT) {
            refreshes += 1;
            await released;
          }

          return provider.embed(texts, purpose);
        },
      };
    };

    const app = await docsApp(
      localViewer(),
      { projectRoot: root, createProvider, startRefresh: false },
      { semantic: true },
    );
    try {
      const first = await app.inject('/api/docs/search?q=part');
      expect(first.json()).toMatchObject({
        mode: 'lexical',
        reason: {
          code: 'index-building',
          message: expect.stringContaining(
            'the Runtime started updating it in the background',
          ) as unknown,
        },
      });

      // Wait until the refresh has made its plan, then search and read the status meanwhile.
      let status: DocsStatus;
      do {
        await new Promise<void>((resolve) => setImmediate(resolve));
        status = (await app.inject('/api/docs/status')).json<DocsStatus>();
      } while (status.activity.state !== 'updating' || status.activity.progress === undefined);

      expect(Value.Check(DocsStatusSchema, status)).toBe(true);
      expect(status).toMatchObject({
        mode: 'lexical',
        reason: { code: 'index-building' },
        enabled: true,
        reachability: { reachable: true },
        index: { state: 'missing' },
        activity: { state: 'updating', pid: process.pid, progress: { embedded: 0 } },
        failed: false,
      });

      const second = await app.inject('/api/docs/search?q=part');
      expect(second.json<DocsSearchResult>()).toMatchObject({
        mode: 'lexical',
        reason: {
          message: expect.stringContaining(
            'the Runtime is updating it in the background (0/',
          ) as unknown,
        },
      });
      expect(refreshes).toBe(1);
    } finally {
      release();
      await app.close();
    }

    expect(refreshes).toBe(1);
    expect(
      await inspectFileStoreWriter({
        directory: join(root, '.nevo/local/cache/docs-index/vectors'),
      }),
    ).toEqual({ status: 'free' });
  });
});

describe('GET /api/docs/status reachability', () => {
  it('probes with the query timeout and shares the result between requests of this Runtime', async () => {
    // The timeout of every provider whose probe ran.
    const probes: (number | undefined)[] = [];
    const createProvider: CreateEmbeddingProvider = (settings) => {
      const provider = createFakeEmbeddingProvider();

      return {
        ...provider,
        probe: () => {
          probes.push(settings.timeoutMs);

          return provider.probe();
        },
      };
    };

    const app = await docsApp(
      localViewer(),
      { projectRoot: project(), createProvider, startRefresh: false },
      { semantic: true },
    );
    try {
      for (let request = 0; request < 3; request += 1) {
        const status = (await app.inject('/api/docs/status')).json<DocsStatus>();
        expect(status.reachability).toMatchObject({ reachable: true });
      }

      // One probe, by the query provider (3000 ms), not the document one (default 60 s).
      expect(probes).toEqual([3000]);
    } finally {
      await app.close();
    }
  });
});
