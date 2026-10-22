import { createHash } from 'node:crypto';

import {
  OPERATION_LIST_ALL_STATUSES,
  OPERATION_LIST_DEFAULT_LIMIT,
  OPERATION_LIST_MAX_LIMIT,
  OperationListResponseSchema,
  type OperationListResponse,
  type OperationSummary,
} from '@nevo/specflow-contracts/operations';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import type { FastifyInstance, FastifyRequest, RawServerBase } from 'fastify';

import type { RequestAuthorization } from '../auth';
import { buildOperationList, type OperationListConfig } from './list-service';
import type { OperationListSource } from './operation-source';
import type { OperationProgressRegistry } from './progress-registry';

export const OPERATIONS_UNAVAILABLE_CODE = 'OPERATIONS_UNAVAILABLE';
export const OPERATION_LIST_QUERY_INVALID_CODE = 'OPERATION_LIST_QUERY_INVALID';

/**
 * Wire form of `OperationListQuery`: the Runtime does not coerce query types, so `limit` arrives
 * as digits and is range checked here (1..50, default 20). `status` is validated against the
 * known statuses.
 */
export const OperationListQueryStringSchema = Type.Object(
  {
    status: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    limit: Type.Optional(Type.String({ pattern: '^[0-9]{1,3}$' })),
  },
  { additionalProperties: false },
);

const OperationListErrorSchema = Type.Object(
  { error: Type.String(), code: Type.String() },
  { additionalProperties: false },
);

export interface OperationListRoute {
  /** Route path owned by the consuming feature (for example `/api/specs/operations`). */
  readonly path: string;
  /** The feature kinds. `undefined` = the backing source is unavailable (answers 503). */
  readonly sources: readonly OperationListSource[] | undefined;
  readonly registry: OperationProgressRegistry;
  /** Coarse gate (authentication and a feature capability); throws an auth error. */
  authorize(request: FastifyRequest): void | Promise<void>;
  /**
   * Per-row admission by the feature own capability. Rows are the already serialised summaries:
   * a row without `subject.specId` (an unreadable journal, an operation not yet reserved) is the
   * feature decision too.
   */
  canView(authorization: RequestAuthorization, row: OperationSummary): boolean;
  readonly config?: Partial<OperationListConfig>;
  /** Test seam. */
  readonly now?: () => Date;
}

/**
 * Registers `GET <path>`: the read-only operation list of one feature (its kinds only). Routing,
 * coarse authorization and the per-row capability belong to the owning feature; the merge of the
 * persisted rows with the live registry, the status table, retention, counts, ordering, ETag and
 * strict serialisation are this shared mechanism. A new feature adds one call with its sources.
 */
export function registerOperationListRoute<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  route: OperationListRoute,
): void {
  const now = route.now ?? (() => new Date());
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    route.path,
    {
      preHandler: async (request) => {
        // The Runtime serves HTTP/1 only; the generic RawServer is just the caller app type.
        await route.authorize(request as unknown as FastifyRequest);
      },
      schema: {
        querystring: OperationListQueryStringSchema,
        response: {
          200: OperationListResponseSchema,
          400: OperationListErrorSchema,
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
          503: OperationListErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const query = parseOperationListQuery(request.query);
      if (!query) {
        return reply.code(400).send({
          error: OPERATION_LIST_QUERY_INVALID_CODE,
          code: OPERATION_LIST_QUERY_INVALID_CODE,
        });
      }
      const { statuses, limit } = query;
      if (!route.sources) {
        return reply
          .code(503)
          .send({ error: OPERATIONS_UNAVAILABLE_CODE, code: OPERATIONS_UNAVAILABLE_CODE });
      }
      const authorization = (request as unknown as FastifyRequest).authz;
      let list;
      try {
        list = await buildOperationList({
          sources: route.sources,
          registry: route.registry,
          now: now(),
          ...(route.config ? { config: route.config } : {}),
          admit: (row) => route.canView(authorization, row),
          ...(statuses ? { statuses } : {}),
          limit,
        });
      } catch (error) {
        // Never surface raw errors (paths, Git text): log here, answer with the stable code.
        request.log.error({ err: error }, 'Operation list failed');
        return reply
          .code(503)
          .send({ error: OPERATIONS_UNAVAILABLE_CODE, code: OPERATIONS_UNAVAILABLE_CODE });
      }

      // The weak validator ignores `generatedAt`, so an unchanged list answers 304 on every poll.
      const etag = operationListEtag(list);
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        // A 304 has no body and no response schema; the typed reply only knows the declared codes.
        return reply.code(304 as unknown as 200).send(undefined as never);
      }
      return reply.code(200).send(list);
    },
  );
}

/** Wire query of the list routes -> decoded filter and limit; undefined = invalid (answer 400). */
export function parseOperationListQuery(query: {
  readonly status?: string | undefined;
  readonly limit?: string | undefined;
}): { readonly statuses?: ReadonlySet<string>; readonly limit: number } | undefined {
  const statuses = parseStatuses(query.status);
  const limit = query.limit === undefined ? OPERATION_LIST_DEFAULT_LIMIT : Number(query.limit);
  if (statuses === 'invalid' || !(limit >= 1 && limit <= OPERATION_LIST_MAX_LIMIT))
    return undefined;
  return { ...(statuses ? { statuses } : {}), limit };
}

function parseStatuses(raw: string | undefined): ReadonlySet<string> | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const known: readonly string[] = OPERATION_LIST_ALL_STATUSES;
  if (values.length === 0 || values.some((value) => !known.includes(value))) return 'invalid';
  return new Set(values);
}

/** Weak validator over the content only: `generatedAt` is ignored so an unchanged list stays 304. */
export function operationListEtag(list: OperationListResponse): string {
  return (
    'W/"' +
    createHash('sha1')
      .update(JSON.stringify([list.items, list.counts, list.truncated]))
      .digest('base64url') +
    '"'
  );
}

export function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return false;
  if (value.trim() === '*') return true;
  const weak = (tag: string) => tag.trim().replace(/^W\//, '');
  return value.split(',').some((candidate) => weak(candidate) === weak(etag));
}
