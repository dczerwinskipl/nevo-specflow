import type {
  StartCatalogue,
  StartMode,
  StartModel,
  StartProvider,
} from '../catalogue/startCatalogue';

/** The agent configuration of the new Session: what the user picked in the Agent fields. */
export interface AgentChoice {
  providerId: string;
  /** Empty before a model is chosen, and for a provider that offers no model choice. */
  modelId: string;
  /** `provider-default` or one of the model's efforts. */
  effort: string;
  /** A mode id of the provider's catalogue; empty while nothing selectable decides it. */
  mode: string;
}

export const providerDefaultEffort = 'provider-default';

/** A provider that lists no model has nothing to choose: its Session starts at the default model. */
export const offersModelChoice = (provider: StartProvider | undefined): boolean =>
  (provider?.models.length ?? 0) > 0;

/**
 * The provider's modes the chosen model can run, in the catalogue's own order (the Runtime is the
 * source of truth for which modes exist and what they are called). A mode id the provider does not
 * describe is left out: there is nothing to call it. Before a model decides it (and while the
 * provider offers a model choice) the provider's whole list is shown, for a stable layout.
 */
export function listedModes(
  provider: StartProvider | undefined,
  model: StartModel | undefined,
): readonly StartMode[] {
  if (!provider) {
    return [];
  }

  return model ? provider.modes.filter((mode) => model.modeIds.includes(mode.id)) : provider.modes;
}

/** The modes that can be chosen now: listed, available and decided (a model chosen, or none to choose). */
export function selectableModes(
  provider: StartProvider | undefined,
  model: StartModel | undefined,
): readonly StartMode[] {
  return model || !offersModelChoice(provider)
    ? listedModes(provider, model).filter((mode) => mode.available)
    : [];
}

/**
 * The mode a Session starts in: the current one when it is still selectable, else the provider's
 * `defaultModeId` when selectable, else the first selectable mode.
 */
function chooseMode(
  current: string,
  provider: StartProvider | undefined,
  model: StartModel | undefined,
): string {
  const ids = selectableModes(provider, model).map((mode) => mode.id);

  return ids.includes(current)
    ? current
    : provider?.defaultModeId && ids.includes(provider.defaultModeId)
      ? provider.defaultModeId
      : (ids[0] ?? '');
}

/** Changing the provider invalidates everything chosen below it. */
export function selectProvider(
  choice: AgentChoice,
  provider: StartProvider | undefined,
): AgentChoice {
  return {
    ...choice,
    providerId: provider?.id ?? '',
    modelId: '',
    effort: providerDefaultEffort,
    mode: chooseMode('', provider, undefined),
  };
}

/** The first available provider with nothing below it chosen. */
export function initialAgentChoice(catalogue: StartCatalogue): AgentChoice {
  return selectProvider(
    { providerId: '', modelId: '', effort: providerDefaultEffort, mode: '' },
    catalogue.providers.find((provider) => provider.available),
  );
}

/** A new model resets the effort and keeps the mode when the model runs it, else takes the default one. */
export function selectModel(
  choice: AgentChoice,
  provider: StartProvider | undefined,
  modelId: string,
): AgentChoice {
  const model = provider?.models.find((m) => m.id === modelId);

  return {
    ...choice,
    modelId,
    effort: providerDefaultEffort,
    mode: chooseMode(choice.mode, provider, model),
  };
}

/** The chosen provider, model and mode, as the catalogue describes them. */
export function chosenAgent(catalogue: StartCatalogue, choice: AgentChoice) {
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);
  const model = provider?.models.find((m) => m.id === choice.modelId);
  const mode = provider?.modes.find((m) => m.id === choice.mode);

  return { provider, model, mode };
}
