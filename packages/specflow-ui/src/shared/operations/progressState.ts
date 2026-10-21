import type {
  OperationProgressEvent,
  OperationStepStatus,
} from '@nevo/specflow-contracts/operations';

export interface OperationStepView {
  readonly id: string;
  readonly status: OperationStepStatus;
}

/**
 * Display state of an operation's progress. It is NOT operation state: the operation's own owner
 * (for Create, `createOperationReducer`) decides what became of it; this only draws the checklist
 * the server reported, best effort.
 */
export interface OperationProgressState {
  /** Empty until the first snapshot (the server sends the checklist of this run first). */
  readonly steps: readonly OperationStepView[];
  /** `null` until the stream said anything. */
  readonly outcome: 'running' | 'completed' | 'failed' | 'recovery-required' | null;
}

export const initialOperationProgress: OperationProgressState = { steps: [], outcome: null };

export function operationProgressReducer(
  state: OperationProgressState,
  event: OperationProgressEvent,
): OperationProgressState {
  switch (event.type) {
    case 'snapshot':
      // A reconnect starts with a fresh snapshot of the same run: it replaces what was drawn.
      return {
        steps: event.steps.map((step) => ({ id: step.id, status: step.status })),
        outcome: event.status,
      };
    case 'step':
      return state.steps.some((step) => step.id === event.step)
        ? {
            ...state,
            steps: state.steps.map((step) =>
              step.id === event.step ? { ...step, status: event.status } : step,
            ),
          }
        : state;
    case 'completed':
    case 'failed':
    case 'recovery-required':
      return { ...state, outcome: event.type };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Skipped steps are not part of what the user waits for. */
export const visibleProgressSteps = (
  steps: readonly OperationStepView[],
): readonly OperationStepView[] => steps.filter((step) => step.status !== 'skipped');
