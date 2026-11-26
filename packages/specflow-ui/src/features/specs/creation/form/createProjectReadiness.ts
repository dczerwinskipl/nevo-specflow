import type { ArchetypeFirstStep, ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../../i18n/message';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';
import { workspaceProblems } from '../workspace/model/workspaceValidation';
import { type WorkspaceChoice } from '../workspace/model/workspaceChoice';
import type { CreateProblemField } from './createGuide';

/** Limits of the Runtime Create request (the contracts `CreateSpecRequestSchema`). */
export const createTitleMaxLength = 200;
export const createGoalMaxLength = 4000;

export interface ProjectCreateReadiness {
  /** Why Create is not available yet (first blocking reason), else undefined. */
  prerequisite: Message | undefined;
  /**
   * The field that reason belongs to, in the form's order (name, archetype, then the workspace
   * fields); absent when no field can fix it (loading, no permission, nothing installed).
   */
  problemField?: CreateProblemField;
  canSubmit: boolean;
}

/**
 * The agent path's one extra rule (Create with an agent): the archetype's first step must be an
 * agent's, and an agent that can start must be chosen.
 */
export interface AgentPathReadiness {
  /** The selected archetype's first step; undefined when it starts no workflow. */
  readonly firstStep: ArchetypeFirstStep | undefined;
  /** Whether the agents are read yet. */
  readonly agents: 'loading' | 'error' | 'ready';
  /** At least one agent can start. */
  readonly anyAvailable: boolean;
  /** The chosen agent can start. */
  readonly chosenAvailable: boolean;
}

/** Whether the project Create form can be submitted and, if not, the one reason shown in the footer. */
export function projectCreateReadiness(input: {
  title: string;
  goal: string;
  workspaceState: WorkspaceOptionsState;
  choice: WorkspaceChoice;
  forbidden: boolean;
  /** The archetype catalogue is still loading. */
  archetypesLoading: boolean;
  /** The archetype catalogue could not be read: only its Retry can fix it, not a field. */
  archetypesFailed?: boolean;
  /** The selected archetype (undefined while loading, after a failure or with an empty catalogue). */
  archetype: ArchetypeInfo | undefined;
  /** The Engine catalogue has no usable options, with its actionable recovery message. */
  archetypeUnavailable?: Message;
  /** Create with an agent: its rule, checked after the archetype (the Agent section comes next). */
  agent?: AgentPathReadiness;
}): ProjectCreateReadiness {
  const { title, goal, workspaceState, choice } = input;
  const tooLong =
    title.trim().length > createTitleMaxLength || goal.trim().length > createGoalMaxLength;
  const blocked = (
    prerequisite: Message,
    problemField?: CreateProblemField,
  ): ProjectCreateReadiness => ({
    prerequisite,
    ...(problemField ? { problemField } : {}),
    canSubmit: false,
  });

  if (input.forbidden) {
    return blocked(message('create.prerequisite.forbidden'));
  }

  if (input.archetypesLoading) {
    return blocked(message('create.archetype.loading'));
  }

  if (input.archetypesFailed) {
    return blocked(message('create.archetype.loadFailed'));
  }

  if (input.archetypeUnavailable) {
    return blocked(input.archetypeUnavailable);
  }

  switch (workspaceState.status) {
    case 'loading':
      return blocked(message('create.prerequisite.workspaceLoading'));
    case 'error':
      return blocked(message('create.prerequisite.workspaceError'));
    case 'forbidden':
      return blocked(message('create.prerequisite.forbidden'));
    case 'ready':
      break;
  }

  // Once the required options are available, guide missing input in the form's reading order.
  if (!title.trim()) {
    return blocked(message('create.prerequisite.title'), 'name');
  }

  if (!input.archetype) {
    return blocked(message('create.prerequisite.archetype'), 'archetype');
  }

  const agentProblem = input.agent && agentPathProblem(input.agent);
  if (agentProblem) {
    return blocked(agentProblem.message, agentProblem.field);
  }

  const [workspaceProblem] = workspaceProblems(choice, workspaceState.options, title);
  if (workspaceProblem) {
    return blocked(workspaceProblem.message, workspaceProblem.field);
  }

  return { prerequisite: undefined, canSubmit: !tooLong };
}

function agentPathProblem(
  agent: AgentPathReadiness,
): { message: Message; field?: CreateProblemField } | undefined {
  if (!agent.firstStep) {
    return { message: message('create.agentStep.prerequisite.noWorkflow') };
  }

  if (!agent.firstStep.agent) {
    return { message: message('create.agentStep.prerequisite.ownerFirst') };
  }

  if (agent.agents === 'loading') {
    return { message: message('create.agentStep.prerequisite.agentsLoading') };
  }

  if (agent.agents === 'error') {
    return { message: message('create.agentStep.prerequisite.agentsFailed') };
  }

  if (!agent.anyAvailable) {
    return { message: message('create.agentStep.prerequisite.noAgent') };
  }

  return agent.chosenAvailable
    ? undefined
    : { message: message('create.prerequisite.provider'), field: 'provider' };
}
