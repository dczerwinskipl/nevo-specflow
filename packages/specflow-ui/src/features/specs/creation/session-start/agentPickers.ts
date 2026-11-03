import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ModelEffortProvider, ModelEffortValue, WorkModeOption } from '../../../sessions';
import {
  providerDefaultEffort,
  selectModel,
  supportedModes,
  type AgentChoice,
} from '../options/agentChoice';

type Provider = DemoCatalogue['providers'][number];

/**
 * The creation catalogue's provider as the Composer's Model · Effort picker reads it. The catalogue
 * always lets the start screen pick a model and (where the model has any) an effort.
 */
export function pickerProvider(provider: Provider | undefined): ModelEffortProvider | undefined {
  return provider
    ? {
        capabilities: { modelOverride: true, effortOverride: true },
        models: provider.models.map((model) => ({
          modelId: model.id,
          title: model.title,
          efforts: model.efforts,
        })),
      }
    : undefined;
}

export function modelEffortValue(choice: AgentChoice): ModelEffortValue | undefined {
  return choice.modelId
    ? {
        modelId: choice.modelId,
        effort: choice.effort === providerDefaultEffort ? undefined : choice.effort,
      }
    : undefined;
}

/**
 * A model pick goes through `selectModel` (keeps a supported mode, else the provider's default
 * mode, resets the effort to the provider default); an effort pick on the same model only changes
 * the effort.
 */
export function applyModelEffort(
  choice: AgentChoice,
  provider: Provider | undefined,
  modelId: string,
  effort: string | undefined,
): AgentChoice {
  const next = modelId === choice.modelId ? choice : selectModel(choice, provider, modelId);

  return { ...next, effort: effort ?? providerDefaultEffort };
}

/**
 * The selected model's work modes as the Composer's work-mode picker reads them: the provider
 * catalogue's own ids and titles, in catalogue order (see `supportedModes`). The creation
 * catalogue reports no per-mode availability, so every listed mode is selectable.
 */
export function pickerModes(provider: Provider | undefined, modelId: string): WorkModeOption[] {
  const model = provider?.models.find((m) => m.id === modelId);

  return supportedModes(provider, model).map((mode) => ({ id: mode.id, title: mode.title }));
}

/** The chosen mode id; none (the placeholder) before a model decides which modes exist. */
export const modeValue = (choice: AgentChoice): string | undefined => choice.mode || undefined;
