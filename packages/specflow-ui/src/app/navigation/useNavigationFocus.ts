import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useAppNavigation } from '@nevo/ui';

/**
 * Route commits dismiss an open Drawer. Query changes retain the user's focus. A destination
 * with an in-page `#hash` section (e.g. Tasks) restores focus to that section instead of the
 * page title, so the Drawer close does not undo the section focus at narrow widths.
 */
export function useNavigationFocus() {
  const router = useRouter();
  const { closeNavigation, navigationOpen } = useAppNavigation();
  useEffect(
    () =>
      router.subscribe('onResolved', ({ pathChanged, hashChanged }) => {
        if (!navigationOpen) return;
        const hash = router.state.location.hash;
        closeNavigation(
          hash && (pathChanged || hashChanged)
            ? () => {
                const section = document.getElementById(hash);
                section?.scrollIntoView({ block: 'start' });
                return (
                  section ??
                  document.querySelector<HTMLElement>('[data-workspace-active="true"] h1')
                );
              }
            : pathChanged
              ? () => document.querySelector<HTMLElement>('[data-workspace-active="true"] h1')
              : undefined,
        );
      }),
    [router, closeNavigation, navigationOpen],
  );
}
