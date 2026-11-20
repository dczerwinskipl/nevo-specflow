import { describe, expect, it } from 'vitest';
import { createAuthorization } from '@nevo/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { SpecificationTaskResponse, TaskHistoryPage } from '@nevo/specflow-contracts/tasks';
import { createRequestAuthorization } from '../../src/features/auth/authorization/request-authorization';
import { registerRuntimeErrorHandler } from '../../src/server/error-handler';
import { taskReadEndpoint } from '../../src/features/tasks/endpoint';
import { PageLeases } from '../../src/features/tasks/reads/page-leases';
import { sessionReferences } from '../support/session-references';
import { routeTestApp } from '../support/route-app';
import { createFixtureTaskSources } from '../support/task-sources';

describe('Task read authorization through the real HTTP adapter', () => {
  it('redacts Session metadata and invalidates existing tokens after subject/policy change', async () => {
    const sources = createFixtureTaskSources();
    const definition = (await sources.definitions.resolve('admission', 'task-03'))!;
    definition.dependencies = [
      {
        taskId: 'dependency-0',
        title: 'Protected session description',
        link: { state: 'available', target: { kind: 'session', sessionId: 'protected-session' } },
      },
    ];
    const subject = { kind: 'user' as const, id: 'alice' };
    const policy = (sessionAccess: boolean) =>
      createAuthorization({
        resources: [SpecCapabilities, SessionCapabilities],
        roles: {
          specs: [SpecCapabilities.capabilities.View],
          sessions: [SessionCapabilities.capabilities.View],
        },
        assignments: [
          { subject, role: 'specs', scope: { specId: 'admission' } },
          ...(sessionAccess
            ? [
                {
                  subject,
                  role: 'sessions',
                  scope: { specId: 'session-owner', sessionId: 'protected-session' },
                },
              ]
            : []),
        ],
      });
    let authorization = policy(true),
      user = subject;
    const app = routeTestApp();
    registerRuntimeErrorHandler(app);
    app.decorateRequest('authz', {
      getter: () => createRequestAuthorization({ mode: 'subject', subject: user }, authorization),
    });
    app.register(taskReadEndpoint, {
      dependencies: {
        ...sources,
        definitions: { resolve: () => Promise.resolve(definition) },
        sessions: sessionReferences((sessionId) =>
          Promise.resolve({ ...definition.identity, specId: 'session-owner', sessionId }),
        ),
        leases: new PageLeases(),
      },
    });
    try {
      const url = '/api/specs/admission/tasks/task-03';
      const detail = await app.inject(url);
      expect(detail.statusCode).toBe(200);
      expect(detail.body).toContain('Protected session description');
      const section = detail.json<SpecificationTaskResponse>().snapshot!.sections.history;
      if (section.state !== 'available') {
        throw Error('Expected history');
      }

      const pageUrl = url + '/history?token=' + encodeURIComponent(section.data.token);
      expect((await app.inject(pageUrl)).json<TaskHistoryPage>().items.length).toBeGreaterThan(0);
      authorization = policy(false);
      expect((await app.inject(pageUrl)).statusCode).toBe(409);
      const denied = await app.inject(url);
      expect(denied.statusCode).toBe(200);
      expect(denied.json<SpecificationTaskResponse>().snapshot!.revision).not.toBe(
        detail.json<SpecificationTaskResponse>().snapshot!.revision,
      );
      expect(denied.body).not.toContain('protected-session');
      expect(denied.body).not.toContain('Protected session description');
      user = { kind: 'user', id: 'bob' };
      expect((await app.inject(pageUrl)).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
