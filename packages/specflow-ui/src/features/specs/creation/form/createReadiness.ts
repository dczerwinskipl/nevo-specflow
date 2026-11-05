import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../../i18n/message';
import { providerDefaultEffort, type AgentChoice } from '../../../sessions';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';
import { problems as workspaceProblems } from '../workspace/model/workspaceValidation';
import { type WorkspaceChoice } from '../workspace/model/workspaceChoice';

export interface CreateReadiness {
  /** Why Create is not available yet (first blocking reason), else undefined. */
  prerequisite: Message | undefined;
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
  // A provider that lists no model has nothing to choose (the start rule): its Session runs the
  // provider's default model, so the modes are the provider's own and only the default effort fits.
  // (Same predicate as the sessions start rule `offersModelChoice`, which the sessions barrel does not export.)
  const modelChoice = (provider?.models.length ?? 0) > 0;
  const modeIds = modelChoice ? model?.modes : provider?.modes.map((mode) => mode.id);
  const effortFits =
    agent.effort === providerDefaultEffort || Boolean(model?.efforts.includes(agent.effort));
  const workspaceProblem: Message | undefined = specId
    ? undefined
    : workspaceState.status === 'loading'
      ? message('create.prerequisite.workspaceLoading')
      : workspaceState.status === 'error'
        ? message('create.prerequisite.workspaceError')
        : workspaceState.status === 'forbidden'
          ? message('create.prerequisite.forbidden')
          : workspaceProblems(choice, workspaceState.options, title)[0];
  const canSubmit =
    !input.configurationUnavailable &&
    !input.forbiddenCreate &&
    (Boolean(archetype) || Boolean(specId)) &&
    Boolean(method) &&
    Boolean(specId ?? title.trim()) &&
    !workspaceProblem &&
    (method === 'manual' ||
      Boolean(
        provider?.available &&
        (!modelChoice || model) &&
        modeIds?.includes(agent.mode) &&
        effortFits,
      ));
  const prerequisite = input.forbiddenCreate
    ? message('create.prerequisite.forbidden')
    : input.configurationUnavailable
      ? message('create.prerequisite.refreshConfiguration')
      : !title.trim() && !specId
        ? message('create.prerequisite.title')
        : !archetype && !specId
          ? catalogue.archetypes.length === 0
            ? message('create.prerequisite.noArchetypes')
            : message('create.prerequisite.archetype')
          : (workspaceProblem ??
            (method === 'ai'
              ? !provider?.available
                ? message('create.prerequisite.provider')
                : modelChoice && !model
                  ? message('create.prerequisite.model')
                  : !modeIds?.includes(agent.mode)
                    ? message('create.prerequisite.mode')
                    : undefined
              : undefined));

  return { prerequisite, canSubmit };
}
