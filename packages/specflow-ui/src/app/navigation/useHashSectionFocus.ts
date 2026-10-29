import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';

/** Scroll an in-page section into view and move focus to it. Returns the target, if any. */
export function focusHashSection(hash: string) {
  const target = document.getElementById(hash);
  if (!target) {
    return null;
  }

  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });

  return target;
}

/**
 * Some navigation destinations (e.g. Tasks) are an in-page section of an existing route rather
 * than a standalone page, identified by a `#hash` anchor. After the router resolves such a
 * navigation, scroll that section into view and move focus to it so keyboard/touch users land on
 * the real content instead of only the top of the route.
 */
export function useHashSectionFocus() {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe('onResolved', ({ hashChanged }) => {
        const hash = router.state.location.hash;
        if (!hashChanged || !hash) {
          return;
        }

        requestAnimationFrame(() => focusHashSection(hash));
      }),
    [router],
  );
}
