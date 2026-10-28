import { writeFile } from 'node:fs/promises';
import { it } from 'vitest';
import {
  admitWorkspaceExecution,
  markWorkspaceExecutionDispatched,
  settleWorkspaceExecution,
  openSpecFlowEngine,
  type WorkspaceExecutionIntent,
} from '../../src/testing';

it.skipIf(process.env.NEVO_EXECUTION_WORKER !== '1')(
  'durable external execution process checkpoint',
  async () => {
    const intent = JSON.parse(process.env.NEVO_EXECUTION_INTENT!) as WorkspaceExecutionIntent;
    const stage = process.env.NEVO_EXECUTION_STAGE!;
    const engine = await openSpecFlowEngine({ cwd: process.env.NEVO_EXECUTION_ROOT! });
    await admitWorkspaceExecution(engine, intent);
    if (stage !== 'admitted') await markWorkspaceExecutionDispatched(engine, intent);
    if (stage === 'settled')
      await settleWorkspaceExecution(engine, intent, {
        invocationId: intent.operationId,
        process: 'stopped',
        outcome: 'completed',
      });
    await writeFile(
      process.env.NEVO_EXECUTION_MARKER!,
      JSON.stringify({ pid: process.pid, stage, operationId: intent.operationId }),
    );
    await new Promise<void>(() => undefined);
  },
  120000,
);
