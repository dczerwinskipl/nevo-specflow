import type { FastifyInstance, RawServerBase } from 'fastify';

import { OWNER_REQUEST_HEADER } from '@nevo/specflow-contracts/authentication';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Why this non-GET `/api` route answers without an owner credential (D21): only login, logout
     * and the pairing request and redeem routes, which never perform an owner operation.
     */
    readonly ownerCredentialExempt?: string;
    /** A read that only an owner may make (the paired device list). */
    readonly ownerCredentialRequired?: true;
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OwnerCredentialRoute {
  readonly method: string;
  /** The matched route's URL pattern; absent when no route matched (a `404`). */
  readonly url: string | undefined;
  readonly config?: {
    readonly ownerCredentialExempt?: string;
    readonly ownerCredentialRequired?: true;
  };
}

/**
 * Owner routes (D21, decision 6): every non-GET `/api` route, except the routes that declare
 * `ownerCredentialExempt`, and the reads that declare `ownerCredentialRequired`. Other reads keep
 * their own authorization.
 */
export function requiresOwnerCredential(route: OwnerCredentialRoute): boolean {
  if (!route.url?.startsWith('/api/')) {
    return false;
  }

  if (route.config?.ownerCredentialRequired) {
    return true;
  }

  if (READ_METHODS.has(route.method.toUpperCase())) {
    return false;
  }

  return route.config?.ownerCredentialExempt === undefined;
}

export interface OwnerRequestFacts {
  readonly origin: string | undefined;
  readonly fetchSite: string | undefined;
  readonly ownerHeader: string | undefined;
  /** The origins this Runtime is reached at: the request's own and the configured public one. */
  readonly runtimeOrigins: readonly string[];
}

/**
 * An owner request must come from a page of this Runtime, never from another origin, even a
 * same-site one (another port of `localhost`): `Sec-Fetch-Site`, when sent, is `same-origin` or
 * `none`; `Origin`, when sent, is the Runtime's; and the `X-Nevo-Owner` header is present, which a
 * page of another origin can only send after a CORS preflight that the Runtime never grants.
 */
export function isSameOriginOwnerRequest(facts: OwnerRequestFacts): boolean {
  if (facts.ownerHeader !== '1') {
    return false;
  }

  if (
    facts.fetchSite !== undefined &&
    facts.fetchSite !== 'same-origin' &&
    facts.fetchSite !== 'none'
  ) {
    return false;
  }

  return facts.origin === undefined || facts.runtimeOrigins.includes(facts.origin);
}

/**
 * Whether the request carries an owner credential: `present`, or the refusal it gets: no
 * authenticated session under required authentication (`401`), no paired device's credential in
 * trusted local mode (`403`).
 */
export type OwnerCredentialCheck = (
  cookies: Readonly<Record<string, string | undefined>>,
) => 'present' | 'authentication-required' | 'owner-credential-required';

export interface OwnerCredentialGuardOptions {
  readonly check: OwnerCredentialCheck;
  /** The configured public origin of the Runtime, if any. */
  readonly publicOrigin?: string;
}

/**
 * The one cross-cutting owner-credential check, before any route handler, body parsing or
 * validation: the request must carry the credential and be a same-origin owner request.
 * The refusal is written as JSON text so no route response schema reshapes it.
 */
export function registerOwnerCredentialGuard<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: OwnerCredentialGuardOptions,
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

    const refusal =
      refusalOf(options.check(request.cookies)) ??
      (isSameOriginOwnerRequest(requestFacts(request, options.publicOrigin))
        ? undefined
        : { status: 403, error: 'owner_request_refused' });
    if (!refusal) {
      done();

      return;
    }

    reply
      .code(refusal.status)
      .header('Cache-Control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify({ error: refusal.error }));
  });
}

function refusalOf(
  result: ReturnType<OwnerCredentialCheck>,
): { status: number; error: string } | undefined {
  switch (result) {
    case 'present':
      return undefined;
    case 'authentication-required':
      return { status: 401, error: 'authentication_required' };
    case 'owner-credential-required':
      return { status: 403, error: 'owner_credential_required' };
  }
}

interface RequestShape {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly protocol: string;
  readonly host: string;
}

function requestFacts(request: RequestShape, publicOrigin: string | undefined): OwnerRequestFacts {
  return {
    origin: single(request.headers.origin),
    fetchSite: single(request.headers['sec-fetch-site']),
    ownerHeader: single(request.headers[OWNER_REQUEST_HEADER]),
    runtimeOrigins: [
      `${request.protocol}://${request.host}`,
      ...(publicOrigin ? [new URL(publicOrigin).origin] : []),
    ],
  };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
