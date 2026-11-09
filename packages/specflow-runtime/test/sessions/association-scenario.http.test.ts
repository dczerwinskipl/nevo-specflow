import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
  installDefinitionsForTesting,
} from '@nevo/specflow-engine/testing';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Value } from 'typebox/value';
import { AuthorizationForbiddenErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import {
  SessionErrorSchema,
  sessionValidators,
  type CreateContextSessionResult,
  type SessionAssociationRead,
  type SessionListPage,
} from '@nevo/specflow-contracts/sessions';
import {
  SpecificationWorkspaceResponseSchema,
  type SpecificationWorkspaceResponse,
} from '@nevo/specflow-contracts/specs/workspace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

// Real Git and an Engine bootstrap: slow on Windows.
const timeoutMs = process.platform === 'win32' ? 120000 : 45000;

type Role = 'viewer' | 'developer';
type Engine = Awaited<ReturnType<typeof bootstrapProjectHome>>;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

let root = '',
  engine: Engine,
  projectId = '',
  specS = '',
  specT = '',
  app: FastifyInstance | undefined;

async function specification(title: string): Promise<string> {
  return (
    await createSpecificationFromRequest(engine, {
      archetype: { id: 'minimal', version: 1 },
      operationId: randomUUID(),
      title,
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    })
  ).specId;
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-association-scenario-')));
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
  engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);
  projectId = engine.context.project.projectId;
  specS = await specification('Scenario Specification S');
  specT = await specification('Scenario Specification T');
}, timeoutMs);

afterAll(async () => {
  await app?.close();
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * One Runtime at a time over the same Engine project and Session store: each actor of the scenario
 * is a fresh Runtime whose local user holds exactly one assignment.
 */
async function as(role: Role, scope: Record<string, string>): Promise<FastifyInstance> {
  await app?.close();
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'scenario-user' },
      authorization: { assignments: [{ userId: 'scenario-user', role, scope }] },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { specs: { engine } },
  );

  return app;
}

function json<T>(
  response: LightMyRequestResponse,
  status: number,
  valid: (body: unknown) => boolean,
): T {
  expect(response.statusCode, response.body).toBe(status);
  const body = response.json<T>();
  expect(valid(body), response.body).toBe(true);

  return body;
}

const forbidden = (response: LightMyRequestResponse) =>
  json(response, 403, (body) => Value.Check(AuthorizationForbiddenErrorResponseSchema, body));
const sessionError = (response: LightMyRequestResponse, status: number, code: string) =>
  expect(
    json<{ code: string }>(response, status, (body) => Value.Check(SessionErrorSchema, body)).code,
  ).toBe(code);
const workspace = async (runtime: FastifyInstance, specId: string) =>
  json<SpecificationWorkspaceResponse>(
    await runtime.inject(`/api/specs/${specId}/workspace`),
    200,
    (body) => Value.Check(SpecificationWorkspaceResponseSchema, body),
  );
const associationRead = async (runtime: FastifyInstance, sessionId: string) =>
  json<SessionAssociationRead>(
    await runtime.inject(`/api/sessions/${sessionId}/association`),
    200,
    sessionValidators.association,
  );
const page = async (runtime: FastifyInstance, query: string) =>
  json<SessionListPage>(await runtime.inject(`/api/sessions${query}`), 200, sessionValidators.list);
const ids = (body: SessionListPage) => body.items.map((item) => item.sessionId);
function sectionIds(body: SpecificationWorkspaceResponse): string[] {
  const section = body.sections.sessions;
  expect(section.state).toBe('available');

  return section.state === 'available' ? section.data.items.map((item) => item.id) : [];
}

