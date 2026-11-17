import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { message, type Message } from '../../../../i18n/message';

/**
 * What makes the Runtime see a fix. Every catalogue read re-runs discovery and the sign-in check
 * (a found executable is kept while its file is unchanged, a failed search for 30 s), so
 * `recheck`: **Check again** sees it. The configuration (`.nevo/config.yaml`,
 * `.nevo/local/config.yaml`) is read once, when the Runtime starts, so `restart`: only a restart of
 * Nevo SpecFlow sees it, and the UI cannot restart the Runtime.
 */
export type FixApplies = 'recheck' | 'restart';

/** One way to fix a provider. Messages are rich text: `<code>` and `<strong>` mark code and actions. */
export interface ProviderFix {
  readonly applies: FixApplies;
  /** Names the fix when a provider has more than one. */
  readonly title?: Message;
  readonly text: Message;
  /** A command to run, or a configuration snippet with the file it goes in. */
  readonly code?: { readonly body: string; readonly file?: string };
}

/** Why a provider cannot start, and how to fix it; shown on request. */
export interface ProviderDiagnosis {
  /** The Runtime's own account of what it found, shown as it is (catalogue text). */
  readonly detail?: string;
  /** What was checked or what is known (rich text). */
  readonly found?: Message;
  /** The executable the Runtime ran, when the reason concerns it. */
  readonly executable?: Message;
  /** Every path discovery checked for a CLI it did not find. */
  readonly checkedPaths?: readonly string[];
  /** Empty when nothing on this machine changes it (a provider that cannot run in a worktree). */
  readonly fixes: readonly ProviderFix[];
}

/** What the start screen says about one provider besides its name. */
export interface ProviderAssessment {
  readonly status: Message;
  readonly undetermined?: true;
  readonly diagnosis?: ProviderDiagnosis;
}

type CheckedLocation = NonNullable<ProviderDescriptor['checkedLocations']>[number];

