import {
  admitWorkspaceExecution,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  abandonWorkspaceExecutionAdmission,
  settleWorkspaceExecution,
  inspectWorkspaceExecution,
  type SpecFlowEngine,
  type WorkspaceExecutionIntent,
  type WorkspaceExecutionReceipt,
} from '@nevo/specflow-engine';
import { createHash } from 'node:crypto';
import type { SessionEffects, SessionEffectIdentity } from '../lifecycle/effects';
import { SessionError } from '../errors';

export function workspaceExecutionIdentity(engine: SpecFlowEngine) {
  return recordedIdentity(engine, engine.workspace);
}

/** The identity a claim records for a registered workspace (the Engine's own or a worktree). */
export function recordedIdentity(
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

/**
 * Settles the claim of a Turn of an agent attempt instead of the bare settlement: the attempt's
 * finalize (the agent-execution feature), which publishes the step state and settles the claim in
 * one section (D12). Called with the claim's recorded intent and the native-stop receipt.
 */
export type AgentAttemptSettlement = (
  intent: WorkspaceExecutionIntent & { readonly attempt: { readonly attemptId: string } },
  receipt: WorkspaceExecutionReceipt,
) => Promise<void>;

/**
 * The agent-execution feature's judgement of an agent attempt Turn's claim (D19): `admissible`
 * prepares (outside the lock) the check that runs inside the claim admission's control-lock section
 * and refuses a Turn whose attempt the owner took over or returned after it was bound (the check
 * must not take the lock); `abandoned` applies what such an owner action left waiting once the claim
 * was abandoned as never dispatched (no finalize runs then).
 */
export interface AgentTurnAdmission {
  admissible(attemptId: string, invocationId: string): Promise<() => Promise<void>>;
  abandoned(attemptId: string): Promise<void>;
}

export function createEngineSessionEffects(
  engine: SpecFlowEngine,
  options: {
    readonly settleAgentAttempt?: AgentAttemptSettlement;
    readonly agentTurns?: AgentTurnAdmission;
  } = {},
): SessionEffects {
  function intent(identity: SessionEffectIdentity): WorkspaceExecutionIntent {
    return {
      operationId: identity.invocationId,
      ownerId: identity.sessionId,
      binding: identity.binding,
      ...(identity.attemptId !== undefined ? { attempt: { attemptId: identity.attemptId } } : {}),
    };
  }

  /**
   * The intent as the claim recorded it, when it is this identity's: a recovery identity (from the
   * Session store) does not carry the agent attempt, which the recorded intent does.
   */
  async function recordedIntent(
    identity: SessionEffectIdentity,
  ): Promise<WorkspaceExecutionIntent> {
    const expected = intent(identity);
    const record = await inspectWorkspaceExecution(engine, identity.invocationId);
    const recorded = record?.intent;

    return recorded?.operationId === expected.operationId &&
      recorded.ownerId === expected.ownerId &&
      recorded.binding === expected.binding &&
      (expected.attempt === undefined || recorded.attempt?.attemptId === expected.attempt.attemptId)
      ? recorded
      : expected;
  }

  /** The settlement of a claim with a native-stop receipt: the attempt's finalize, or the bare one. */
  async function settleWith(
    request: WorkspaceExecutionIntent,
    receipt: WorkspaceExecutionReceipt,
    target: Parameters<typeof settleWorkspaceExecution>[3],
  ): Promise<void> {
    if (request.attempt !== undefined) {
      if (!options.settleAgentAttempt) {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'An agent attempt Turn settles only through its finalize.',
        );
      }

      await options.settleAgentAttempt({ ...request, attempt: request.attempt }, receipt);

      return;
    }

    await settleWorkspaceExecution(engine, request, receipt, target);
  }

  /**
   * The registered workspace an execution runs in, by its root, when its recorded identity is the
   * one the Session was admitted with: the Engine's own checkout or a Specification's worktree.
   */
  async function claimTarget(identity: SessionEffectIdentity) {
    const binding = identity.specId !== undefined ? { specId: identity.specId } : {};
    if (
      identity.workspace === engine.workspace.root &&
      identity.workspaceIdentity === workspaceExecutionIdentity(engine)
    ) {
      return binding;
    }

    const registry = await guarded(() => engine.readRegistry());
    const registered = registry.workspaces.find((item) => item.root === identity.workspace);
    if (!registered || recordedIdentity(engine, registered) !== identity.workspaceIdentity) {
      return undefined;
    }

    return { workspaceId: registered.workspaceId, ...binding };
  }

  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }

      if ((error as { code?: unknown }).code === 'RESOURCE_CONFLICT') {
        throw new SessionError(
          'TURN_CONFLICT',
          'An unfinished project writer prevents agent execution.',
        );
      }

      throw new SessionError(
        'SESSION_RECOVERY_REQUIRED',
        'Engine execution evidence could not be confirmed.',
      );
    }
  }

  return {
    async admit(identity) {
      const target = await claimTarget(identity);
      if (!target) {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'Execution workspace identity is not verified.',
        );
      }

      const request = intent(identity);
      const { attemptId } = identity;
      const turns = options.agentTurns;
      const check =
        attemptId !== undefined && turns
          ? await guarded(() => turns.admissible(attemptId, identity.invocationId))
          : undefined;
      const admissible = check
        ? async () => {
            try {
              await check();
            } catch (error) {
              // The owner ended the attempt or replaced the Turn: refused before any claim, so
              // the Turn ends as never started.
              throw new SessionError(
                'TURN_CONFLICT',
                error instanceof Error ? error.message : 'The agent attempt cannot run.',
              );
            }
          }
        : undefined;
      const record = await guarded(() =>
        admitWorkspaceExecution(engine, request, target, admissible ? { admissible } : {}),
      );
      if (record.phase !== 'admitted') {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'An execution claim cannot be dispatched again.',
        );
      }

      return {
        workspace: record.workspace.root,
        dispatch: () =>
          guarded(async () => {
            await markWorkspaceExecutionDispatched(engine, request, target);
          }),
        abandon: () =>
          guarded(async () => {
            await abandonWorkspaceExecutionAdmission(engine, request, target);
            if (attemptId !== undefined) {
              // A return recorded while the claim was only admitted applies now (no finalize runs
              // for a Turn that never started); a failure here is repaired at the next owner read.
              await turns?.abandoned(attemptId).catch(() => undefined);
            }
          }),
        unknown: () =>
          guarded(async () => {
            await markWorkspaceExecutionUnknown(engine, request, target);
          }),
        settle: (evidence) =>
          guarded(async () => {
            await settleWith(request, { ...evidence, invocationId: identity.invocationId }, target);
          }),
      };
    },
    async reconcile(identity) {
      let record = await guarded(() => inspectWorkspaceExecution(engine, identity.invocationId));
      const target = await claimTarget(identity);
      if (!record && !identity.nativeDispatched && target) {
        // SQLite may commit before Engine admission. Establish the SAME intent
        // durably under Engine's writer lock before retiring it as not dispatched.
        // Admission revalidates the current incarnation and conflicts; missing
        // journal data alone never authorizes a canonical terminal transition.
        record = await guarded(() => admitWorkspaceExecution(engine, intent(identity), target));
      }

      if (
        record?.intent.ownerId !== identity.sessionId ||
        record.intent.binding !== identity.binding
      ) {
        return undefined;
      }

      if (
        record.workspace.root !== identity.workspace ||
        recordedIdentity(engine, record.workspace) !== identity.workspaceIdentity
      ) {
        return undefined;
      }

      if (record.phase === 'admitted' && !identity.nativeDispatched) {
        if (!target) {
          return undefined;
        }

        const recorded = record.intent;
        record = await guarded(() => abandonWorkspaceExecutionAdmission(engine, recorded, target));
      }

      if (record.phase !== 'settled') {
        return undefined;
      }

      if (record.settlement?.kind === 'not-dispatched') {
        return identity.nativeDispatched
          ? undefined
          : { process: 'stopped', outcome: 'interrupted', source: 'not-dispatched' };
      }

      if (record.settlement?.kind !== 'native-result') {
        return undefined;
      }

      return { ...record.settlement.receipt, source: 'native-result' };
    },
    async settleStopped(identity) {
      const target = await claimTarget(identity);
      if (!target) {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'Execution workspace identity is not verified.',
        );
      }

      await guarded(async () =>
        settleWith(
          await recordedIntent(identity),
          { invocationId: identity.invocationId, process: 'stopped', outcome: 'interrupted' },
          target,
        ),
      );
    },
  };
}
