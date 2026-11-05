import { message, type Message } from '../../../../i18n/message';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import {
  chosenAgent,
  offersModelChoice,
  providerDefaultEffort,
  selectableModes,
  type AgentChoice,
} from './agentChoice';
import { sessionNameMissing, type SessionNameChoice } from './sessionName';

export interface NewSessionReadiness {
  /** The first reason the Session cannot start yet (shown next to Start), else undefined. */
  prerequisite: Message | undefined;
  canStart: boolean;
}

/**
 * Whether a new Session can start and, if not, the one reason shown next to the start button. In
 * the order the form is read: configuration, agent, model, mode, effort, custom name. The first
 * message is written in the Session itself, so it is no prerequisite. A provider that offers no
 * model choice needs no model.
 */
export function newSessionReadiness(input: {
  catalogue: StartCatalogue;
  agent: AgentChoice;
  name: SessionNameChoice;
  configurationUnavailable: boolean;
}): NewSessionReadiness {
  const { catalogue, agent } = input;
  const { provider, model } = chosenAgent(catalogue, agent);
  const prerequisite: Message | undefined = input.configurationUnavailable
    ? message('create.prerequisite.refreshConfiguration')
    : !catalogue.providers.some((p) => p.available)
      ? message('sessionStart.prerequisite.noProvider')
      : !provider?.available
        ? message('create.prerequisite.provider')
        : offersModelChoice(provider) && !model
          ? message('create.prerequisite.model')
          : !selectableModes(provider, model).some((mode) => mode.id === agent.mode)
            ? message('create.prerequisite.mode')
            : agent.effort !== providerDefaultEffort && !model?.efforts.includes(agent.effort)
              ? message('create.prerequisite.model')
              : sessionNameMissing(input.name)
                ? message('sessionStart.prerequisite.name')
                : undefined;

  return { prerequisite, canStart: !prerequisite };
}
