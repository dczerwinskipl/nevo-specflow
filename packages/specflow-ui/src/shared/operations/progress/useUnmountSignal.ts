import { useEffect, useRef, useState } from 'react';

/**
 * An `AbortSignal` that aborts when the owner really unmounts. An operation outlives its screen
 * (the request is never cancelled, the server finishes it), so the owner only stops WATCHING when
 * this signal aborts. StrictMode unmounts and remounts at once; a real unmount is the one still
 * unmounted after the current task, so the abort is deferred by one task.
 */
export function useUnmountSignal(): AbortSignal {
  const [controller] = useState(() => new AbortController());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) {
          controller.abort();
        }
      }, 0);
    };
  }, [controller]);

  return controller.signal;
}
