import {
  createHttpClient,
  isHttpClientError,
  type HttpClient,
} from '@nevo/http-client';
import type {
  AuthSessionResponse,
  OidcStartSuccessResponse,
  PasswordLoginRequest,
} from '@nevo/specflow-contracts/authentication';

export interface AuthApi {
  getSession(): Promise<AuthSessionResponse>;
  loginWithPassword(request: PasswordLoginRequest): Promise<AuthSessionResponse>;
  startOidc(providerId: string, returnTo: string): Promise<OidcStartSuccessResponse>;
  logout(): Promise<void>;
}

export function createBrowserAuthApi(client: HttpClient = createHttpClient()): AuthApi {
  return {
    getSession: () => client.get<AuthSessionResponse>('/api/auth/session'),
    loginWithPassword: (request) =>
      client.post<AuthSessionResponse, PasswordLoginRequest>(
        '/api/auth/password/login',
        request,
      ),
    startOidc: (providerId, returnTo) =>
      client.post<OidcStartSuccessResponse, { returnTo: string }>(
        `/api/auth/oidc/${encodeURIComponent(providerId)}/start`,
        { returnTo },
      ),
    async logout() {
      await client.post<void>('/api/auth/logout');
    },
  };
}

export function authErrorCode(error: unknown): string | undefined {
  if (!isHttpClientError(error) || !isErrorPayload(error.data)) return undefined;
  return error.data.error;
}

function isErrorPayload(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}
