import {
  CloseOperationError,
  DocumentError,
  planPublicCloseOperation,
  previewPublicCloseOperation,
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
  previewPublicCloseOperation: vi.fn(),
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
  vi.mocked(previewPublicCloseOperation).mockReset();
  vi.mocked(planPublicWorkspaceCloseOperation).mockReset();
});

describe('Close preview routes', () => {
  it('answer document commits that hold the checkout as the Close would (409 DOCUMENT_COMMITS_PENDING)', async () => {
    const held = () =>
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Document commits are not finished.', {
        cause: 'commit-uncommitted',
      });
    vi.mocked(previewPublicCloseOperation).mockRejectedValue(held());
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

  it('serve the merge facts of a Specification Close preview', async () => {
    const merge = {
      status: 'integrates',
      sourceBranch: 'feature/nevo-1-sso',
      targetBranch: 'develop',
      commitsAhead: 0,
    } as const;
    vi.mocked(previewPublicCloseOperation).mockResolvedValue({
      operationId: '00000000-0000-4000-8000-000000000003',
      specId: SPEC,
      kind: 'specification-close',
      location: 'active',
      integrationRequired: true,
      sourceWorkspace: { workspaceId: WORKSPACE, kind: 'linked' },
      merge,
    });
    const app = appWithEngine();
    try {
      const response = await app.inject({ method: 'GET', url: `/api/specs/${SPEC}/close/preview` });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ integrationRequired: true, merge });
      expect(response.json()).not.toHaveProperty('sourceWorkspace');
    } finally {
      await app.close();
    }
  });

  it('answer a missing integration branch with its candidates, none chosen (422 CLOSE_PREFLIGHT)', async () => {
    const blocker = {
      kind: 'integration-target-missing',
      sourceCheckout: 'linked',
      candidates: [
        { branch: 'release/2026.11', facts: ['remote-default', 'started-from'], remote: 'origin' },
        { branch: 'develop', facts: ['primary-checkout'] },
      ],
      otherBranches: ['hotfix'],
      otherBranchCount: 1,
    } as const;
    vi.mocked(previewPublicCloseOperation).mockRejectedValue(
      new CloseOperationError('CLOSE_PREFLIGHT', 'No integration branch.', {
        repository: [blocker],
      }),
    );
    const app = appWithEngine();
    try {
      const response = await app.inject({ method: 'GET', url: `/api/specs/${SPEC}/close/preview` });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toEqual({
        code: 'CLOSE_PREFLIGHT',
        error: 'CLOSE_PREFLIGHT',
        repository: [blocker],
      });
    } finally {
      await app.close();
    }
  });
});
