import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import { describe, expect, it } from 'vitest';

import {
  initialOperationProgress,
  operationProgressReducer,
  visibleProgressSteps,
} from './progressState';

const base = {
  operationId: '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60',
  kind: 'specification-create',
  at: '2026-01-01T00:00:00.000Z',
};
const snapshot: OperationProgressEvent = {
  ...base,
  type: 'snapshot',
  status: 'running',
  steps: [
    { id: 'reserving', status: 'running' },
    { id: 'preparing-workspace', status: 'pending' },
    { id: 'registering', status: 'pending' },
  ],
  currentStep: 'reserving',
};

describe('operation progress reducer', () => {
  it('starts empty and unknown', () => {
    expect(initialOperationProgress).toEqual({ steps: [], outcome: null });
  });

  it('takes the step list from the snapshot', () => {
    const state = operationProgressReducer(initialOperationProgress, snapshot);
    expect(state.steps.map((step) => step.id)).toEqual([
      'reserving',
      'preparing-workspace',
      'registering',
    ]);
    expect(state.outcome).toBe('running');
  });

  it('applies step events and ignores steps it does not know', () => {
    let state = operationProgressReducer(initialOperationProgress, snapshot);
    state = operationProgressReducer(state, {
      ...base,
      type: 'step',
      step: 'reserving',
      status: 'done',
    });
    state = operationProgressReducer(state, {
      ...base,
      type: 'step',
      step: 'preparing-workspace',
      status: 'running',
    });
    state = operationProgressReducer(state, {
      ...base,
      type: 'step',
      step: 'unknown',
      status: 'done',
    });
    expect(state.steps).toEqual([
      { id: 'reserving', status: 'done' },
      { id: 'preparing-workspace', status: 'running' },
      { id: 'registering', status: 'pending' },
    ]);
  });

  it('a reconnect snapshot replaces what was shown', () => {
    let state = operationProgressReducer(initialOperationProgress, snapshot);
    state = operationProgressReducer(state, {
      ...base,
      type: 'step',
      step: 'reserving',
      status: 'done',
    });
    state = operationProgressReducer(state, {
      ...base,
      type: 'snapshot',
      status: 'running',
      steps: [{ id: 'reserving', status: 'done' }],
    });
    expect(state.steps).toEqual([{ id: 'reserving', status: 'done' }]);
  });

  it('records terminal outcomes without touching the steps', () => {
    const running = operationProgressReducer(initialOperationProgress, snapshot);
    expect(
      operationProgressReducer(running, { ...base, type: 'completed', result: {} }).outcome,
    ).toBe('completed');
    expect(operationProgressReducer(running, { ...base, type: 'failed', code: 'X' }).outcome).toBe(
      'failed',
    );
    expect(operationProgressReducer(running, { ...base, type: 'recovery-required' }).outcome).toBe(
      'recovery-required',
    );
    expect(operationProgressReducer(running, { ...base, type: 'failed', code: 'X' }).steps).toEqual(
      running.steps,
    );
  });

  it('omits skipped steps from the visible checklist', () => {
    const steps = [
      { id: 'a', status: 'done' as const },
      { id: 'b', status: 'skipped' as const },
      { id: 'c', status: 'running' as const },
    ];
    expect(visibleProgressSteps(steps).map((step) => step.id)).toEqual(['a', 'c']);
  });
});
