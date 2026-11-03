import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { message, type Message } from '../../../../i18n/message';
import { providerDefaultEffort, type AgentChoice } from '../options/agentChoice';
import { sessionNameMissing, type SessionNameChoice } from '../session-start/sessionName';

export interface NewSessionReadiness {
  /** The first reason the Session cannot start yet (shown in the footer), else undefined. */
  prerequisite: Message | undefined;
  canStart: boolean;
}

/**
 * Whether a new Session can start and, if not, the one reason shown next to the start button. In
 * the order the page is read: configuration, agent, model, mode, first message, custom name.
 */
export function newSessionReadiness(input: {
  catalogue: DemoCatalogue;
  agent: AgentChoice;
  message: string;
  name: SessionNameChoice;
  configurationUnavailable: boolean;
}): NewSessionReadiness {
  const { catalogue, agent } = input;
  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  const model = provider?.models.find((m) => m.id === agent.modelId);
  const prerequisite: Message | undefined = input.configurationUnavailable
    ? message('create.prerequisite.refreshConfiguration')
    : !catalogue.providers.some((p) => p.available)
      ? message('sessionStart.prerequisite.noProvider')
      : !provider?.available
        ? message('create.prerequisite.provider')
        : !model
          ? message('create.prerequisite.model')
          : !model.modes.includes(agent.mode)
            ? message('create.prerequisite.mode')
            : agent.effort !== providerDefaultEffort && !model.efforts.includes(agent.effort)
              ? message('create.prerequisite.model')
              : !input.message.trim()
                ? message('sessionStart.prerequisite.message')
                : sessionNameMissing(input.name)
                  ? message('sessionStart.prerequisite.name')
                  : undefined;

  return { prerequisite, canStart: !prerequisite };
}
