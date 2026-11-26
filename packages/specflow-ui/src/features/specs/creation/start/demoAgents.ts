import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { startCatalogueFromDemo } from '../../../sessions';
import type { AgentCatalogue, FreshChoice } from '../../../tasks';

type DemoProvider = DemoCatalogue['providers'][number];

/**
 * The demo creation catalogue as the agent picker of Run with agent reads it (`AgentSession`): the
 * start model from the demo catalogue and, for the model picker, each provider's models and efforts.
 * The demo is the same picker over its own data, not a second one.
 */
export function demoAgentCatalogue(catalogue: DemoCatalogue): AgentCatalogue {
  return {
    status: 'ready',
    catalogue: startCatalogueFromDemo(catalogue),
    providers: catalogue.providers.map((provider): ProviderDescriptor => ({
      providerId: provider.id,
      title: provider.title,
      readiness: provider.available ? 'ready' : 'unavailable',
      ...(provider.reason ? { reason: provider.reason } : {}),
      capabilities: {
        questions: false,
        permissions: false,
        cancel: false,
        resume: false,
        modelOverride: provider.models.length > 0,
        effortOverride: provider.models.some((model) => model.efforts.length > 0),
      },
      models: provider.models.map((model) => ({
        modelId: model.id,
        title: model.title,
        efforts: [...model.efforts],
      })),
      modes: ['read-only'],
    })),
  };
}

/** The first agent that can start, with its first model: the demo form's initial choice. */
export function initialDemoAgent(catalogue: DemoCatalogue): FreshChoice {
  const provider = catalogue.providers.find((candidate) => candidate.available);

  return { providerId: provider?.id ?? '', modelId: provider?.models[0]?.id ?? '' };
}

/**
 * The work mode a demo Session of this choice starts in: the provider's default when the model runs
 * it, else the model's first mode (a provider without models: its own first mode). Shown as the
 * work-mode sentence, as Run with agent shows the Runtime's choice; it is not a setting.
 */
export function demoWorkMode(
  catalogue: DemoCatalogue,
  choice: FreshChoice,
): DemoProvider['modes'][number] | undefined {
  const provider = catalogue.providers.find((candidate) => candidate.id === choice.providerId);
  if (!provider) {
    return undefined;
  }

  const model = provider.models.find((candidate) => candidate.id === choice.modelId);
  const runnable =
    provider.models.length > 0 ? (model?.modes ?? []) : provider.modes.map((mode) => mode.id);
  const id =
    provider.defaultModeId && runnable.includes(provider.defaultModeId)
      ? provider.defaultModeId
      : runnable[0];

  return provider.modes.find((mode) => mode.id === id);
}
