import { useEffect, useState } from 'react';
import {
  searchDelayedAfterMs,
  searchPreparingAfterMs,
  type SearchWaitingStage,
} from './searchStatusModel';

/**
 * How long the search has waited for the answer to `request` (anything that identifies it: the
 * workspace, the text, the filter). A new `request` restarts the timeline, so typing more starts it
 * again; `quiet` whenever nothing is awaited. The timers are the external system synchronised.
 */
export function useSearchWaiting(waiting: boolean, request: string): SearchWaitingStage {
  const [stage, setStage] = useState<{ request: string; stage: SearchWaitingStage }>();

  useEffect(() => {
    if (!waiting) {
      return;
    }

    const delayed = setTimeout(() => setStage({ request, stage: 'delayed' }), searchDelayedAfterMs);
    const preparing = setTimeout(
      () => setStage({ request, stage: 'preparing' }),
      searchPreparingAfterMs,
    );

    return () => {
      clearTimeout(delayed);
      clearTimeout(preparing);
      setStage(undefined);
    };
  }, [waiting, request]);

  return waiting && stage?.request === request ? stage.stage : 'quiet';
}
