import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';

/** The agent configuration of the initial Session: what the user picked in the Agent section. */
export interface AgentChoice {
  providerId: string;
  modelId: string;
  /** `provider-default` or one of the model's efforts. */
  effort: string;
  mode: string;
}

export const providerDefaultEffort = 'provider-default';

export function initialAgentChoice(catalogue: DemoCatalogue): AgentChoice {
  return {
    providerId: catalogue.providers.find((p) => p.available)?.id ?? '',
    modelId: '',
    effort: providerDefaultEffort,
    mode: '',
  };
}

type Provider = DemoCatalogue['providers'][number];

/** Changing the provider invalidates everything chosen below it. */
export function selectProvider(choice: AgentChoice, providerId: string): AgentChoice {
  return { ...choice, providerId, modelId: '', effort: providerDefaultEffort, mode: '' };
}

type Model = Provider['models'][number];

/**
 * The provider's work modes the model can run, in the provider catalogue's own order (the Runtime
 * is the source of truth for which modes exist and what they are called). A model id the provider
 * does not describe is left out: there is nothing to call it.
 */
export const supportedModes = (
  provider: Provider | undefined,
  model: Model | undefined,
): Provider['modes'] =>
  model ? (provider?.modes ?? []).filter((mode) => model.modes.includes(mode.id)) : [];

/**
 * A new model resets the effort and keeps the mode when the model supports it, else takes the
 * provider's `defaultModeId` when the model supports that, else the model's first mode.
 */
export function selectModel(
  choice: AgentChoice,
  provider: Provider | undefined,
  modelId: string,
): AgentChoice {
  const modes = supportedModes(
    provider,
    provider?.models.find((m) => m.id === modelId),
  ).map((mode) => mode.id);

  return {
    ...choice,
    modelId,
    effort: providerDefaultEffort,
    mode: modes.includes(choice.mode)
      ? choice.mode
      : provider?.defaultModeId && modes.includes(provider.defaultModeId)
        ? provider.defaultModeId
        : (modes[0] ?? ''),
  };
}
