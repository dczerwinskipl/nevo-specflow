import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthStore } from '../auth/store';

/**
 * AuthStore controls bootstrap, while TanStack Query owns feature data.
 * Purge feature cache when the authenticated identity changes or session
 * refresh leaves the authenticated state.
 */
export function AuthQueryCacheBoundary({
  auth,
  children,
}: {
  readonly auth: AuthStore;
  readonly children: ReactNode;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let previousIdentity: string | undefined;
    let hadReadySession = false;
    const sync = () => {
      const state = auth.getState();
      if (state.status === 'ready') {
        const identity = state.session.user?.id ?? 'anonymous';
        if (hadReadySession && previousIdentity !== identity) {
          queryClient.clear();
        }
        previousIdentity = identity;
        hadReadySession = true;
      } else if (hadReadySession) {
        queryClient.clear();
        hadReadySession = false;
      }
    };
    sync();
    return auth.subscribe(sync);
  }, [auth, queryClient]);

  return <>{children}</>;
}
