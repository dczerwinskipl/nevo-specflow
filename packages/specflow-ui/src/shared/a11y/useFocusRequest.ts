import { useEffect, useEffectEvent, useState } from 'react';

/**
 * A one-shot "move focus there after the next render" request. Focus often has to wait for the
 * render the same event causes (a collapsed panel opens, an alert that held focus disappears,
 * refreshed data flags a field), so the event only records the request and the effect carries it
 * out once the DOM is in its new state. Each call is its own request: repeating the same request
 * focuses again. The handler always sees the latest committed render.
 */
export function useFocusRequest<T>(onRequest: (request: T) => void): (request: T) => void {
  const [pending, setPending] = useState<{ readonly request: T } | null>(null);
  const run = useEffectEvent(onRequest);
  useEffect(() => {
    if (pending) run(pending.request);
  }, [pending]);
  return (request) => setPending({ request });
}
