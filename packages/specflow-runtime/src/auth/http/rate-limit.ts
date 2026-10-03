import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export const PASSWORD_SOURCE_ATTEMPT_LIMIT = 10;
export const PASSWORD_SOURCE_WINDOW_MS = 60 * 1000;
export const OIDC_START_SOURCE_ATTEMPT_LIMIT = 10;
export const OIDC_START_SOURCE_WINDOW_MS = 60 * 1000;

export async function registerAuthRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    ipv6Subnet: 64,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }),
  });
}
