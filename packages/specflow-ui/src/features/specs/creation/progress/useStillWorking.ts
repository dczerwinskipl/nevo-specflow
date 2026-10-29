import { useEffect, useState } from 'react';

/** After this long without an end the page says it is still working (calm, never an alarm). */
export const stillWorkingAfterMs = 20_000;

/**
 * True once `active` has lasted `afterMs`. Display only: it changes one line of text, and resets
 * when the work stops.
 */
export function useStillWorking(active: boolean, afterMs: number = stillWorkingAfterMs): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setTimeout(() => setElapsed(true), afterMs);

    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, afterMs]);

  return active && elapsed;
}
