import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  OPERATION_KINDS,
  OperationProgressEventSchema,
  isTerminalOperationProgressEvent,
  operationProgressEventSchema,
  specificationCreateSteps,
} from './index';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const at = '2026-01-01T00:00:00.000Z';

describe('operation progress contract', () => {
  it('registers the Specification create kind with a stable public step vocabulary', () => {
    expect(Object.keys(OPERATION_KINDS)).toEqual(['specification-create']);
    expect(OPERATION_KINDS['specification-create'].steps).toEqual([
      'reserving',
      'preparing-workspace',
      'writing-specification',
      'registering',
    ]);
  });

  it('omits the workspace step for an existing target', () => {
    expect(specificationCreateSteps('existing')).toEqual([
      'reserving',
      'writing-specification',
      'registering',
    ]);
    expect(specificationCreateSteps('new-worktree')).toEqual([
      ...OPERATION_KINDS['specification-create'].steps,
    ]);
  });

  it('accepts every event shape of the generic stream', () => {
    const events = [
      {
        type: 'snapshot',
        operationId,
        kind: 'specification-create',
        status: 'running',
        steps: [
          { id: 'reserving', status: 'running' },
          { id: 'registering', status: 'pending' },
        ],
        currentStep: 'reserving',
        at,
      },
      {
        type: 'step',
        operationId,
        kind: 'specification-create',
        step: 'reserving',
        status: 'done',
        at,
      },
      {
        type: 'failed',
        operationId,
        kind: 'specification-create',
        code: 'BRANCH_ALREADY_EXISTS',
        at,
      },
      { type: 'recovery-required', operationId, kind: 'specification-create', at },
    ];
    for (const event of events) expect(Value.Check(OperationProgressEventSchema, event)).toBe(true);
  });

  it('types the completed result per kind and rejects server text and extra fields', () => {
    const schema = operationProgressEventSchema('specification-create');
    const result = {
      operationId,
      specId: operationId,
      kind: 'specification-create',
      status: 'completed',
      slug: 'a-spec',
      workspaceId: operationId,
      relativeManifestPath: 'specs/a/specification.yaml',
    };
    expect(
      Value.Check(schema, {
        type: 'completed',
        operationId,
        kind: 'specification-create',
        result,
        at,
      }),
    ).toBe(true);
    expect(
      Value.Check(schema, {
        type: 'completed',
        operationId,
        kind: 'specification-create',
        result: { ...result, status: 'x' },
        at,
      }),
    ).toBe(false);
    expect(
      Value.Check(schema, {
        type: 'failed',
        operationId,
        kind: 'specification-create',
        code: 'X',
        message: '/srv/secret',
        at,
      }),
    ).toBe(false);
    expect(
      Value.Check(schema, {
        type: 'step',
        operationId,
        kind: 'specification-create',
        step: 'git-initiated',
        status: 'running',
        at,
      }),
    ).toBe(false);
  });

  it('classifies terminal events', () => {
    expect(isTerminalOperationProgressEvent({ type: 'completed' })).toBe(true);
    expect(isTerminalOperationProgressEvent({ type: 'failed' })).toBe(true);
    expect(isTerminalOperationProgressEvent({ type: 'recovery-required' })).toBe(true);
    expect(isTerminalOperationProgressEvent({ type: 'step' })).toBe(false);
  });
});
