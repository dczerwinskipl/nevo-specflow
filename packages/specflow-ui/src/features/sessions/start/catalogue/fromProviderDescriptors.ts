import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { message } from '../../../../i18n/message';
import type { StartCatalogue, StartMode, StartProvider } from './startCatalogue';

const safetyModeTitles = {
  'read-only': message('sessionStart.modes.readOnly'),
  'workspace-write': message('sessionStart.modes.workspaceWrite'),
} as const;

/**
 * The modes a Session can start in: the provider's own `providerModes` when it lists them (a mode
 * is selectable only when the provider reports it ready, does not deny authorization and its
 * engine safety mode is one the provider currently offers), else the engine's safety modes
 * under their generic names.
 */
function startModes(provider: ProviderDescriptor): StartMode[] {
  if (provider.providerModes) {
    return provider.providerModes.map((mode) => {
      const available =
        mode.readiness === 'ready' &&
        mode.authorized !== false &&
        provider.modes.includes(mode.mode);

      return {
        id: mode.modeId,
        title: mode.title,
        available,
        ...(!available && mode.reason ? { reason: mode.reason } : {}),
      };
    });
  }

  return provider.modes.map((mode) => ({
    id: mode,
    title: safetyModeTitles[mode],
    available: true,
  }));
}

function startProvider(provider: ProviderDescriptor): StartProvider {
  const modes = startModes(provider);
  const { modelOverride, effortOverride } = provider.capabilities;
  const trimmed = provider.reason?.trim();
  const given = trimmed === '' ? undefined : trimmed;
  // Available means startable: a ready provider that can run no work mode cannot start a Session
  // (without modes of its own only the read-only safety mode is executable).
  const startable =
    provider.readiness === 'ready' &&
    (provider.providerModes
      ? modes.some((mode) => mode.available)
      : provider.modes.includes('read-only'));
  const noMode =
    provider.readiness === 'ready' && !startable
      ? (modes.find((mode) => !mode.available && mode.reason)?.reason ??
        message('sessionStart.provider.noMode'))
      : undefined;
  const reason =
    noMode ??
    given ??
    (provider.readiness === 'authenticationRequired'
      ? message('managedSession.authenticationRequired')
      : provider.providerId === 'mock'
        ? message('managedSession.mockNote')
        : undefined);

  return {
    id: provider.providerId,
    title: provider.title,
    icon: provider.providerId,
    available: startable,
    ...(reason ? { reason } : {}),
    ...(provider.readiness === 'authenticationRequired'
      ? { hint: message('managedSession.authenticationHelp') }
      : {}),
    // A provider that does not accept a model (or an effort) override has nothing to choose: the
    // Session starts at its default.
    models: modelOverride
      ? provider.models.map((model) => ({
          id: model.modelId,
          title: model.title,
          efforts: effortOverride ? model.efforts : [],
          modeIds: modes.map((mode) => mode.id),
        }))
      : [],
    modes,
    ...(provider.defaultModeId ? { defaultModeId: provider.defaultModeId } : {}),
  };
}

/** The managed Runtime's provider catalogue as the start model reads it. */
export function startCatalogueFromProviders(
  providers: readonly ProviderDescriptor[],
): StartCatalogue {
  return { demo: false, providers: providers.map(startProvider) };
}
