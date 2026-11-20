import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import type { OwnedExecutionClaim } from '../../specs/durable';
import { openWorkflow } from '../composition';
import type { WorkflowDependencies } from '../operations/loaded-execution';
import { executionClaimAdmission, type WorkflowWriteAdmission } from '../write-admission';
import { filesystemAgentAttemptJournal, type AgentAttemptJournalStore } from './journal/store';

/** What the agent attempt operations need besides the workflow operations themselves. */
export interface AgentAttemptDependencies {
  readonly workflow: WorkflowDependencies;
  readonly journal: AgentAttemptJournalStore;
  /**
   * The writer-claim admission of a journal write, inside the `serialize` section: `owned` names the
   * execution claim of the Turn that writes (the `turn` form), none for an owner's request.
   */
  readonly admission: (owned: OwnedExecutionClaim | undefined) => WorkflowWriteAdmission;
  /** A new attempt id (a UUID). */
  readonly newId: () => string;
}

/** The agent attempt operations of an opened Engine. */
export async function openAgentAttempts(engine: SpecFlowEngine): Promise<AgentAttemptDependencies> {
  return {
    workflow: await openWorkflow(engine),
    journal: filesystemAgentAttemptJournal(engine.context),
    admission: (owned) => executionClaimAdmission(engine, owned),
    newId: randomUUID,
  };
}
