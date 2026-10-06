import {
  AuthorizationResponseError,
  ClientError,
  ResponseBodyError,
  WWWAuthenticateChallengeError,
} from 'openid-client';

export type OidcProviderErrorKind = 'unavailable' | 'authentication';

export interface OidcProviderDiagnostic {
  readonly category:
    | 'discovery'
    | 'authorization_response'
    | 'token_endpoint'
    | 'client_validation'
    | 'network'
    | 'identity_claims';
  readonly code?: string;
  readonly status?: number;
}

export class OidcProviderError extends Error {
  readonly kind: OidcProviderErrorKind;
  readonly diagnostic: OidcProviderDiagnostic;

  constructor(
    kind: OidcProviderErrorKind,
    message: string,
    diagnostic: OidcProviderDiagnostic,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'OidcProviderError';
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

export function classifyOidcDiscoveryError(error: unknown): OidcProviderError | null {
  if (error instanceof TypeError) {
    const code = stringProperty(error, 'code');
    if (isProgrammerArgumentError(code)) return null;
  }

  if (
    error instanceof TypeError ||
    error instanceof ClientError ||
    error instanceof ResponseBodyError ||
    error instanceof WWWAuthenticateChallengeError
  ) {
    return providerError(
      'unavailable',
      'discovery',
      error,
      stringProperty(error, 'code') ?? stringProperty(error, 'error'),
      numberProperty(error, 'status'),
    );
  }

  return null;
}

export function classifyOidcGrantError(error: unknown): OidcProviderError | null {
  if (error instanceof AuthorizationResponseError) {
    return providerError('authentication', 'authorization_response', error);
  }

  if (error instanceof ResponseBodyError) {
    const oauthError = stringProperty(error, 'error');
    const status = numberProperty(error, 'status');
    const kind =
      oauthError === 'invalid_grant' && (status === undefined || status < 500)
        ? 'authentication'
        : 'unavailable';

    return providerError(kind, 'token_endpoint', error, oauthError, status);
  }

  if (error instanceof WWWAuthenticateChallengeError) {
    return providerError('unavailable', 'token_endpoint', error);
  }

  if (error instanceof ClientError) {
    const kind = isAuthenticationValidationCode(error.code) ? 'authentication' : 'unavailable';
    return providerError(kind, 'client_validation', error, error.code);
  }

  if (error instanceof TypeError) {
    const code = stringProperty(error, 'code');
    if (isProgrammerArgumentError(code)) return null;
    return providerError('unavailable', 'network', error, code);
  }

  return null;
}

export function oidcIdentityClaimsError(): OidcProviderError {
  return new OidcProviderError(
    'authentication',
    'OIDC response did not contain a verified email identity.',
    { category: 'identity_claims' },
  );
}

function providerError(
  kind: OidcProviderErrorKind,
  category: OidcProviderDiagnostic['category'],
  cause: unknown,
  code?: string,
  status?: number,
): OidcProviderError {
  return new OidcProviderError(
    kind,
    kind === 'authentication' ? 'OIDC authentication failed.' : 'OIDC provider unavailable.',
    {
      category,
      ...(code ? { code } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    cause,
  );
}

const AUTHENTICATION_VALIDATION_CODES = new Set([
  'OAUTH_INVALID_RESPONSE',
  'OAUTH_JWT_CLAIM_COMPARISON_FAILED',
  'OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED',
  'OAUTH_JWT_TIMESTAMP_CHECK_FAILED',
]);

function isAuthenticationValidationCode(code: string | undefined): boolean {
  return code !== undefined && AUTHENTICATION_VALIDATION_CODES.has(code);
}

function isProgrammerArgumentError(code: string | undefined): boolean {
  return code === 'ERR_INVALID_ARG_TYPE' || code === 'ERR_INVALID_ARG_VALUE';
}

function stringProperty(value: object, key: string): string | undefined {
  const candidate: unknown = Reflect.get(value, key);
  return typeof candidate === 'string' ? candidate : undefined;
}

function numberProperty(value: object, key: string): number | undefined {
  const candidate: unknown = Reflect.get(value, key);
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}
