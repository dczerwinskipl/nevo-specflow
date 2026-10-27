import {
  admitWorkspaceExecution,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  abandonWorkspaceExecutionAdmission,
  settleWorkspaceExecution,
  inspectWorkspaceExecution,
  type SpecFlowEngine,
  type WorkspaceExecutionIntent,
} from '@nevo/specflow-engine';
import { createHash } from 'node:crypto';
import type { SessionEffects, SessionEffectIdentity } from '../lifecycle/effects';
import { SessionError } from '../errors';

export function workspaceExecutionIdentity(engine: SpecFlowEngine) {
  return recordedIdentity(engine, engine.workspace);
}
function recordedIdentity(
  engine: SpecFlowEngine,
  workspace: { workspaceId: string; root: string; instanceId?: string },
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        projectId: engine.context.project.projectId,
        gitInstanceId: engine.context.project.gitInstanceId,
        workspaceId: workspace.workspaceId,
        instanceId: workspace.instanceId ?? null,
        root: workspace.root,
      }),
    )
    .digest('hex');
}

export function createEngineSessionEffects(engine: SpecFlowEngine): SessionEffects {
  function intent(identity: SessionEffectIdentity): WorkspaceExecutionIntent {
    return {
      operationId: identity.invocationId,
      ownerId: identity.sessionId,
      binding: identity.binding,
    };
  }
  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if ((error as { code?: unknown }).code === 'RESOURCE_CONFLICT')
        throw new SessionError(
          'TURN_CONFLICT',
          'An unfinished project writer prevents agent execution.',
        );
      throw new SessionError(
        'SESSION_RECOVERY_REQUIRED',
        'Engine execution evidence could not be confirmed.',
      );
    }
  }
  return {
    async admit(identity) {
      if (
        identity.workspace !== engine.workspace.root ||
        identity.workspaceIdentity !== workspaceExecutionIdentity(engine)
      )
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'Execution workspace identity is not verified.',
        );
      const request = intent(identity);
      const record = await guarded(() => admitWorkspaceExecution(engine, request));
      if (record.phase !== 'admitted')
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'An execution claim cannot be dispatched again.',
        );
      return {
        dispatch: () =>
          guarded(async () => {
            await markWorkspaceExecutionDispatched(engine, request);
          }),
        abandon: () =>
          guarded(async () => {
            await abandonWorkspaceExecutionAdmission(engine, request);
          }),
        unknown: () =>
          guarded(async () => {
            await markWorkspaceExecutionUnknown(engine, request);
          }),
        settle: (evidence) =>
          guarded(async () => {
            await settleWorkspaceExecution(engine, request, {
              ...evidence,
              invocationId: identity.invocationId,
            });
          }),
      };
    },
    async reconcile(identity) {
      let record = await guarded(() => inspectWorkspaceExecution(engine, identity.invocationId));
      if (
        !record &&
        !identity.nativeDispatched &&
        identity.workspace === engine.workspace.root &&
        identity.workspaceIdentity === workspaceExecutionIdentity(engine)
      ) {
        // SQLite may commit before Engine admission. Establish the SAME intent
        // durably under Engine's writer lock before retiring it as not dispatched.
        // Admission revalidates the current incarnation and conflicts; missing
        // journal data alone never authorizes a canonical terminal transition.
        record = await guarded(() => admitWorkspaceExecution(engine, intent(identity)));
      }
      if (
        record?.intent.ownerId !== identity.sessionId ||
        record.intent.binding !== identity.binding
      )
        return undefined;
      if (
        record.workspace.root !== identity.workspace ||
        recordedIdentity(engine, record.workspace) !== identity.workspaceIdentity
      )
        return undefined;
      if (record.phase === 'admitted' && !identity.nativeDispatched)
        record = await guarded(() => abandonWorkspaceExecutionAdmission(engine, intent(identity)));
      if (record.phase !== 'settled') return undefined;
      if (record.settlement?.kind === 'not-dispatched')
        return identity.nativeDispatched
          ? undefined
          : { process: 'stopped', outcome: 'interrupted', source: 'not-dispatched' };
      if (record.settlement?.kind !== 'native-result') return undefined;
      return { ...record.settlement.receipt, source: 'native-result' };
    },
  };
}