describe('Session association across the Runtime HTTP boundary (project mode)', () => {
  it(
    'starts, lists, scopes, archives and deletes a Session of a Specification',
    async () => {
      // 1. A Specification-scoped developer starts Sessions from S through the composed create.
      let runtime = await as('developer', { specId: specS });
      const start = async (title?: string) => {
        const body = json<CreateContextSessionResult>(
          await runtime.inject({
            method: 'POST',
            url: `/api/specs/${specS}/sessions`,
            payload: {
              requestId: randomUUID(),
              providerId: 'mock',
              mode: 'read-only',
              ...(title ? { title } : {}),
            },
          }),
          201,
          sessionValidators.createContextResult,
        );
        expect(body.association).toEqual({ specId: specS, taskIds: [] });

        return body.sessionId;
      };

      const older = await start();
      const middle = await start();
      const sessionId = await start('Scenario Session');

      // 2. The association read names S as an available current Specification.
      expect(await associationRead(runtime, sessionId)).toEqual({
        sessionId,
        association: {
          kind: 'specification',
          specification: {
            state: 'available',
            value: expect.objectContaining({
              specId: specS,
              title: 'Scenario Specification S',
              collection: 'current',
            }) as unknown,
          },
          tasks: [],
        },
      });

      // 3. The workspace Sessions section lists it, recommends the most recent and offers a start.
      const section = await workspace(runtime, specS);
      expect(section.sections.sessions.state).toBe('available');
      const sessions =
        section.sections.sessions.state === 'available'
          ? section.sections.sessions.data
          : undefined;
      expect(sessions?.items.map((item) => item.id)).toEqual([sessionId, middle, older]);
      expect(sessions?.items[0]).toEqual({
        id: sessionId,
        title: 'Scenario Session',
        taskIds: [],
        status: 'quiet',
        providerId: 'mock',
        providerTitle: 'Controlled mock (test only)',
        updatedAt: expect.any(String) as unknown,
      });
      expect(sessions?.hasMore).not.toBe(true);
      expect(section.recommendedSessionId).toBe(sessionId);
      expect(section.actions.startSession).toEqual({ available: true });

      // 4. The list selects S's Sessions newest first; a short limit pages through the cursor.
      const first = await page(runtime, `?specId=${specS}&limit=2`);
      expect(ids(first)).toEqual([sessionId, middle]);
      expect(first.items[0]?.association).toEqual({
        kind: 'specification',
        specId: specS,
        taskIds: [],
      });
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await page(
        runtime,
        `?specId=${specS}&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      );
      expect(ids(second)).toEqual([older]);
      expect(second.nextCursor).toBeUndefined();
      // Selecting another Specification is a read of it.
      forbidden(await runtime.inject(`/api/sessions?specId=${specT}`));

      // 5. A viewer at S sees it everywhere S's Sessions show, and may not start one.
      runtime = await as('viewer', { specId: specS });
      expect(ids(await page(runtime, `?specId=${specS}`))).toContain(sessionId);
      expect((await associationRead(runtime, sessionId)).association.kind).toBe('specification');
      json(await runtime.inject(`/api/sessions/${sessionId}`), 200, sessionValidators.snapshot);
      const viewed = await workspace(runtime, specS);
      expect(sectionIds(viewed)).toContain(sessionId);
      expect(viewed.actions.startSession).toEqual({ available: false, reason: 'forbidden' });
      sessionError(await runtime.inject('/api/sessions'), 400, 'SESSION_LIST_SCOPE_REQUIRED');

      // 6. A viewer at T: S is forbidden, and S's Session is absent from what T may read.
      runtime = await as('viewer', { specId: specT });
      forbidden(await runtime.inject(`/api/sessions?specId=${specS}`));
      forbidden(await runtime.inject(`/api/sessions/${sessionId}`));
      forbidden(await runtime.inject(`/api/sessions/${sessionId}/association`));
      forbidden(await runtime.inject(`/api/specs/${specS}/workspace`));
      expect(ids(await page(runtime, `?specId=${specT}`))).toEqual([]);
      expect(ids(await page(runtime, '?standalone=true'))).toEqual([]);

      // 7. A viewer granted only this Session sees the row, but S stays restricted.
      runtime = await as('viewer', { sessionId });
      const own = await page(runtime, '');
      expect(own.items.map(({ sessionId: id, association }) => ({ id, association }))).toEqual([
        { id: sessionId, association: { kind: 'restricted' } },
      ]);
      expect(await associationRead(runtime, sessionId)).toEqual({
        sessionId,
        association: { kind: 'specification', specification: { state: 'forbidden' }, tasks: [] },
      });

      // 8. A project viewer sees all of S's Sessions without selecting S.
      runtime = await as('viewer', { projectId });
      expect(ids(await page(runtime, ''))).toEqual([sessionId, middle, older]);

      // 9. Archive hides the Session from the default list and the section, not from the filter.
      runtime = await as('developer', { specId: specS });
      json(
        await runtime.inject({
          method: 'POST',
          url: `/api/sessions/${sessionId}/archive`,
          payload: { requestId: randomUUID() },
        }),
        200,
        sessionValidators.sessionCommandResult,
      );
      expect(ids(await page(runtime, `?specId=${specS}`))).toEqual([middle, older]);
      expect(ids(await page(runtime, `?specId=${specS}&archived=only`))).toEqual([sessionId]);
      expect(ids(await page(runtime, `?specId=${specS}&archived=include`))).toEqual([
        sessionId,
        middle,
        older,
      ]);
      const archived = await workspace(runtime, specS);
      expect(sectionIds(archived)).toEqual([middle, older]);
      expect(archived.recommendedSessionId).toBe(middle);
      // Archived Sessions stay associated.
      expect((await associationRead(runtime, sessionId)).association.kind).toBe('specification');

      // 10. Delete removes the association with the Session.
      const deleted = await runtime.inject({ method: 'DELETE', url: `/api/sessions/${sessionId}` });
      expect(deleted.statusCode, deleted.body).toBe(204);
      sessionError(
        await runtime.inject(`/api/sessions/${sessionId}/association`),
        404,
        'SESSION_NOT_FOUND',
      );
      expect(ids(await page(runtime, `?specId=${specS}&archived=include`))).toEqual([
        middle,
        older,
      ]);
      const after = await workspace(runtime, specS);
      expect(sectionIds(after)).not.toContain(sessionId);
    },
    timeoutMs * 2,
  );
});
