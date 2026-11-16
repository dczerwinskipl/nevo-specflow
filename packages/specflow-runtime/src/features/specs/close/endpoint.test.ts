import {
  DocumentError,
  planPublicCloseOperation,
  planPublicWorkspaceCloseOperation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RUNTIME_FASTIFY_OPTIONS } from '../../../server/app';
import { registerRuntimeErrorHandler } from '../../../server/error-handler';
import { registerSharedContracts } from '../../../server/shared-contracts';
import type { RequestAuthorization } from '../../auth/authorization/request-authorization';
import { specsCloseEndpoint } from './endpoint';

// Only the Engine's Close planning is replaced: the route's refusal mapping is the unit under test.
vi.mock('@nevo/specflow-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/specflow-engine')>()),
  planPublicCloseOperation: vi.fn(),
  planPublicWorkspaceCloseOperation: vi.fn(),
}));

const SPEC = '00000000-0000-4000-8000-000000000001';
const WORKSPACE = '00000000-0000-4000-8000-000000000002';
const engine = { context: { project: { projectId: 'project-1' } } } as unknown as SpecFlowEngine;

function appWithEngine() {
  const app = Fastify({ ajv: RUNTIME_FASTIFY_OPTIONS.ajv });
  registerSharedContracts(app);
  registerRuntimeErrorHandler(app);
  // Every capability is granted: authorization is not what this test is about.
  app.decorateRequest('authz', {
    getter: () =>
      ({
        requireAccess: () => undefined,
        require: () => undefined,
      }) as unknown as RequestAuthorization,
  });
  void app.register(specsCloseEndpoint, { engine });

  return app;
}

afterEach(() => {
  vi.mocked(planPublicCloseOperation).mockReset();
  vi.mocked(planPublicWorkspaceCloseOperation).mockReset();
});

describe('Close preview routes', () => {
  it('answer document commits that hold the checkout as the Close would (409 DOCUMENT_COMMITS_PENDING)', async () => {
    const held = () =>
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Document commits are not finished.', {
        cause: 'commit-uncommitted',
      });
    vi.mocked(planPublicCloseOperation).mockRejectedValue(held());
    vi.mocked(planPublicWorkspaceCloseOperation).mockRejectedValue(held());
    const app = appWithEngine();
    const expected = {
      error: 'DOCUMENT_COMMITS_PENDING',
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    };
    try {
      for (const url of [
        `/api/specs/${SPEC}/close/preview`,
        `/api/workspaces/${WORKSPACE}/close/preview`,
      ]) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode, `${url}: ${response.body}`).toBe(409);
        expect(response.json()).toMatchObject(expected);
      }
    } finally {
      await app.close();
    }
  });
});
