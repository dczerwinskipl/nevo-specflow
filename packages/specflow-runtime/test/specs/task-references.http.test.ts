import { describe, expect, it } from 'vitest';
import { createAuthorization } from '@nevo/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import { createRequestAuthorization } from '../../src/features/auth/authorization/request-authorization';
import { readTaskDetail } from '../../src/features/tasks/detail/read-task-detail';
import { PageLeases } from '../../src/features/tasks/reads/page-leases';
import { sessionReferences } from '../support/session-references';
import { createFixtureTaskSources } from '../support/task-sources';

describe('Task reference authorization', () => {
  it.each([false, true])(
    'keeps spec and session permissions independent (Session access=%s)',
    async (sessionAccess) => {
      const sources = createFixtureTaskSources();
      const definition = (await sources.definitions.resolve('admission', 'task-03'))!;
      definition.dependencies = [
        {
          taskId: 'dependency-0',
          title: 'Protected session description',
          link: { state: 'available', target: { kind: 'session', sessionId: 'protected-session' } },
        },
        {
          taskId: 'dependency-1',
          title: 'Secret foreign document',
          link: {
            state: 'available',
            target: {
              kind: 'document',
              specId: 'secret-spec',
              documentId: 'secret-document',
              revision: '1',
            },
          },
        },
      ];
      const subject = { kind: 'user' as const, id: 'reader' };
      const authorization = createAuthorization({
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
                  scope: { specId: 'actual-owner', sessionId: 'protected-session' },
                },
              ]
            : []),
        ],
      });
      const authz = createRequestAuthorization({ mode: 'subject', subject }, authorization);
      const deps = {
        ...sources,
        leases: new PageLeases(),
        definitions: { resolve: () => Promise.resolve(definition) },
        sessions: sessionReferences((sessionId: string) =>
          Promise.resolve({
            sessionId,
            specId: 'actual-owner',
            projectId: definition.identity.projectId,
            workspaceId: definition.identity.workspaceId,
          }),
        ),
      };
      const result = await readTaskDetail(deps, 'admission', 'task-03', authz);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') {
        throw Error('Expected detail');
      }

      const body = JSON.stringify(result.value);
      expect(body).not.toContain('secret-');
      expect(body).not.toContain('Secret foreign');
      expect(body.includes('protected-session')).toBe(sessionAccess);
    },
  );
});
