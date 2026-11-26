import type { AgentOption } from '@nevo/specflow-contracts/workflow';
import { WorkflowError } from '@nevo/specflow-engine';

import { SessionError } from '../../sessions';
import {
  AgentUnavailableError,
  WorkflowUnavailableError,
  workflowFailure,
  type WorkflowFailure,
} from '../../workflow';

/** What a Session refusal on the way to the Turn means for the agent, by its code. */
const SESSION_REASONS: Partial<
  Record<string, Extract<AgentOption, { kind: 'unavailable' }>['reason']>
> = {
  PROVIDER_UNAVAILABLE: 'provider-not-ready',
  PROVIDER_AUTH_REQUIRED: 'provider-not-ready',
  PROVIDER_CATALOGUE_UNAVAILABLE: 'provider-not-ready',
  CAPABILITY_UNSUPPORTED: 'provider-not-ready',
  MODEL_UNSUPPORTED: 'provider-not-ready',
  SESSION_DISABLED: 'provider-not-ready',
  TURN_CONFLICT: 'project-busy',
  SESSION_NOT_FOUND: 'session-unavailable',
  SESSION_ARCHIVED: 'session-unavailable',
};

/**
 * A Session refusal on the way to the Turn, in the workflow vocabulary: the agent unavailable for a
 * reason the owner can act on (said in the Session's words), the request invalid, or the Session
 * store unavailable for now (503).
 */
export function stepExecutionRefusal(error: unknown): WorkflowFailure | undefined {
  if (error instanceof SessionError) {
    const reason = SESSION_REASONS[error.code];
    if (reason !== undefined) {
      return workflowFailure(
        new AgentUnavailableError(
          { kind: 'unavailable', reason, detail: error.message },
          error.message,
        ),
      );
    }

    return workflowFailure(
      error.code === 'SESSION_INPUT_INVALID' || error.code === 'IDEMPOTENCY_CONFLICT'
        ? new WorkflowError('WORKFLOW_INPUT_INVALID', error.message)
        : new WorkflowUnavailableError(),
    );
  }

  return workflowFailure(error);
}

/**
 * A refused start as Create's first-step result keeps it: its stable code and, when the refusal is
 * about the agent or the checkout, the agent option that explains it (an attribution of
 * uncommitted changes becomes the same option Run with agent shows for it).
 */
export function firstStepRefusal(
  error: unknown,
): { readonly code: string; readonly agent?: AgentOption } | undefined {
  const failure = stepExecutionRefusal(error);
  if (!failure) {
    return undefined;
  }

  const { code, agent, attribution } = failure.body as {
    readonly code: string;
    readonly agent?: AgentOption;
    readonly attribution?: { readonly paths: readonly string[]; readonly count: number };
  };
  const reason =
    code === 'WORKFLOW_DIRTY_BASELINE'
      ? ('dirty-baseline' as const)
      : code === 'WORKFLOW_OWNER_WORK_UNCOMMITTED'
        ? ('owner-work-uncommitted' as const)
        : undefined;
  if (agent) {
    return { code, agent };
  }

  if (reason && attribution) {
    return {
      code,
      agent: {
        kind: 'unavailable',
        reason,
        paths: [...attribution.paths],
        count: attribution.count,
      },
    };
  }

  return { code };
}
