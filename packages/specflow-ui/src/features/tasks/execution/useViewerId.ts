import { useCallback, useSyncExternalStore } from 'react';
import { useRouter } from '@tanstack/react-router';

const noSubscription = () => () => undefined;

/**
 * The signed-in person's user id, to tell "you" from someone else in recorded actors; `undefined`
 * until authentication is ready, without a user, or outside the application's Router (an isolated
 * component render).
 */
export function useViewerId(): string | undefined {
  const authStore = useRouter({ warn: false })?.options.context.services?.authStore;
  const subscribe = useCallback(
    (listener: () => void) => authStore?.subscribe(listener) ?? noSubscription(),
    [authStore],
  );
  const read = useCallback(() => {
    const state = authStore?.getState();

    return state?.status === 'ready' ? state.session.user?.id : undefined;
  }, [authStore]);

  return useSyncExternalStore(subscribe, read, read);
}
