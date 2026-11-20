import type { FastifyInstance, RawServerBase } from 'fastify';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Why this non-GET `/api` route answers without an owner credential (D21): only login, logout
     * and the pairing request and redeem routes, which never perform an owner operation.
     */
    readonly ownerCredentialExempt?: string;
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OwnerCredentialRoute {
  readonly method: string;
  /** The matched route's URL pattern; absent when no route matched (a `404`). */
  readonly url: string | undefined;
  readonly config?: { readonly ownerCredentialExempt?: string };
}

/**
 * Owner routes (D21, decision 6): every non-GET `/api` route, except the routes that declare
 * `ownerCredentialExempt`. Reads keep their own authorization.
 */
export function requiresOwnerCredential(route: OwnerCredentialRoute): boolean {
  if (!route.url?.startsWith('/api/')) {
    return false;
  }

  if (READ_METHODS.has(route.method.toUpperCase())) {
    return false;
  }

  return route.config?.ownerCredentialExempt === undefined;
}

/**
 * Whether the request carries an owner credential: `present`, or the refusal it gets: no
 * authenticated session under required authentication (`401`), no paired device's credential in
 * trusted local mode (`403`).
 */
export type OwnerCredentialCheck = (
  cookies: Readonly<Record<string, string | undefined>>,
) => 'present' | 'authentication-required' | 'owner-credential-required';

/**
 * The one cross-cutting owner-credential check, before any route handler, body parsing or
 * validation. The refusal is written as JSON text so no route response schema reshapes it.
 */
export function registerOwnerCredentialGuard<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  check: OwnerCredentialCheck,
): void {
  app.addHook('onRequest', (request, reply, done) => {
    if (
      !requiresOwnerCredential({
        method: request.method,
        url: request.routeOptions.url,
        config: request.routeOptions.config,
      })
    ) {
      done();

      return;
    }

    const result = check(request.cookies);
    if (result === 'present') {
      done();

      return;
    }

    reply
      .code(result === 'authentication-required' ? 401 : 403)
      .header('Cache-Control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(
        JSON.stringify({
          error:
            result === 'authentication-required'
              ? 'authentication_required'
              : 'owner_credential_required',
        }),
      );
  });
}
