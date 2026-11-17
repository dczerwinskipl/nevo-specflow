import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { message, type Message } from '../../../../i18n/message';
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

const configKey = (provider: ProviderDescriptor) => `sessions.providers.${provider.providerId}`;

/**
 * Withheld by configuration: the project does not allow the provider, or this machine turned it
 * off. Each says who changes what, in which file.
 */
function configurationPolicy(provider: ProviderDescriptor) {
  if (provider.reasonCode === 'NOT_ALLOWED_BY_PROJECT') {
    return {
      reason: message('sessionStart.provider.notAllowed'),
      hint: message('sessionStart.provider.notAllowedHelp', { key: configKey(provider) }),
    };
  }

  if (provider.reasonCode === 'NOT_ENABLED_ON_WORKSTATION') {
    return {
      reason: message('sessionStart.provider.notEnabled'),
      hint: message('sessionStart.provider.notEnabledHelp', { key: configKey(provider) }),
    };
  }

  return undefined;
}

type CheckedLocation = NonNullable<ProviderDescriptor['checkedLocations']>[number];

/** The names of the install locations the Runtime reports. */
const locationNames = {
  'codex-desktop-app': message('sessionStart.provider.location.codex-desktop-app'),
  'claude-native-installer': message('sessionStart.provider.location.claude-native-installer'),
  'antigravity-installer': message('sessionStart.provider.location.antigravity-installer'),
  'npm-global-package': message('sessionStart.provider.location.npm-global-package'),
} as const;

/** Each kind of place discovery looked, once and in order: PATH, then the install locations. */
function checkedSources(checked: readonly CheckedLocation[]): Message[] {
  const sources: Message[] = [];
  const seen = new Set<string>();
  for (const location of checked) {
    const id = location.source === 'path' ? 'path' : location.location;
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    sources.push(
      id === 'path' ? message('sessionStart.provider.location.path') : locationNames[id],
    );
  }

  return sources;
}

/** The full paths behind the summary, for the tile's disclosure. */
const checkedPath = (location: CheckedLocation): string =>
  location.source === 'path' ? `PATH: ${location.path}` : location.path;

/**
 * Why an enabled provider cannot start, from its reason code: a short status for the tile and what
 * the user can do, with the Runtime's own account of what it found (`reason`) as the detail.
 */
function readinessExplanation(
  provider: ProviderDescriptor,
  detail: string | undefined,
): { reason: Message; hint: Message } | undefined {
  if (provider.readiness === 'authenticationRequired') {
    return {
      reason: message('managedSession.authenticationRequired'),
      hint: provider.signInCommand
        ? message('sessionStart.provider.signInHelp', { command: provider.signInCommand })
        : message('managedSession.authenticationHelp'),
    };
  }

  if (provider.readiness !== 'unavailable' || provider.providerId === 'mock') {
    return undefined;
  }

  const key = configKey(provider);
  const explained = (name: ExplainedReason, values: Record<string, string> = {}) => ({
    reason: message(`sessionStart.provider.${name}`),
    hint: message(`sessionStart.provider.${name}Help`, { key, detail: detail ?? '', ...values }),
  });
  switch (provider.reasonCode) {
    case 'EXECUTABLE_NOT_FOUND': {
      const checked = provider.checkedLocations ?? [];
      const configured = checked.find((location) => location.source === 'configured');
      if (configured) {
        return {
          reason: message('sessionStart.provider.notFound'),
          hint: message('sessionStart.provider.notFoundConfiguredHelp', {
            key,
            path: configured.path,
          }),
        };
      }

      const launcher = provider.unresolvedLauncher;
      if (launcher) {
        return {
          reason: message('sessionStart.provider.launcherBroken'),
          hint: message('sessionStart.provider.launcherBrokenHelp', {
            key,
            package: launcher.package,
          }),
        };
      }

      return {
        reason: message('sessionStart.provider.notFound'),
        hint: message('sessionStart.provider.notFoundHelp', {
          key,
          sources: checkedSources(checked),
        }),
      };
    }

    case 'EXECUTABLE_NOT_WORKING':
      return explained('notWorking');
    case 'INSTALLATION_UNAVAILABLE':
      return explained('setupUnsupported');
    case 'PROTOCOL_UNSUPPORTED':
      return explained('protocolUnsupported');
    case 'KNOWN_INCOMPATIBILITY':
      return explained('knownIncompatible');
    case 'RESTRICTION_UNSUPPORTED':
      return explained('restrictionUnsupported');
    case 'PROCESS_SETTLEMENT_UNVERIFIED':
      return explained('settlementUnverified');
    case 'PROBE_FAILED':
    case undefined:
      return detail
        ? explained('probeFailed')
        : {
            reason: message('sessionStart.provider.notReady'),
            hint: message('sessionStart.provider.notReadyHelp', { key }),
          };
    default:
      return undefined;
  }
}

