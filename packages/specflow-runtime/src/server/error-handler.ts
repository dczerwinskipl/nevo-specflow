import type { FastifyInstance, RawServerBase } from 'fastify';

import { AuthenticationRequiredError, AuthorizationForbiddenError } from '../features/auth';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * A route that answers a body above its own `bodyLimit` with this `{error, code}` (413) instead of the
     * framework's error. Opt-in per route: every other route keeps the framework's answer.
     */
    oversizedBodyCode?: 'DOCUMENT_TOO_LARGE';
  }
}

/** Stable code of the generic body answered for every unexpected (non-typed) failure. */
export const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

export function registerRuntimeErrorHandler<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthenticationRequiredError) {
      reply.header('Cache-Control', 'no-store');
      return reply.code(401).send({ error: 'authentication_required' });
    }

    if (error instanceof AuthorizationForbiddenError) {
      reply.header('Cache-Control', 'no-store');
      return reply.code(403).send({ error: 'forbidden' });
    }

    // A body above the limit of a route that opted in: its own `{error, code}` body.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' &&
      request.routeOptions.config.oversizedBodyCode !== undefined
    ) {
      const code = request.routeOptions.config.oversizedBodyCode;
      reply.header('Cache-Control', 'no-store');
      return reply.code(413).send({ error: code, code });
    }

    // A Create body above its route limit: the same `{error, code}` body as every other Create refusal.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' &&
      request.routeOptions.url === '/api/specs'
    ) {
      reply.header('Cache-Control', 'no-store');
      return reply.code(413).send({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
    }

    const statusCode = httpStatusCode(error);
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(error);
    }

    // Anything else is unexpected (for example a Node filesystem error): log the cause on the
    // server and answer a generic body. Never send the message, paths or stack to the client.
    request.log.error({ err: error }, 'Unhandled Runtime error');
    reply.header('Cache-Control', 'no-store');
    return reply.code(500).send({ error: INTERNAL_ERROR_CODE, code: INTERNAL_ERROR_CODE });
  });
}

function httpStatusCode(error: unknown): number | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('statusCode' in error) ||
    typeof error.statusCode !== 'number'
  ) {
    return undefined;
  }

  return error.statusCode;
}
