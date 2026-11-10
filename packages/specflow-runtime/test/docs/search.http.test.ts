import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROBE_TEXT } from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { DocsSearchResultSchema, type DocsSearchResult } from '@nevo/specflow-contracts/docs';
import {
  DEFAULT_DOCS_SETTINGS,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
} from '@nevo/specflow-docs';
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

/** A project with two small documents, far below the read-time refresh bound. */
function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'specflow-runtime-docs-'));
  roots.push(root);
  mkdirSync(join(root, 'docs'));
  const doc = (id: string, body: string) =>
    `---\nid: ${id}\ntype: hub\ntitle: ${id} title\nstatus: current\n---\n\n${body}\n`;
  writeFileSync(join(root, 'docs', 'guide.md'), doc('guide', '# Guide\n\nInstall the widget.'));
  writeFileSync(join(root, 'docs', 'other.md'), doc('other', '# Other\n\nUnrelated text.'));

  return root;
}

const semantic: DocsConfiguration = {
  docs: { ...DEFAULT_DOCS_SETTINGS, search: { semantic: true } },
  embeddings: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
};

function docsApp(
  config: RuntimeConfig,
  docs: DocsFeatureDependencies,
  options: { semantic?: boolean; store?: InMemoryAuthenticationStore } = {},
) {
  return createRuntimeApp(
    { ...config, ...(options.semantic ? { docs: semantic } : {}) },
    { docs, ...(options.store ? { auth: { store: options.store } } : {}) },
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
      expect(body.results[0]!.sections[0]).not.toHaveProperty('snippet');

      const withSnippets = await hybrid.inject('/api/docs/search?q=install&limit=1&snippets=true');
      const snippetBody = withSnippets.json<DocsSearchResult>();
      expect(Value.Check(DocsSearchResultSchema, snippetBody)).toBe(true);
      expect(snippetBody.results[0]!.sections[0]).toMatchObject({ snippet: 'Install the widget.' });
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

  it('needs authentication and docs.search in any scope, and validates the query', async () => {
    const config = passwordConfig();
    const store = new InMemoryAuthenticationStore();
    const cookie = (userId: string) => ({
      cookie: `${authCookieNames(config.server.port).session}=${store.createSession({
        userId,
        authenticatedWith: { kind: 'password' },
      })}`,
    });
    const app = await docsApp(
      {
        ...config,
        authentication: {
          ...config.authentication,
          users: { reader: { name: 'Reader' }, stranger: { name: 'Stranger' } },
          providers: {
            ...config.authentication.providers,
            password: { enabled: true, accounts: {} },
          },
        },
        // A Specification-scoped viewer: project documentation has no narrower scope.
        authorization: {
          assignments: [{ userId: 'reader', role: 'viewer', scope: { specId: 'S1' } }],
        },
      },
      { projectRoot: project() },
      { store },
    );
    try {
      const url = '/api/docs/search?q=install';
      expect((await app.inject(url)).statusCode).toBe(401);
      const forbidden = await app.inject({ url, headers: cookie('stranger') });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: 'forbidden' });
      const reader = cookie('reader');
      expect((await app.inject({ url, headers: reader })).statusCode).toBe(200);
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
      expect(existsSync(join(root, '.nevo/local/cache/docs-index/vectors/writer.lock'))).toBe(
        false,
      );
    } finally {
      if (!closed) {
        await app.close();
      }
    }
  });
});
