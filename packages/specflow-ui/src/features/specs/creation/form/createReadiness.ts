import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../../i18n/message';
import { providerDefaultEffort, type AgentChoice } from '../../../sessions';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';
import { workspaceProblems } from '../workspace/model/workspaceValidation';
import { type WorkspaceChoice } from '../workspace/model/workspaceChoice';
import type { CreateProblemField } from './createGuide';

export interface CreateReadiness {
  /** Why Create is not available yet (first blocking reason), else undefined. */
  prerequisite: Message | undefined;
  /**
   * The field that reason belongs to, in the form's order (name, archetype, the agent, then the
   * workspace fields); absent when no field can fix it.
   */
  problemField?: CreateProblemField;
  canSubmit: boolean;
}

/** Decides whether the form can be submitted and, if not, the one reason shown in the footer. */
export function createReadiness(input: {
  specId?: string;
  method: string;
  title: string;
  catalogue: DemoCatalogue;
  /** The selected archetype (undefined when the catalogue has none). */
  archetype: ArchetypeInfo | undefined;
  agent: AgentChoice;
  workspaceState: WorkspaceOptionsState;
  choice: WorkspaceChoice;
  configurationUnavailable: boolean;
  forbiddenCreate: boolean;
}): CreateReadiness {
  const { specId, method, title, catalogue, agent, workspaceState, choice, archetype } = input;
  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  const model = provider?.models.find((m) => m.id === agent.modelId);
  const effortFits =
    agent.effort === providerDefaultEffort || Boolean(model?.efforts.includes(agent.effort));
  const workspaceProblem: { message: Message; field?: CreateProblemField } | undefined = specId
    ? undefined
    : workspaceState.status === 'loading'
      ? { message: message('create.prerequisite.workspaceLoading') }
      : workspaceState.status === 'error'
        ? { message: message('create.prerequisite.workspaceError') }
        : workspaceState.status === 'forbidden'
          ? { message: message('create.prerequisite.forbidden') }
          : workspaceProblems(choice, workspaceState.options, title)[0];
  const agentIssue = method === 'ai' ? agentProblem(catalogue, agent) : undefined;
  const canSubmit =
    !input.configurationUnavailable &&
    !input.forbiddenCreate &&
    (Boolean(archetype) || Boolean(specId)) &&
    Boolean(method) &&
    Boolean(specId ?? title.trim()) &&
    !workspaceProblem &&
    (method === 'manual' || (!agentIssue && effortFits));
  // The first problem in the form's own order, so the footer names the field a blocked Create
  // leads to: name, archetype, the agent (right column, first), then where it is created.
  const problem: { message: Message; field?: CreateProblemField } | undefined =
    input.forbiddenCreate
      ? { message: message('create.prerequisite.forbidden') }
      : input.configurationUnavailable
        ? { message: message('create.prerequisite.refreshConfiguration') }
        : !title.trim() && !specId
          ? { message: message('create.prerequisite.title'), field: 'name' }
          : !archetype && !specId
            ? catalogue.archetypes.length === 0
              ? { message: message('create.prerequisite.noArchetypes') }
              : { message: message('create.prerequisite.archetype'), field: 'archetype' }
            : (agentIssue ?? workspaceProblem);

  return {
    prerequisite: problem?.message,
    ...(problem?.field ? { problemField: problem.field } : {}),
    canSubmit,
  };
}

/**
 * The first problem of the agent of a first Session, in the order of its fields: an unavailable
 * provider, a missing model (when the provider lists models), a work mode the choice does not run.
 * The form shows it at that field once Create was tried, and a blocked Create leads there.
 */
export function agentProblem(
  catalogue: DemoCatalogue,
  agent: AgentChoice,
): { message: Message; field: 'provider' | 'model' | 'mode' } | undefined {
  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  const model = provider?.models.find((m) => m.id === agent.modelId);
  // A provider that lists no model has nothing to choose (the start rule): its Session runs the
  // provider's default model, so the modes are the provider's own.
  // (Same predicate as the sessions start rule `offersModelChoice`, which the sessions barrel does not export.)
  const modelChoice = (provider?.models.length ?? 0) > 0;
  const modeIds = modelChoice ? model?.modes : provider?.modes.map((mode) => mode.id);
  if (!provider?.available) {
    return { message: message('create.prerequisite.provider'), field: 'provider' };
  }

  if (modelChoice && !model) {
    return { message: message('create.prerequisite.model'), field: 'model' };
  }

  if (!modeIds?.includes(agent.mode)) {
    return { message: message('create.prerequisite.mode'), field: 'mode' };
  }

  return undefined;
}
