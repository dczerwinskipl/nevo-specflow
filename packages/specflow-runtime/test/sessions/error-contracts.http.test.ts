import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SessionErrorCodes,
  SessionErrorSchema,
  type SessionErrorCode,
} from '@nevo/specflow-contracts/sessions';
import { RequestParsingErrorResponseSchema } from '@nevo/specflow-contracts/runtime';
import { SessionError } from '../../src/features/sessions';

/** Fastify's codes for a body it cannot read, answered by the Runtime error handling. */
type RequestParsingCode = 'FST_ERR_CTP_INVALID_JSON_BODY' | 'FST_ERR_CTP_INVALID_MEDIA_TYPE';
import { createRuntimeApp } from '../../src/server/app';
import { generateOpenApiDocument, type RuntimeOpenApiDocument } from '../../src/server/openapi';
import { passwordConfig } from '../auth/support/config';

interface DocumentedResponse {
  description: string;
  content?: { 'application/json'?: { schema: { $ref?: string; anyOf?: { $ref?: string }[] } } };
}
type Operations = Record<
  string,
  Record<string, { tags: string[]; responses: Record<string, DocumentedResponse> }>
>;

const SESSION_ERROR_REF = '#/components/schemas/SessionError';
const KNOWN_CODES = new Set<string>(SessionErrorCodes);

/** The `session_error` responses of the document: operation, status and the codes it lists. */
function sessionErrorResponses(document: RuntimeOpenApiDocument) {
  return Object.entries(document.paths as Operations).flatMap(([path, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) =>
      Object.entries(operation.responses).flatMap(([status, response]) => {
        const schema = response.content?.['application/json']?.schema;
        const refs = [schema?.$ref, ...(schema?.anyOf ?? []).map((item) => item.$ref)];
        if (!refs.includes(SESSION_ERROR_REF)) {
          return [];
        }

        const codes = [...response.description.matchAll(/`([A-Z_]+)`/g)]
          .map((match) => match[1]!)
          .filter((code) => KNOWN_CODES.has(code)) as SessionErrorCode[];

        return [{ operation: `${method.toUpperCase()} ${path}`, status: Number(status), codes }];
      }),
    ),
  );
}

let apps: FastifyInstance[] = [];
let directory = '';
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

async function runtime(sessions: boolean) {
  // Trusted local mode without assignments: the local user holds every capability.
  const base = passwordConfig();
  const config = { ...base, authentication: { ...base.authentication, mode: 'none' as const } };
  if (sessions) {
    directory = await mkdtemp(join(tmpdir(), 'nevo-session-errors-'));
  }

  const app = await createRuntimeApp(
    sessions
      ? { ...config, sessions: { enabled: true, providers: { mock: { enabled: true } } } }
      : config,
    sessions ? { sessions: { storage: { directory, projectId: 'project' } } } : {},
  );
  apps.push(app);

  return app;
}

