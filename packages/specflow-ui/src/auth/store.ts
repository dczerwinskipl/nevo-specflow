import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';

import type { AuthApi } from './api';

export type AuthStoreState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponse }
  | { readonly status: 'error'; readonly error: unknown };

export interface AuthStore {
  getState(): AuthStoreState;
  subscribe(listener: () => void): () => void;
  ensureSession(): Promise<AuthSessionResponse>;
  refresh(): Promise<AuthSessionResponse>;
  loginWithPassword(username: string, password: string): Promise<AuthSessionResponse>;
  startOidc(providerId: string, returnTo: string): Promise<string>;
  logout(): Promise<void>;
}

export function createAuthStore(api: AuthApi, initialSession?: AuthSessionResponse): AuthStore {
  let state: AuthStoreState = initialSession
    ? { status: 'ready', session: initialSession }
    : { status: 'idle' };
  let pending: Promise<AuthSessionResponse> | undefined;
  const listeners = new Set<() => void>();

  const setState = (next: AuthStoreState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const load = (force: boolean): Promise<AuthSessionResponse> => {
    if (!force && state.status === 'ready') return Promise.resolve(state.session);
    if (!force && pending) return pending;

    setState({ status: 'loading' });
    const request = api
      .getSession()
      .then((session) => {
        setState({ status: 'ready', session });
        return session;
      })
      .catch((error: unknown) => {
        setState({ status: 'error', error });
        throw error;
      })
      .finally(() => {
        if (pending === request) pending = undefined;
      });
    pending = request;
    return request;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ensureSession: () => load(false),
    refresh: () => load(true),
    async loginWithPassword(username, password) {
      const session = await api.loginWithPassword({ username, password });
      setState({ status: 'ready', session });
      return session;
    },
    async startOidc(providerId, returnTo) {
      const result = await api.startOidc(providerId, returnTo);
      return result.authorizationUrl;
    },
    async logout() {
      await api.logout();
      await load(true);
    },
  };
}
