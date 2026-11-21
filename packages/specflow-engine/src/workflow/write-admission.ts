import type { SpecFlowEngine } from '../application';
import { assertNoForeignExecutionClaim } from '../specs/coordination/resources';
import { SharedResourceError, type OwnedExecutionClaim } from '../specs/durable';
import { SpecificationBusyError } from './errors';

/**
 * The admission of a workflow write against the project's writer claims (F05): refuses with
 * `SpecificationBusyError` (`WORKFLOW_SPECIFICATION_BUSY`, naming the holder) while a claim other
 * than the caller's own holds the project, with Git on or off. Called under the project control
 * lock, so no claim is admitted between the check and the write. The execution store applies it to
 * every change (`state/claim-guard.ts`); the archetype edit and the definitions install to their
 * own write.
 */
export interface WorkflowWriteAdmission {
  admitWrite(): Promise<void>;
}

/** A host without writer claims (the in-memory workflow, unit tests): every write is admitted. */
export const NO_CLAIMS: WorkflowWriteAdmission = { admitWrite: () => Promise.resolve() };

/**
 * The writer-claim admission of an opened Engine: no write while an agent execution claim other
 * than `owned` is unsettled. The refusal names the Session and the remedy.
 */
export function executionClaimAdmission(
  engine: SpecFlowEngine,
  owned: OwnedExecutionClaim | undefined,
): WorkflowWriteAdmission {
  return {
    async admitWrite() {
      try {
        await assertNoForeignExecutionClaim(
          engine.context,
          owned !== undefined ? { ownedExecution: owned } : undefined,
        );
      } catch (error) {
        if (
          error instanceof SharedResourceError &&
          error.code === 'RESOURCE_CONFLICT' &&
          error.holder?.kind === 'external'
        ) {
          const { operationId, ownerId, phase } = error.holder;

          throw new SpecificationBusyError(
            error.message,
            {
              cause: phase === 'unknown' ? 'agent-turn-unknown' : 'agent-turn',
              sessionId: ownerId,
            },
            { operationId, sessionId: ownerId },
          );
        }

        if (error instanceof SharedResourceError && error.code === 'OWNED_CLAIM_NOT_HELD') {
          throw new SpecificationBusyError(error.message, { cause: 'other' });
        }

        throw error;
      }
    },
  };
}
