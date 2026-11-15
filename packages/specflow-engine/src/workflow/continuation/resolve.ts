import type { BlockingTask } from '../tasks/tasks';
import {
  providerOf,
  type AgentArchetype,
  type WorkflowStep,
  type WorkflowTransition,
} from '../definitions/model';

/**
 * What happens after a step finished: the Runtime continues on its own, the owner must act, or there
 * is nothing to run. Pure. The Engine only decides; starting a Session is the Runtime's job, and a
 * decision it cannot carry out (no model for the provider, no Session to continue) always becomes an
 * attention item for the owner instead of a question to the agent.
 */

/** The Session that finished the previous attempt, from trusted Runtime context. */
export interface FinishingSession {
  readonly provider: string;
  readonly sessionId?: string;
}

/** A concrete agent launch: everything the Runtime needs to start or continue a Session. */
export interface AgentLaunch {
  readonly archetype: string;
  readonly provider: string;
  readonly model: string;
  readonly effort?: string;
  readonly session:
    { readonly mode: 'fresh' } | { readonly mode: 'reuse'; readonly sessionId: string };
}

export const ATTENTION_REASONS = [
  /** The transition waits for the owner by definition. */
  'owner-action',
  /** The next step is done by a person only (a human-only gate). */
  'human-step',
  /** The step's agent archetype is not defined (any more). */
  'archetype-missing',
  /** A fresh Session is needed and the archetype names no preferred provider. */
  'provider-not-chosen',
  /** The provider to use has no model chosen in the archetype. */
  'model-missing',
  /**
   * The transition continues the Session, but the previous attempt ran in none (for example a person
   * did it by hand): the Engine never silently starts a fresh Session instead.
   */
  'session-unavailable',
  /**
   * The Specification waits for its Tasks, but no open Task can progress without the owner: each
   * is a draft or on hold, depends on an abandoned or cancelled Task, or waits only for such Tasks.
   */
  'tasks-stuck',
  /**
   * A Task escalated to the Specification (the item names it): it is on hold until the spec writer
   * or the owner decides. Wins over `tasks-stuck`.
   */
  'task-escalated',
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

/** Why an agent launch cannot be resolved from the definitions. */
export type LaunchBlocker = Exclude<
  AttentionReason,
  'owner-action' | 'human-step' | 'tasks-stuck' | 'task-escalated'
>;

export type LaunchResolution =
  | { readonly kind: 'launch'; readonly launch: AgentLaunch }
  | {
      readonly kind: 'unresolved';
      readonly reason: LaunchBlocker;
      readonly archetype?: string;
      readonly provider?: string;
    };

/** How an agent step would be launched, independent of whether it may start on its own. */
export function resolveAgentLaunch(
  archetypeId: string,
  archetype: AgentArchetype | undefined,
  session: WorkflowTransition['annotations']['session'],
  finishing: FinishingSession | undefined,
): LaunchResolution {
  if (!archetype) {
    return { kind: 'unresolved', reason: 'archetype-missing', archetype: archetypeId };
  }

  if (session === 'reuse') {
    if (!finishing?.sessionId) {
      return { kind: 'unresolved', reason: 'session-unavailable', archetype: archetype.id };
    }

    const entry = providerOf(archetype, finishing.provider);
    if (!entry?.model) {
      return {
        kind: 'unresolved',
        reason: 'model-missing',
        archetype: archetype.id,
        provider: finishing.provider,
      };
    }

    return {
      kind: 'launch',
      launch: {
        archetype: archetype.id,
        provider: finishing.provider,
        model: entry.model,
        ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
        session: { mode: 'reuse', sessionId: finishing.sessionId },
      },
    };
  }

  const provider = archetype.preferredProvider;
  if (provider === undefined) {
    return { kind: 'unresolved', reason: 'provider-not-chosen', archetype: archetype.id };
  }

  const entry = providerOf(archetype, provider);
  if (!entry?.model) {
    return { kind: 'unresolved', reason: 'model-missing', archetype: archetype.id, provider };
  }

  return {
    kind: 'launch',
    launch: {
      archetype: archetype.id,
      provider,
      model: entry.model,
      ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
      session: { mode: 'fresh' },
    },
  };
}

export type ContinuationDecision =
  /** `on-hold`: the Task's status does not allow its next step to start. */
  | { readonly kind: 'none'; readonly reason: 'terminal' | 'waiting-for-tasks' | 'on-hold' }
  | { readonly kind: 'continue'; readonly step: string; readonly launch: AgentLaunch }
  | {
      readonly kind: 'attention';
      readonly step: string;
      readonly reason: AttentionReason;
      /**
       * For `task-escalated`: every escalated Task; for `tasks-stuck`: the Tasks to resolve
       * (`blocking`). In id order.
       */
      readonly taskIds?: readonly string[];
      /** For `tasks-stuck`: each Task of `taskIds` with why it blocks (always set, possibly empty). */
      readonly blocking?: readonly BlockingTask[];
      readonly archetype?: string;
      readonly provider?: string;
      /** What an owner start would launch, to prefill a quick start; absent when unresolved. */
      readonly suggestion?: AgentLaunch;
      /** For an owner action: what the owner has to choose before an agent can start. */
      readonly blocker?: LaunchBlocker;
    };

export interface ContinuationInput {
  /** The transition that led to the next step; absent after an owner return (always owner action). */
  readonly transition?: WorkflowTransition;
  /** Absent when the run is terminal. */
  readonly next?: WorkflowStep;
  readonly archetypes: (id: string) => AgentArchetype | undefined;
  readonly finishing?: FinishingSession;
}

export function resolveContinuation(input: ContinuationInput): ContinuationDecision {
  const next = input.next;
  if (!next) {
    return { kind: 'none', reason: 'terminal' };
  }

  if (next.kind === 'wait') {
    return { kind: 'none', reason: 'waiting-for-tasks' };
  }

  // A step only a person may do; a step an agent may also do resolves the agent's launch.
  if (!next.executors.includes('agent')) {
    return { kind: 'attention', step: next.id, reason: 'human-step' };
  }

  const archetypeId = next.annotations.archetype ?? '';
  const resolution = resolveAgentLaunch(
    archetypeId,
    input.archetypes(archetypeId),
    input.transition?.annotations.session ?? 'fresh',
    input.finishing,
  );
  const automatic = input.transition?.continuation === 'auto';
  if (resolution.kind === 'launch') {
    return automatic
      ? { kind: 'continue', step: next.id, launch: resolution.launch }
      : {
          kind: 'attention',
          step: next.id,
          reason: 'owner-action',
          archetype: resolution.launch.archetype,
          provider: resolution.launch.provider,
          suggestion: resolution.launch,
        };
  }

  return {
    kind: 'attention',
    step: next.id,
    reason: automatic ? resolution.reason : 'owner-action',
    ...(automatic ? {} : { blocker: resolution.reason }),
    ...(resolution.archetype !== undefined ? { archetype: resolution.archetype } : {}),
    ...(resolution.provider !== undefined ? { provider: resolution.provider } : {}),
  };
}
