import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { StartCatalogue, StartProvider } from './startCatalogue';

type DemoProvider = DemoCatalogue['providers'][number];

function startProvider(provider: DemoProvider): StartProvider {
  return {
    id: provider.id,
    title: provider.title,
    icon: provider.mark,
    available: provider.available,
    ...(provider.reason ? { reason: provider.reason } : {}),
    ...(provider.connection === 'api' || provider.connection === 'subscription'
      ? { access: provider.connection }
      : {}),
    models: provider.models.map((model) => ({
      id: model.id,
      title: model.title,
      efforts: model.efforts,
      modeIds: model.modes,
    })),
    // The creation catalogue reports no per-mode availability: every listed mode is selectable.
    modes: provider.modes.map((mode) => ({ id: mode.id, title: mode.title, available: true })),
    ...(provider.defaultModeId ? { defaultModeId: provider.defaultModeId } : {}),
  };
}

/** The demo creation catalogue as the start model reads it. */
export function startCatalogueFromDemo(catalogue: DemoCatalogue): StartCatalogue {
  return { demo: catalogue.demo, providers: catalogue.providers.map(startProvider) };
}
