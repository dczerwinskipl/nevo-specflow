import type { FastifyInstance, RawServerBase } from 'fastify';
import { SessionError } from '../errors';

/**
 * The Session error envelope (`session_error`) and the no-store default of an encapsulated Session
 * route context, shared by the Session routes and the Session association routes.
 */
export function registerSessionErrorHandling<RawServer extends RawServerBase>(
  feature: FastifyInstance<RawServer>,
): void {
  // The validation failures of these routes are `SESSION_INPUT_INVALID`, documented per route: the
  // OpenAPI document does not add Fastify's validation `400` to them.
  feature.addHook('onRoute', (route) => {
    route.config = { ...route.config, openApiOwnValidation: true };
  });
  feature.setErrorHandler((error, _request, reply) => {
    if (error instanceof SessionError) {
      return reply
        .header('Cache-Control', 'no-store')
        .code(error.statusCode)
        .send({
          error: 'session_error',
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      ('validation' in error || ('code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'))
    ) {
      const tooLarge = 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE';

      return reply
        .header('Cache-Control', 'no-store')
        .code(tooLarge ? 413 : 400)
        .send({
          error: 'session_error',
          code: tooLarge ? 'SESSION_PAYLOAD_TOO_LARGE' : 'SESSION_INPUT_INVALID',
          message: tooLarge ? 'Request exceeds byte budget.' : 'Invalid Session request.',
        });
    }

    throw error;
  });
  feature.addHook('onSend', (_request, reply, _payload, done) => {
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store');
    }

    done();
  });
}
