import { describe, expect, it } from 'vitest';

import { isReadRequest } from '../../../project/request-verification-memo';
import type { WorkflowDependencies } from '../../operations/loaded-execution';
import type { ExecutionSnapshot } from '../../state/store';
import type { AgentAttemptJournal } from '../journal/model';
import { activeAgentAttempt } from '../scope/attempt';
import { readAgentAttemptWork } from './attempt';
import { readWorkflowHistory } from './workflow';

/**
 * The projection reads of an agent attempt run on every workflow `actions` and `history` request:
 * outside an Engine read request each snapshot read verifies the Project Home and checkout with
 * Git (two dozen Git processes, seconds on Windows). They must read as read requests.
 */
function recordingWorkflow(): {
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>;
  reads: boolean[];
} {
  const reads: boolean[] = [];
  const snapshot: ExecutionSnapshot = {
    specId: 'S1',
    manifests: [],
    runs: [],
    folders: [],
    issues: [],
  };
  const store = {
    read: (): Promise<ExecutionSnapshot> => {
      reads.push(isReadRequest());

      return Promise.resolve(snapshot);
    },
  } as unknown as WorkflowDependencies['store'];

  return {
    workflow: { catalogue: {} as WorkflowDependencies['catalogue'], store },
    reads,
  };
}

describe('agent attempt projection reads', () => {
  const subject = { kind: 'specification', specId: 'S1' } as const;

  it('reads the Workflow history as a read request', async () => {
    const { workflow, reads } = recordingWorkflow();

    await readWorkflowHistory(workflow, subject);

    expect(reads).toEqual([true]);
  });

  it('reads the active agent attempt as a read request', async () => {
    const { workflow, reads } = recordingWorkflow();

    await activeAgentAttempt(workflow, subject).catch(() => undefined);

    expect(reads).toEqual([true]);
  });

  it("reads an attempt's work as a read request", async () => {
    const { workflow, reads } = recordingWorkflow();
    const journal = { subject, operationId: 'A1', workspaceId: 'W1' } as AgentAttemptJournal;

    await readAgentAttemptWork(workflow, { ledger: () => Promise.resolve([]) }, journal).catch(
      () => undefined,
    );

    expect(reads).toEqual([true]);
  });
});
