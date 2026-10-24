import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../../i18n/message';
import { providerDefaultEffort, type AgentChoice } from '../options/agentChoice';
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
        model?.modes.includes(agent.mode) &&
        (agent.effort === providerDefaultEffort || model.efforts.includes(agent.effort)),
      ));
  const prerequisite = input.forbiddenCreate
    ? message('create.prerequisite.forbidden')
    : input.configurationUnavailable
      ? message('create.prerequisite.refreshConfiguration')
      : !title.trim() && !specId
        ? message('create.prerequisite.title')
        : !archetype && !specId
          ? message('create.prerequisite.archetype')
          : (workspaceProblem ??
            (method === 'ai'
              ? !provider?.available
                ? message('create.prerequisite.provider')
                : !model
                  ? message('create.prerequisite.model')
                  : !model.modes.includes(agent.mode)
                    ? message('create.prerequisite.mode')
                    : undefined
              : undefined));
  return { prerequisite, canSubmit };
}
