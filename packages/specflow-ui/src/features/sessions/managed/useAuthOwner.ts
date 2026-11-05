import { useCallback, useSyncExternalStore } from 'react';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';

/**
 * The signed-in identity the managed Sessions belong to (what retained requests, queries and the
 * start handoff are keyed by); `undefined` until the authentication is ready.
 */
export function useAuthOwner(): string | undefined {
  const { authStore } = useAppServices();
  const subscribe = useCallback(
    (listener: () => void) => authStore.subscribe(listener),
    [authStore],
  );
  const read = useCallback(() => authStore.getState(), [authStore]);
  const auth = useSyncExternalStore(subscribe, read, read);

  return auth.status === 'ready' ? authSessionIdentity(auth.session) : undefined;
}
