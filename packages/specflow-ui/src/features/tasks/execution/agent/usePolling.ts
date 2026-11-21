import { useEffect, useRef } from 'react';

/** How often the Now block reads an attempt that changes without the owner (seconds, not minutes). */
export const POLL_MS = 4000;

/**
 * Runs `tick` every few seconds while `active`, only while the page is visible (a hidden tab does
 * not poll), and stops as soon as `active` is false.
 */
export function usePolling(active: boolean, tick: () => unknown, intervalMs = POLL_MS) {
  const latest = useRef(tick);
  latest.current = tick;
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void latest.current();
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
}
