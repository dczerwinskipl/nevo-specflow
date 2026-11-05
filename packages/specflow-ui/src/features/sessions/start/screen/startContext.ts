import type { StartCatalogue } from '../catalogue/startCatalogue';
import { chosenAgent, providerDefaultEffort, type AgentChoice } from '../choice/agentChoice';
import type { StartCatalogueState } from '../source/sessionStartSource';
import type {
  ContextFact,
  ContextSpecification,
  SessionContextViewModel,
  SessionExecutor,
} from '../../managed/context/sessionContextTypes';

function executorOf(
  state: StartCatalogueState,
  choice: AgentChoice,
  notChosen: string,
): ContextFact<SessionExecutor> {
  if (state.status === 'loading') {
    return { status: 'loading' };
  }

  if (state.status === 'error') {
    return { status: 'unreadable' };
  }

  const { provider, model } = chosenAgent(state.catalogue, choice);
  if (!provider) {
    return {
      status: 'ready',
      value: { providerId: '', providerTitle: notChosen },
    };
  }

  return {
    status: 'ready',
    value: {
      providerId: provider.icon ?? provider.id,
      providerTitle: provider.title,
      // The model is a deliberate choice: "not chosen" stands in until there is one (a provider
      // that offers no model choice has none to show).
      modelTitle: provider.models.length > 0 ? (model?.title ?? notChosen) : undefined,
      effort: model && choice.effort !== providerDefaultEffort ? choice.effort : undefined,
    },
  };
}

/**
 * Context of the Session being started: the pinned Specification when there is one (else no
 * association), and the executor mirroring the choice as it is made. Sections that exist only after
 * the first Turn are absent, so Start changes nothing in Context but the executor's state.
 */
export function startContextValue(input: {
  catalogue: StartCatalogueState;
  choice: AgentChoice;
  specification?: ContextFact<ContextSpecification>;
  notChosen: string;
}): SessionContextViewModel {
  return {
    scope: input.specification ? { kind: 'specification' } : { kind: 'standalone' },
    ...(input.specification ? { specification: input.specification } : {}),
    executor: executorOf(input.catalogue, input.choice, input.notChosen),
  };
}

/** The catalogue of a ready source, else undefined. */
export const readyCatalogue = (state: StartCatalogueState): StartCatalogue | undefined =>
  state.status === 'ready' ? state.catalogue : undefined;
