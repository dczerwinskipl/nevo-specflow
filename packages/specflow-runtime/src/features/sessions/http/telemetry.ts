import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import {
  SessionCapabilities,
  SessionIdSchema,
  TelemetrySnapshotSchema,
  RefreshTelemetrySchema,
  RefreshTelemetryReceiptSchema,
  validateTelemetrySnapshot,
  type RefreshTelemetry,
  type TelemetrySnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import { TelemetryRateLimited } from '../lifecycle/telemetry';
import { SessionError } from '../errors';
import { authorizeSession } from './authorization';

const accessKey = randomBytes(32);
type Scope = Record<'projectId' | 'sessionId', string>;

/** An opaque cache/access generation, never a capability or an authorization grant. */
export function telemetryAccess(request: FastifyRequest, scope: Scope) {
  const permissions = request.authz.resolveCapabilities({ resource: SessionCapabilities, scope });
  const accessRevision = createHmac('sha256', accessKey)
    .update(JSON.stringify([request.authz.readContext().subject, scope, permissions]))
    .digest('base64url');

  return { permissions, accessRevision };
}

export function projectTelemetry(
  input: Omit<TelemetrySnapshot, 'accessRevision'>,
  access: ReturnType<typeof telemetryAccess>,
): TelemetrySnapshot {
  const result = { ...input, accessRevision: access.accessRevision };
  if (!access.permissions['view-provider-limits']) {
    result.limits = {
      status: 'unavailable',
      freshness: 'unknown',
      reason: 'NOT_AUTHORIZED',
      refreshable: false,
    };
    result.refresh = {
      ...result.refresh,
      groups: result.refresh.groups.filter((group) => group !== 'limits'),
    };
    if (!result.refresh.groups.length) {
      result.refresh = { state: 'idle', groups: [] };
    }
  }

  if (!access.permissions.manage) {
    result.limits = { ...result.limits, refreshable: false };
    result.context = { ...result.context, refreshable: false };
  }

  return result;
}

export function registerTelemetryRoutes(
  feature: FastifyInstance,
  coordinator: () => SessionCoordinator,
) {
  const params = Type.Object({ sessionId: SessionIdSchema }, { additionalProperties: false });
  const sid = (request: FastifyRequest) => (request.params as { sessionId: string }).sessionId;
  async function access(request: FastifyRequest) {
    const scope = await coordinator().store.call<Scope>({
      op: 'identity',
      sessionId: sid(request),
    });

    return telemetryAccess(request, scope);
  }

  feature.get(
    '/api/sessions/:sessionId/telemetry',
    {
      preHandler: (request) => authorizeSession(request, coordinator(), sid(request)),
      schema: { params, response: { 200: TelemetrySnapshotSchema, 304: Type.Null() } },
    },
    async (request, reply) => {
      const value = projectTelemetry(
        await coordinator().telemetry.snapshot(sid(request)),
        await access(request),
      );
      if (!validateTelemetrySnapshot(value)) {
        throw new SessionError(
          'SESSION_STORE_UNAVAILABLE',
          'Telemetry projection violates its bounded contract.',
        );
      }

      const etag =
        '"' + createHash('sha256').update(JSON.stringify(value)).digest('base64url') + '"';
      reply.header('Cache-Control', 'private, no-cache').header('ETag', etag);
      const supplied = request.headers['if-none-match'];
      if (
        typeof supplied === 'string' &&
        supplied.split(',').some((item) => item.trim() === etag || item.trim() === '*')
      ) {
        return reply.code(304).send();
      }

      return value;
    },
  );
  feature.post(
    '/api/sessions/:sessionId/telemetry/refresh',
    {
      bodyLimit: 4096,
      preHandler: async (request) => {
        await authorizeSession(request, coordinator(), sid(request));
        await authorizeSession(request, coordinator(), sid(request), true);
        if ((request.body as RefreshTelemetry).groups.includes('limits')) {
          const scope = await coordinator().store.call<Scope>({
            op: 'identity',
            sessionId: sid(request),
          });
          request.authz.require({
            resource: SessionCapabilities,
            capability: SessionCapabilities.capabilities.ViewProviderLimits,
            scope,
          });
        }
      },
      schema: {
        params,
        body: RefreshTelemetrySchema,
        response: {
          202: RefreshTelemetryReceiptSchema,
          429: Type.Object(
            { error: Type.Literal('rate_limited') },
            { additionalProperties: false },
          ),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await coordinator().telemetry.refresh(
          sid(request),
          request.authz.readContext().subject,
          request.body as RefreshTelemetry,
        );

        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof TelemetryRateLimited) {
          return reply
            .header('Retry-After', error.retryAfterSeconds)
            .code(429)
            .send({ error: 'rate_limited' });
        }

        throw error;
      }
    },
  );
}
