import type { Message } from '../../../../i18n/message';
import type { StartProvider } from '../catalogue/startCatalogue';
import type { ModelEffortProvider, ModelEffortValue } from '../../managed/ModelEffortPicker';
import type { WorkModeOption } from '../../managed/workModes';
import { providerDefaultEffort, listedModes, selectModel, type AgentChoice } from './agentChoice';

/**
 * The provider as the Composer's Model · Effort picker reads it. The start catalogue always lets
 * the start screen pick a model and (where the model has any) an effort.
 */
export function pickerProvider(
  provider: StartProvider | undefined,
): ModelEffortProvider | undefined {
  return provider
    ? {
        capabilities: { modelOverride: true, effortOverride: true },
        models: provider.models.map((model) => ({
          modelId: model.id,
          title: model.title,
          efforts: [...model.efforts],
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
  provider: StartProvider | undefined,
  modelId: string,
  effort: string | undefined,
): AgentChoice {
  const next = modelId === choice.modelId ? choice : selectModel(choice, provider, modelId);

  return { ...next, effort: effort ?? providerDefaultEffort };
}

/**
 * The selected model's work modes as the Composer's work-mode picker reads them: the provider
 * catalogue's own ids and titles, in catalogue order, an unavailable mode disabled with its reason.
 */
export function pickerModes(
  provider: StartProvider | undefined,
  modelId: string,
  text: (title: Message | string) => string,
): WorkModeOption[] {
  const model = provider?.models.find((m) => m.id === modelId);

  return (model ? listedModes(provider, model) : []).map((mode) => ({
    id: mode.id,
    title: text(mode.title),
    ...(mode.available ? {} : { disabled: true, ...(mode.reason ? { reason: mode.reason } : {}) }),
  }));
}

/** The chosen mode id; none (the placeholder) before a model decides which modes exist. */
export const modeValue = (choice: AgentChoice): string | undefined => choice.mode || undefined;
