import { useEffect, useReducer } from 'react';

import type { OperationsApi } from '../operationsApi';
import {
  initialOperationProgress,
  operationProgressReducer,
  visibleProgressSteps,
  type OperationProgressState,
  type OperationStepView,
} from './progressState';

export interface UseOperationProgressOptions {
  /** The progress port (from the app services; `shared` never reaches into the composition root). */
  readonly api: OperationsApi;
  /** Stream of the running operation, built by the feature's API port; none means nothing to watch. */
  readonly streamUrl: string | undefined;
  /** Watch only while the operation is running (the owner of the operation decides). */
  readonly enabled: boolean;
}

export interface OperationProgressView {
  /** The checklist to draw: empty until the first snapshot; skipped steps are omitted. */
  readonly steps: readonly OperationStepView[];
  readonly outcome: OperationProgressState['outcome'];
  /** Stable code the stream reported with a `failed` event; best effort, never the final word. */
  readonly failureCode: string | undefined;
  /** False once the stream failed before saying anything: the caller shows no checklist. */
  readonly available: boolean;
  /**
   * The stream failed, dropped or ended without a terminal event (after the SSE client's own
   * reconnects): the owner should rely on its own monitoring. Cleared when events flow again.
   */
  readonly lost: boolean;
}

type Action =
  | { type: 'event'; event: Parameters<typeof operationProgressReducer>[1] }
  | { type: 'reset' }
  | { type: 'unavailable' }
  | { type: 'lost' };
interface State extends OperationProgressState {
  readonly available: boolean;
  readonly lost: boolean;
}

const initial: State = { ...initialOperationProgress, available: true, lost: false };

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'event':
      return { ...operationProgressReducer(state, action.event), available: true, lost: false };
    case 'unavailable':
      // A stream that broke after showing steps leaves them (still accurate until the end).
      return state.outcome === null ? { ...state, available: false } : state;
    case 'lost':
      return { ...state, lost: true };
    case 'reset':
      return initial;
  }
}

/**
 * Live progress of any long-running operation (the event `kind` selects the step vocabulary). Display state
 * only: it never decides, delays or fails the operation. If the stream cannot be opened, drops, or
 * is unsupported, the hook just reports no (more) steps and the owner's own monitoring and
 * polling carry on. The stream is aborted when `enabled` turns off, the operation changes or the
 * component unmounts.
 */
export function useOperationProgress(options: UseOperationProgressOptions): OperationProgressView {
  const { api, streamUrl, enabled } = options;
  const [state, dispatch] = useReducer(reduce, initial);

  useEffect(() => {
    dispatch({ type: 'reset' });
    if (!enabled || !streamUrl) return;
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of api.watchProgress(streamUrl, controller.signal)) {
          if (controller.signal.aborted) return;
          dispatch({ type: 'event', event });
        }
        // The stream ended (the server closes it after a terminal event, which `outcome` records).
        if (!controller.signal.aborted) dispatch({ type: 'lost' });
      } catch {
        // Best effort: the operation's own monitoring is the source of truth.
        if (!controller.signal.aborted) {
          dispatch({ type: 'unavailable' });
          dispatch({ type: 'lost' });
        }
      }
    })();
    return () => controller.abort();
  }, [api, enabled, streamUrl]);

  return {
    steps: enabled ? visibleProgressSteps(state.steps) : [],
    outcome: state.outcome,
    failureCode: state.failureCode,
    available: state.available,
    lost: state.lost,
  };
}
