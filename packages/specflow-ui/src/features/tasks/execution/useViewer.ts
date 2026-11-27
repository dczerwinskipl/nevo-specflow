import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from '@tanstack/react-router';

import type { Viewer } from './presentation';

const noSubscription = () => () => undefined;

/**
 * Who is looking, to tell "you" from someone else in recorded actors: the session's user id and,
 * without required authentication, the actor id the CLI records for this machine's user. Empty
 * until authentication is ready, without a session, or outside the application's Router (an isolated
 * component render).
 */
export function useViewer(): Viewer {
  const authStore = useRouter({ warn: false })?.options.context?.services?.authStore;
  const subscribe = useCallback(
    (listener: () => void) => authStore?.subscribe(listener) ?? noSubscription(),
    [authStore],
  );
  const read = useCallback(() => {
    const state = authStore?.getState();

    return state?.status === 'ready' ? state.session : undefined;
  }, [authStore]);
  const session = useSyncExternalStore(subscribe, read, read);

  return useMemo(
    () => ({
      ...(session?.user ? { userId: session.user.id } : {}),
      ...(session?.localActorId ? { localActorId: session.localActorId } : {}),
    }),
    [session],
  );
}
