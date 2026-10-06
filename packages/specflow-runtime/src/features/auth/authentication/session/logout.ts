import type { AuthenticationStore } from '../store';

export function logout(
  store: AuthenticationStore,
  sessionId: string | undefined,
  oidcTransactionId: string | undefined,
): void {
  store.deleteSession(sessionId);
  store.deleteOidcTransaction(oidcTransactionId);
}