/** The names of the install locations the Runtime reports. */
export const locationNames = {
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

/** The full paths behind the summary, for the diagnosis's disclosure. */
const checkedPath = (location: CheckedLocation): string =>
  location.source === 'path' ? `PATH: ${location.path}` : location.path;

/** The card's status vocabulary: short enough for one line at 375 px and in three columns. */
type StatusName =
  | 'signIn'
  | 'notFound'
  | 'setup'
  | 'turnedOff'
  | 'failsToStart'
  | 'checkFailed'
  | 'incompatible'
  | 'checkUnfinished'
  | 'worktree'
  | 'unknown';

type DiagnosisText =
  | 'genericFix'
  | 'signIn'
  | 'signInAgain'
  | 'notChecked'
  | 'checkInTerminal'
  | 'notAllowed'
  | 'notAllowedFix'
  | 'notEnabled'
  | 'notEnabledFix'
  | 'worktree'
  | 'notFound'
  | 'notFoundConfigured'
  | 'notFoundConfiguredFix'
  | 'launcherBroken'
  | 'reinstallTitle'
  | 'reinstallText'
  | 'installTitle'
  | 'installText'
  | 'pointTitle'
  | 'pointWorkingTitle'
  | 'pointText'
  | 'repairTitle'
  | 'repairText'
  | 'setupUnsupported'
  | 'setupUnsupportedFix'
  | 'protocolUnsupported'
  | 'knownIncompatible'
  | 'knownIncompatibleVersion'
  | 'restrictionUnsupported'
  | 'supportedVersion'
  | 'settlementUnverified'
  | 'settlementFix';

const status = (name: StatusName) => message(`sessionStart.provider.status.${name}`);
const diagnosis = (name: DiagnosisText, values?: Parameters<typeof message>[1]) =>
  message(`sessionStart.diagnosis.${name}`, values);

/**
 * A placeholder path in the style of the machine's own paths (a Windows drive path when discovery
 * reported one), so the snippet reads as something to replace.
 */
function placeholderPath(provider: ProviderDescriptor): string {
  const paths = [
    ...(provider.checkedLocations ?? []).map((location) => location.path),
    provider.executable?.path ?? '',
    provider.unresolvedLauncher?.path ?? '',
  ];

  return paths.some((path) => /^[A-Za-z]:\\/.test(path))
    ? `C:\\path\\to\\${provider.providerId}.exe`
    : `/path/to/${provider.providerId}`;
}

const localConfig = '.nevo/local/config.yaml';

/** Pointing the Runtime at an executable: a YAML snippet, then a restart. */
function pointToExecutable(
  provider: ProviderDescriptor,
  title: 'pointTitle' | 'pointWorkingTitle',
): ProviderFix {
  return {
    applies: 'restart',
    title: diagnosis(title),
    text: diagnosis('pointText'),
    code: {
      file: localConfig,
      body: [
        'sessions:',
        '  providers:',
        `    ${provider.providerId}:`,
        `      executable: ${placeholderPath(provider)}`,
      ].join('\n'),
    },
  };
}

/** The unavailable reasons that concern the executable itself, where its path helps. */
const aboutTheExecutable = new Set<ProviderDescriptor['reasonCode']>([
  'EXECUTABLE_NOT_WORKING',
  'PROTOCOL_UNSUPPORTED',
  'KNOWN_INCOMPATIBILITY',
  'RESTRICTION_UNSUPPORTED',
  'PROBE_FAILED',
]);

/**
 * How the Runtime found the executable it runs, for a reason about that executable; never when the
 * Runtime's own account already names it.
 */
function executableLine(provider: ProviderDescriptor, detail: string | undefined) {
  const executable = provider.executable;
  if (
    !executable ||
    provider.readiness !== 'unavailable' ||
    !aboutTheExecutable.has(provider.reasonCode) ||
    detail?.includes(executable.path)
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

/** Installing a supported build is seen by a recheck. */
const supportedVersion = (provider: string): ProviderFix => ({
  applies: 'recheck',
  text: diagnosis('supportedVersion', { provider }),
});

/**
 * Why an unavailable provider cannot start, from its readiness and reason code: the card's short
 * status, whether the check reached a verdict at all, and the diagnosis with its fixes. `detail` is
 * the Runtime's own reason text; `noMode` the reason a ready provider can run no work mode.
 */
export function assessUnavailable(
  provider: ProviderDescriptor,
  detail: string | undefined,
  noMode: Message | string | undefined,
): ProviderAssessment {
  const name = provider.title;
  const key = `sessions.providers.${provider.providerId}`;
  const executable = executableLine(provider, detail);
  const withDetail = (found: Omit<ProviderDiagnosis, 'detail' | 'executable'>) => ({
    ...(detail ? { detail } : {}),
    ...(executable ? { executable } : {}),
    ...found,
  });

  if (noMode !== undefined) {
    return {
      status: status('setup'),
      diagnosis: {
        ...(typeof noMode === 'string' ? { detail: noMode } : { found: noMode }),
        fixes: [{ applies: 'recheck', text: diagnosis('genericFix') }],
      },
    };
  }

  if (
    provider.readiness === 'authenticationRequired' ||
    provider.reasonCode === 'AUTHENTICATION_REQUIRED'
  ) {
    return {
      status: status('signIn'),
      diagnosis: {
        fixes: [
          provider.signInCommand
            ? {
                applies: 'recheck',
                text: diagnosis('signIn', { provider: name }),
                code: { body: provider.signInCommand },
              }
            : { applies: 'recheck', text: diagnosis('signInAgain', { provider: name }) },
        ],
      },
    };
  }

  if (provider.readiness === 'unknown') {
    return {
      status: status('unknown'),
      undetermined: true,
      diagnosis: withDetail({
        found: diagnosis('notChecked'),
        fixes: [{ applies: 'recheck', text: diagnosis('checkInTerminal', { provider: name }) }],
      }),
    };
  }

  switch (provider.reasonCode) {
    case 'NOT_ALLOWED_BY_PROJECT':
      return {
        status: status('turnedOff'),
        diagnosis: {
          found: diagnosis('notAllowed', { provider: name, key }),
          fixes: [{ applies: 'restart', text: diagnosis('notAllowedFix') }],
        },
      };
    case 'NOT_ENABLED_ON_WORKSTATION':
      return {
        status: status('turnedOff'),
        diagnosis: {
          found: diagnosis('notEnabled', { provider: name, key }),
          fixes: [{ applies: 'restart', text: diagnosis('notEnabledFix') }],
        },
      };
    case 'SPECIFICATION_WORKTREE_UNSUPPORTED':
      return {
        status: status('worktree'),
        diagnosis: { found: diagnosis('worktree', { provider: name }), fixes: [] },
      };
    case 'EXECUTABLE_NOT_FOUND': {
      const checked = provider.checkedLocations ?? [];
      const configured = checked.find((location) => location.source === 'configured');
      if (configured) {
        return {
          status: status('notFound'),
          diagnosis: {
            found: diagnosis('notFoundConfigured', { path: configured.path }),
            fixes: [{ applies: 'restart', text: diagnosis('notFoundConfiguredFix', { key }) }],
          },
        };
      }

      const paths = checked.filter((location) => location.source !== 'configured').map(checkedPath);
      const launcher = provider.unresolvedLauncher;
      if (launcher) {
        return {
          status: status('setup'),
          diagnosis: {
            found: diagnosis('launcherBroken', { package: launcher.package }),
            checkedPaths: [launcher.path, ...paths],
            fixes: [
              {
                applies: 'recheck',
                title: diagnosis('reinstallTitle'),
                text: diagnosis('reinstallText'),
                code: { body: `npm install -g ${launcher.package}` },
              },
              pointToExecutable(provider, 'pointTitle'),
            ],
          },
        };
      }

      return {
        status: status('notFound'),
        diagnosis: {
          found: diagnosis('notFound', { sources: checkedSources(checked) }),
          ...(paths.length ? { checkedPaths: paths } : {}),
          fixes: [
            {
              applies: 'recheck',
              title: diagnosis('installTitle'),
              text: diagnosis('installText', { provider: name }),
            },
            pointToExecutable(provider, 'pointTitle'),
          ],
        },
      };
    }

    case 'EXECUTABLE_NOT_WORKING':
      return {
        status: status('failsToStart'),
        diagnosis: withDetail({
          fixes: [
            {
              applies: 'recheck',
              title: diagnosis('repairTitle'),
              text: diagnosis('repairText', { provider: name }),
            },
            pointToExecutable(provider, 'pointWorkingTitle'),
          ],
        }),
      };
    case 'INSTALLATION_UNAVAILABLE':
      return {
        status: status('setup'),
        diagnosis: withDetail({
          found: diagnosis('setupUnsupported'),
          fixes: [{ applies: 'recheck', text: diagnosis('setupUnsupportedFix') }],
        }),
      };
    case 'PROTOCOL_UNSUPPORTED':
      return {
        status: status('incompatible'),
        diagnosis: withDetail({
          found: diagnosis('protocolUnsupported'),
          fixes: [supportedVersion(name)],
        }),
      };
    case 'KNOWN_INCOMPATIBILITY': {
      const version = provider.executable?.version ?? provider.compatibility?.version;

      return {
        status: status('incompatible'),
        diagnosis: withDetail({
          found: version
            ? diagnosis('knownIncompatibleVersion', { version })
            : diagnosis('knownIncompatible'),
          fixes: [supportedVersion(name)],
        }),
      };
    }

    case 'RESTRICTION_UNSUPPORTED':
      return {
        status: status('incompatible'),
        diagnosis: withDetail({
          found: diagnosis('restrictionUnsupported'),
          fixes: [supportedVersion(name)],
        }),
      };
    case 'PROCESS_SETTLEMENT_UNVERIFIED':
      return {
        status: status('checkUnfinished'),
        undetermined: true,
        diagnosis: {
          found: diagnosis('settlementUnverified', { provider: name }),
          fixes: [{ applies: 'recheck', text: diagnosis('settlementFix', { provider: name }) }],
        },
      };
    case 'PROBE_FAILED':
      return {
        status: status('checkFailed'),
        undetermined: true,
        diagnosis: withDetail({
          fixes: [{ applies: 'recheck', text: diagnosis('checkInTerminal', { provider: name }) }],
        }),
      };
    case undefined:
      return {
        status: status('unknown'),
        undetermined: true,
        diagnosis: withDetail({
          ...(detail ? {} : { found: diagnosis('notChecked') }),
          fixes: [{ applies: 'recheck', text: diagnosis('checkInTerminal', { provider: name }) }],
        }),
      };
  }
}
