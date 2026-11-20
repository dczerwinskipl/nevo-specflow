import { sha256Hex } from '../../hash';
import type { FinishingSession } from '../continuation/resolve';
import { activeAttempt, canonicalJson } from '@nevo/workflow';
import { requiresOwnerConfirmation } from '../definitions/effect-authority';
import type { WorkflowTransition } from '../definitions/model';
import { WorkflowError } from '../errors';
import { assertActorShape } from '../input-schema';
import type { OwnerActor, WorkflowActor, WorkflowRun } from '../state/model';

/**
 * The SpecFlow rules about who acts, on top of the core's executor-class policy (an actor's class is
 * one the step allows, and an active attempt is continued only by its own class): which agent may
 * continue an agent attempt, and that owner actions come from the owner.
 */

function notAllowed(message: string): never {
  throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', message);
}

/**
 * An active agent attempt that runs in a Session is resumed and finished only by that Session (same
 * provider and Session id). Handing an agent's attempt to the owner is not a finish (the core refuses
 * a person continuing it).
 */
export function assertSameSession(run: WorkflowRun, actor: WorkflowActor): void {
  assertActorShape(actor);
  const started = activeAttempt(run)?.actor;
  if (
    actor.class === 'agent' &&
    started?.class === 'agent' &&
    started.details.sessionId !== undefined &&
    (actor.details.provider !== started.details.provider ||
      actor.details.sessionId !== started.details.sessionId)
  ) {
    const position = run.position;
    notAllowed(
      `Only the Session that works on "${position.state === 'active' ? position.step : ''}" can resume or finish it.`,
    );
  }
}

/**
 * An owner action (a return, a direct Task status decision) names the owner as its actor, from
 * trusted Runtime/CLI context; anything else is refused before anything is planned.
 */
export function assertOwner(actor: unknown, action: string): asserts actor is OwnerActor {
  if ((actor as WorkflowActor | undefined)?.class !== 'human') {
    notAllowed(`Only the owner ${action}.`);
  }

  assertActorShape(actor);
}

/**
 * An agent's finish proposal never takes a decision only the owner takes (D17): a transition whose
 * effects are owner authority or that declares `confirmation: owner`, and status decisions on Tasks
 * (approve, hold, resume, cancel). Until the owner can confirm such a proposal, it is refused.
 */
export function assertAgentAuthority(
  transition: WorkflowTransition,
  taskDecisions: readonly unknown[] | undefined,
): void {
  if (requiresOwnerConfirmation(transition)) {
    throw new WorkflowError(
      'WORKFLOW_OWNER_DECISION_REQUIRED',
      `Only the owner can take "${transition.label ?? transition.id}": choose another result, or hand the step to the owner.`,
    );
  }

  if (taskDecisions !== undefined && taskDecisions.length > 0) {
    throw new WorkflowError(
      'WORKFLOW_OWNER_DECISION_REQUIRED',
      'Only the owner decides the status of Tasks: finish without Task decisions.',
    );
  }
}

/** The Session that finished an attempt, when an agent in a Session finished it. */
export function finishingSession(actor: WorkflowActor | undefined): FinishingSession | undefined {
  if (actor?.class !== 'agent') {
    return undefined;
  }

  return {
    provider: actor.details.provider,
    ...(actor.details.sessionId !== undefined ? { sessionId: actor.details.sessionId } : {}),
  };
}

/**
 * The digest of a finish request (the attempt it names and its whole input), stored with the
 * attempt, so a retry of the same finish returns the recorded result instead of failing.
 */
export function finishDigest(request: {
  readonly step: string;
  readonly attempt: number;
  readonly input: unknown;
}): string {
  return sha256Hex(
    canonicalJson({ step: request.step, attempt: request.attempt, input: request.input }),
  );
}
