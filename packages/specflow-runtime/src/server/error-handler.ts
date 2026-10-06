import type { FastifyInstance, RawServerBase } from 'fastify';

import { AuthenticationRequiredError, AuthorizationForbiddenError } from '../features/auth';

export function registerRuntimeErrorHandler<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  app.setErrorHandler((error, _request, reply) => {
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

    throw error;
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