type ExplainedReason =
  | 'notFound'
  | 'notWorking'
  | 'setupUnsupported'
  | 'protocolUnsupported'
  | 'knownIncompatible'
  | 'restrictionUnsupported'
  | 'settlementUnverified'
  | 'probeFailed';

/** The unavailable reasons that concern the executable itself, where its path helps. */
const aboutTheExecutable = new Set<ProviderDescriptor['reasonCode']>([
  'EXECUTABLE_NOT_WORKING',
  'PROTOCOL_UNSUPPORTED',
  'KNOWN_INCOMPATIBILITY',
  'RESTRICTION_UNSUPPORTED',
  'PROBE_FAILED',
]);

/**
 * How the Runtime found the executable it runs: for a ready provider, one that needs sign-in, or
 * one unavailable because of that executable; never when the Runtime's reason already names it.
 */
function executableLine(provider: ProviderDescriptor, detail: string | undefined) {
  const executable = provider.executable;
  const relevant =
    provider.readiness === 'ready' ||
    provider.readiness === 'authenticationRequired' ||
    (provider.readiness === 'unavailable' && aboutTheExecutable.has(provider.reasonCode));
  // A reason or sign-in command that already names the path says it once.
  if (
    !executable ||
    !relevant ||
    detail?.includes(executable.path) ||
    (provider.readiness === 'authenticationRequired' &&
      provider.signInCommand?.includes(executable.path))
  ) {
    return undefined;
  }

  if (executable.location) {
    return message('sessionStart.provider.executable.discovered', {
      path: executable.path,
      location: locationNames[executable.location],
    });
  }

  return message(
    executable.source === 'configured'
      ? 'sessionStart.provider.executable.configured'
      : 'sessionStart.provider.executable.path',
    { path: executable.path },
  );
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
  // Read for a Specification in its own worktree: the tile says it briefly; the provider choice
  // explains what, why and what to do once for every such provider.
  const worktreeUnsupported = provider.reasonCode === 'SPECIFICATION_WORKTREE_UNSUPPORTED';
  const policy = configurationPolicy(provider);
  const explanation = policy ? undefined : readinessExplanation(provider, given);
  const reason = worktreeUnsupported
    ? message('sessionStart.provider.worktreeUnsupported')
    : (policy?.reason ??
      noMode ??
      explanation?.reason ??
      given ??
      (provider.providerId === 'mock' ? message('managedSession.mockNote') : undefined));
  const hint = worktreeUnsupported ? undefined : (policy?.hint ?? explanation?.hint);
  const executable = executableLine(provider, given);
  const checkedPaths =
    provider.readiness === 'unavailable' &&
    provider.reasonCode === 'EXECUTABLE_NOT_FOUND' &&
    !worktreeUnsupported &&
    !policy
      ? [
          // The launcher that made the CLI look installed comes first.
          ...(provider.unresolvedLauncher ? [provider.unresolvedLauncher.path] : []),
          ...(provider.checkedLocations ?? [])
            .filter((location) => location.source !== 'configured')
            .map(checkedPath),
        ]
      : [];

  return {
    id: provider.providerId,
    title: provider.title,
    icon: provider.providerId,
    available: startable,
    ...(reason ? { reason } : {}),
    ...(hint ? { hint } : {}),
    ...(executable ? { executable } : {}),
    ...(checkedPaths.length ? { checkedPaths } : {}),
    ...(worktreeUnsupported ? { unavailableInWorktree: true } : {}),
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
