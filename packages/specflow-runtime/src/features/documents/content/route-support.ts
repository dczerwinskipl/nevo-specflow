import type { FastifyReply } from 'fastify';
import { DocumentErrorSchema } from '@nevo/specflow-contracts/documents';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';

import { requireCapability } from '../../auth';
import { documentFailure, type DocumentFailure } from './error-status';

/** Error responses shared by the read routes. 400 is the framework's validation answer. */
export const documentReadErrorResponses = {
  401: AuthenticationRequiredErrorResponseSchema,
  403: AuthorizationForbiddenErrorResponseSchema,
  404: DocumentErrorSchema,
  409: DocumentErrorSchema,
  413: DocumentErrorSchema,
  503: DocumentErrorSchema,
} as const;

/** Error responses of the write routes. 400 stays the framework's validation answer and the document refusals with status 400. */
export const documentWriteErrorResponses = {
  ...documentReadErrorResponses,
  415: DocumentErrorSchema,
  422: DocumentErrorSchema,
} as const;

/** `Retry-After` (whole seconds, at least 1) of a refusal that says when a retry helps. */
function retryAfterSeconds(failure: DocumentFailure): number | undefined {
  const ms = failure.body.details?.retryAfterMs;
  return failure.body.code === 'SPEC_BUSY' && ms !== undefined
    ? Math.max(1, Math.ceil(ms / 1000))
    : undefined;
}

/** Answer a read failure with the `{error, code}` body, or rethrow a defect. */
export function replyWithDocumentFailure<R extends FastifyReply>(error: unknown, reply: R): R {
  const failure = documentFailure(error);
  if (!failure) throw error;
  reply.header('Cache-Control', 'no-store');
  const retryAfter = retryAfterSeconds(failure);
  if (retryAfter !== undefined) reply.header('Retry-After', String(retryAfter));
  // The failure statuses and body are declared by every document route (documentReadErrorResponses);
  // the typed reply only knows the success codes of its own route.
  (reply as FastifyReply).code(failure.status).send(failure.body);
  return reply;
}

/** The `specId` of a route whose params schema has already been validated. */
function specIdOf(params: unknown): string {
  if (typeof params === 'object' && params !== null && 'specId' in params) {
    if (typeof params.specId === 'string') return params.specId;
  }
  throw new Error('The route has no specId parameter.');
}

/** Pre-handler of the document read routes: the View capability on the Specification in the path. */
export function viewGuard() {
  return requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: (request) => ({ specId: specIdOf(request.params) }),
  });
}

/** Pre-handler of the document write routes: the Manage capability on the Specification in the path. */
export function manageGuard() {
  return requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.Manage,
    scope: (request) => ({ specId: specIdOf(request.params) }),
  });
}

/**
 * A document read handler: answers `Cache-Control: no-store` by default (a handler that serves cacheable
 * bytes overrides it) and turns a document failure thrown anywhere in the handler into the stable
 * `{error, code}` answer; any other error is a defect and propagates. The handler keeps the request,
 * reply and result types its route gives it.
 */
export function documentRoute<Request, Reply extends FastifyReply, Result>(
  handler: (request: Request, reply: Reply) => Promise<Result>,
): (request: Request, reply: Reply) => Promise<Result> {
  return async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await handler(request, reply);
    } catch (error) {
      // The reply answers for the route's declared failure responses (documentReadErrorResponses).
      return replyWithDocumentFailure(error, reply) as unknown as Result;
    }
  };
}
