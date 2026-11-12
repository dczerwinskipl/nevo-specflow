import type {
  AbandonSpecificationResult as AbandonContract,
  FinishWorkflowResult,
  ReturnWorkflowResult,
  TaskProposal as TaskProposalContract,
  WorkflowActionProjection,
} from '@nevo/specflow-contracts/workflow';
import type {
  AbandonSpecificationResult,
  ActionProjection,
  FinishStepResult,
  ReturnToStepResult,
  TaskProposal,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import type { Mutable } from './wire';

/**
 * The contract types and the Engine's results must describe the same values: each assertion below
 * compiles only when the types are assignable both ways (modulo `readonly`), so a field added or
 * changed on either side fails the typecheck. (`start` is a presentation of the Engine result, typed
 * where it is made.)
 */
type Same<Engine, Contract> = [Mutable<Engine>] extends [Contract]
  ? [Contract] extends [Mutable<Engine>]
    ? true
    : never
  : never;

const same = <Engine, Contract>(_proof: Same<Engine, Contract>): void => undefined;

describe('workflow contract types', () => {
  it('match the Engine both ways', () => {
    same<ActionProjection, WorkflowActionProjection>(true);
    same<FinishStepResult, FinishWorkflowResult>(true);
    same<ReturnToStepResult, ReturnWorkflowResult>(true);
    same<AbandonSpecificationResult, AbandonContract>(true);
    same<TaskProposal, TaskProposalContract>(true);
    expect(true).toBe(true);
  });
});
