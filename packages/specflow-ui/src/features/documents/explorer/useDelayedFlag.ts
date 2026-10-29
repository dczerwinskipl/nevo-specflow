import { useEffect, useState } from 'react';

/** How long an operation runs before the tree shows that it is working. */
export const BUSY_INDICATOR_DELAY_MS = 400;

/**
 * `value` once it has stayed true for `delayMs`; false again as soon as it is false. Quick
 * operations therefore never flash an indicator. The timer is the external system synchronised.
 */
export function useDelayedFlag(value: boolean, delayMs = BUSY_INDICATOR_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [value, delayMs]);
  return value && shown;
}
