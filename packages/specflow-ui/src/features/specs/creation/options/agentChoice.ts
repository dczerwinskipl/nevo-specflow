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

/** A new model resets the effort and keeps the mode when the model supports it, else prefers Agent. */
export function selectModel(
  choice: AgentChoice,
  provider: Provider | undefined,
  modelId: string,
): AgentChoice {
  const model = provider?.models.find((m) => m.id === modelId);

  return {
    ...choice,
    modelId,
    effort: providerDefaultEffort,
    mode: model?.modes.includes(choice.mode)
      ? choice.mode
      : model?.modes.includes('agent')
        ? 'agent'
        : (model?.modes[0] ?? ''),
  };
}

const modeOrder = ['ask', 'edit', 'agent'];
const modeLabels: Record<string, string> = { ask: 'Ask', edit: 'Edit', agent: 'Agent' };
export const modeLabel = (mode: string): string => modeLabels[mode] ?? mode;

/** Only the modes a model supports, in the canonical order. */
export const supportedModes = (modes: readonly string[]): string[] => [
  ...modeOrder.filter((mode) => modes.includes(mode)),
  ...modes.filter((mode) => !modeOrder.includes(mode)),
];