describe('Session error contracts', () => {
  it('answers a documented Session refusal of each status with its documented session_error', async () => {
    const disabled = await runtime(false);
    const enabled = await runtime(true);
    const create = { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' };
    const created = await enabled.inject({ method: 'POST', url: '/api/sessions', payload: create });
    expect(created.statusCode).toBe(201);
    const { sessionId } = created.json<{ sessionId: string }>();
    const huge = { ...create, requestId: randomUUID(), title: 'x'.repeat(300 * 1024) };

    // One representative route per code; together they cover every Session error status. The
    // operation names the documented path; `url` fills its parameters.
    const cases: readonly {
      app: FastifyInstance;
      operation: string;
      url?: string;
      payload?: object | string;
      contentType?: string;
      status: number;
      code: SessionErrorCode | RequestParsingCode;
    }[] = [
      {
        app: disabled,
        operation: 'GET /api/session-providers',
        status: 503,
        code: 'SESSION_DISABLED',
      },
      // The composed create answers its 503 through its response schema (a union of envelopes).
      {
        app: disabled,
        operation: 'POST /api/specs/{specId}/sessions',
        url: '/api/specs/spec-1/sessions',
        payload: create,
        status: 503,
        code: 'SESSION_DISABLED',
      },
      {
        app: enabled,
        operation: 'GET /api/sessions/{sessionId}',
        url: '/api/sessions/not-a-session',
        status: 400,
        code: 'SESSION_INPUT_INVALID',
      },
      {
        app: enabled,
        operation: 'GET /api/sessions/{sessionId}/association',
        url: '/api/sessions/not-a-session/association',
        status: 400,
        code: 'SESSION_INPUT_INVALID',
      },
      {
        app: enabled,
        operation: 'GET /api/sessions/{sessionId}/events',
        url: `/api/sessions/${sessionId}/events?after=999`,
        status: 400,
        code: 'SESSION_CURSOR_INVALID',
      },
      {
        app: enabled,
        operation: 'GET /api/sessions/{sessionId}',
        url: `/api/sessions/${randomUUID()}`,
        status: 404,
        code: 'SESSION_NOT_FOUND',
      },
      {
        app: enabled,
        operation: 'GET /api/sessions/{sessionId}/work/{workId}/actions',
        url: `/api/sessions/${sessionId}/work/${randomUUID()}/actions`,
        status: 404,
        code: 'SESSION_RESOURCE_NOT_FOUND',
      },
      {
        app: enabled,
        operation: 'POST /api/sessions',
        payload: { ...create, title: 'Other input' },
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      },
      {
        app: enabled,
        operation: 'POST /api/sessions',
        payload: huge,
        status: 413,
        code: 'SESSION_PAYLOAD_TOO_LARGE',
      },
      {
        app: enabled,
        operation: 'POST /api/sessions',
        payload: { ...create, requestId: randomUUID(), modelId: 'other' },
        status: 422,
        code: 'MODEL_UNSUPPORTED',
      },
      // A body the framework cannot read is Fastify's error, not a `session_error`.
      {
        app: enabled,
        operation: 'POST /api/sessions',
        payload: '{',
        contentType: 'application/json',
        status: 400,
        code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      },
      {
        app: enabled,
        operation: 'POST /api/sessions/{sessionId}/rename',
        url: `/api/sessions/${sessionId}/rename`,
        payload: '<title/>',
        contentType: 'application/xml',
        status: 415,
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      },
    ];
    const documents = new Map<FastifyInstance, Operations>();
    for (const app of [disabled, enabled]) {
      documents.set(app, (await generateOpenApiDocument(app)).paths as Operations);
    }

    for (const { app, operation, url, payload, contentType, status, code } of cases) {
      const [method, path] = operation.split(' ') as ['GET' | 'POST', string];
      const response = await app.inject({
        method,
        url: url ?? path,
        ...(payload ? { payload } : {}),
        ...(contentType ? { headers: { 'content-type': contentType } } : {}),
      });
      const label = `${operation} ${code}`;
      const body = code.startsWith('FST_') ? RequestParsingErrorResponseSchema : SessionErrorSchema;

      expect(response.statusCode, label).toBe(status);
      expect(Value.Check(body, response.json()), label).toBe(true);
      expect(response.json<{ code: string }>().code, label).toBe(code);
      const documented = documents.get(app)![path]![method.toLowerCase()]!.responses[status];
      expect(documented?.description, label).toContain(`\`${code}\``);
      expect(JSON.stringify(documented?.content), label).toContain(
        `#/components/schemas/${String((body as { $id?: string }).$id)}`,
      );
    }
  });

  it('documents each Session error code under its own status, only where something throws it', async () => {
    const document = await generateOpenApiDocument(await runtime(false));
    const responses = sessionErrorResponses(document);
    // Every Session operation documents its Session refusals.
    const sessionOperations = Object.entries(document.paths as Operations).flatMap(
      ([path, operations]) =>
        Object.entries(operations)
          .filter(([, operation]) => operation.tags[0]!.startsWith('Session'))
          .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(sessionOperations.length).toBeGreaterThan(20);
    for (const operation of sessionOperations) {
      expect(
        responses.some((response) => response.operation === operation),
        operation,
      ).toBe(true);
    }

    // A cheap static check, not a path analysis: each documented code has a throw site somewhere in
    // the Session or Session association code (`new SessionError(`, `new StoreFault(` or `fail(`
    // with the code), or is a code the Session error handling answers for request validation and
    // the body limit. It does not prove that the throw site is on the documenting route's path.
    const root = join(import.meta.dirname, '../../src/features');
    const sources = (
      await Promise.all(
        ['sessions', 'session-associations'].map(async (feature) =>
          Promise.all(
            (await readdir(join(root, feature), { recursive: true }))
              .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
              .map((file) => readFile(join(root, feature, file), 'utf8')),
          ),
        ),
      )
    )
      .flat()
      .join('\n');
    const handling = await readFile(join(root, 'sessions/http/error-handling.ts'), 'utf8');
    for (const { operation, status, codes } of responses) {
      expect(codes.length, `${operation} ${status}`).toBeGreaterThan(0);
      for (const code of codes) {
        expect(new SessionError(code, '').statusCode, `${operation} ${code}`).toBe(status);
        const thrown = new RegExp(
          String.raw`(?:new SessionError|new StoreFault|\bfail)\(\s*'${code}'`,
        );
        const answered = new RegExp(String.raw`code: [^\n]*'${code}'`);
        expect(thrown.test(sources) || answered.test(handling), code).toBe(true);
      }
    }
  });
});
