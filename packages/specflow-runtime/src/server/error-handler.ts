import type { FastifyInstance, RawServerBase } from 'fastify';

import { AuthenticationRequiredError, AuthorizationForbiddenError } from '../features/auth';

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
