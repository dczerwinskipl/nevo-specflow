import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import {
  antigravityDescriptor,
  claudeDescriptor,
  codexNotFound,
  managedProviders,
} from '../../features/sessions/start/catalogue/providerDescriptors.stories-support';

/** The four reviewed states; `expanded` is `one-unavailable` with its diagnostics open. */
export type NewSessionState =
  | 'all-available'
  | 'one-unavailable'
  | 'none-available'
  /** The longest short statuses on every card (readability at 375 and in three columns). */
  | 'longest-statuses';
export type MockLocale = 'pl' | 'en';

/** The Runtime catalogue of each state, from the production story fixtures. */
export function providersFor(state: NewSessionState): ProviderDescriptor[] {
  switch (state) {
    case 'all-available':
      return managedProviders;
    case 'one-unavailable':
      return [claudeDescriptor, codexNotFound(), antigravityDescriptor];
    case 'none-available':
      return [
        {
          ...claudeDescriptor,
          readiness: 'authenticationRequired',
          signInCommand: 'claude auth login',
        },
        codexNotFound(),
        {
          ...antigravityDescriptor,
          readiness: 'unavailable',
          reasonCode: 'PROBE_FAILED',
          reason: 'Antigravity did not complete protocol initialization.',
        },
      ];
    case 'longest-statuses':
      return [
        {
          ...claudeDescriptor,
          readiness: 'unavailable',
          reasonCode: 'KNOWN_INCOMPATIBILITY',
          reason: 'Claude Code 3.4.0 is recorded as incompatible.',
        },
        {
          ...codexNotFound(),
          reasonCode: 'PROCESS_SETTLEMENT_UNVERIFIED',
          reason: 'The availability check process did not exit.',
        },
        {
          ...antigravityDescriptor,
          readiness: 'unavailable',
          reasonCode: 'INSTALLATION_UNAVAILABLE',
          reason: 'Antigravity uses a machine-managed policy.',
        },
      ];
  }
}

/**
 * The full diagnostics of one unavailable provider, shown only on request. Text between backticks
 * is code (config keys, paths, commands). In production these come from the catalogue's `hint`
 * messages, which would need the same code markup (an i18n `<code>` tag); the mock writes them out.
 */
export interface ProviderDiagnostics {
  /** The reason this text is written for (`readiness` when it is not `unavailable`). */
  readonly reason?: string;
  /** What was checked or what the Runtime reported. */
  readonly found?: string;
  /** What to do, in order. */
  readonly fix: string;
  /** A config snippet to add (YAML). */
  readonly yaml?: { readonly file: string; readonly body: string };
  /** A command to run in a terminal. */
  readonly command?: string;
  readonly after?: string;
  /** Every path discovery checked (behind its own disclosure). */
  readonly checkedPaths?: readonly string[];
}

const genericFix: Record<MockLocale, string> = {
  pl: 'Popraw przyczynę podaną powyżej, a następnie wybierz **Sprawdź ponownie**.',
  en: 'Fix the cause above, then choose **Check again**.',
};

const codexYaml = 'sessions:\n  providers:\n    codex:\n      executable: C:\\path\\to\\codex.exe';

const diagnostics: Record<MockLocale, Record<string, ProviderDiagnostics>> = {
  pl: {
    claude: {
      reason: 'authenticationRequired',
      fix: 'Zaloguj się w CLI Claude w terminalu:',
      command: 'claude auth login',
      after: 'Następnie wybierz **Sprawdź ponownie**.',
    },
    codex: {
      reason: 'EXECUTABLE_NOT_FOUND',
      found: 'Sprawdzono: `PATH`, aplikację Codex na komputer i globalny pakiet npm.',
      fix: 'Zainstaluj CLI Codex albo wskaż jego plik wykonywalny w `.nevo/local/config.yaml`:',
      yaml: { file: '.nevo/local/config.yaml', body: codexYaml },
      after: 'Następnie uruchom ponownie Nevo SpecFlow.',
    },
    antigravity: {
      reason: 'PROBE_FAILED',
      found: 'Odpowiedź CLI: Antigravity did not complete protocol initialization.',
      fix: 'Sprawdź, czy `antigravity` uruchamia się i działa w terminalu.',
      after: 'Następnie wybierz **Sprawdź ponownie**.',
    },
  },
  en: {
    claude: {
      reason: 'authenticationRequired',
      fix: 'Sign in to the Claude CLI in a terminal:',
      command: 'claude auth login',
      after: 'Then choose **Check again**.',
    },
    codex: {
      reason: 'EXECUTABLE_NOT_FOUND',
      found: 'Looked in: `PATH`, the Codex desktop app and the npm global package.',
      fix: 'Install the Codex CLI, or point to its executable in `.nevo/local/config.yaml`:',
      yaml: { file: '.nevo/local/config.yaml', body: codexYaml },
      after: 'Then restart Nevo SpecFlow.',
    },
    antigravity: {
      reason: 'PROBE_FAILED',
      found: 'The CLI said: Antigravity did not complete protocol initialization.',
      fix: 'Check that `antigravity` starts and works in a terminal.',
      after: 'Then choose **Check again**.',
    },
  },
};

export function diagnosticsOf(
  locale: MockLocale,
  provider: ProviderDescriptor | undefined,
  providerId: string,
): ProviderDiagnostics | undefined {
  const written = diagnostics[locale][providerId];
  const reason = provider?.readiness === 'unavailable' ? provider.reasonCode : provider?.readiness;
  const base: ProviderDiagnostics | undefined =
    written && written.reason === reason ? written : { fix: genericFix[locale] };

  const paths = provider?.checkedLocations?.map((location) => location.path);

  return paths?.length && base === written ? { ...base, checkedPaths: paths } : base;
}

/** Mock-only copy; everything else is the production catalogue's own text. */
export const mockCopy = {
  pl: {
    oneUnavailable: '{{provider}}: {{status}}',
    someUnavailable: 'Niedostępne: {{providers}}',
    noneAvailable: 'Żaden agent nie jest teraz dostępny.',
    howToFix: 'Jak naprawić',
    panelTitle: 'Niedostępni agenci',
    checkedPaths: 'Sprawdzone ścieżki ({{count}})',
    settings: 'Ustawienia agenta',
    providerDefaultModel: 'Domyślny dostawcy',
    nameLabel: 'Nazwa sesji',
    optional: 'opcjonalnie',
    namePlaceholder: 'Nowa sesja',
    checkAgain: 'Sprawdź ponownie',
  },
  en: {
    oneUnavailable: '{{provider}}: {{status}}',
    someUnavailable: 'Unavailable: {{providers}}',
    noneAvailable: 'No agent is available right now.',
    howToFix: 'How to fix',
    panelTitle: 'Unavailable agents',
    checkedPaths: 'Checked paths ({{count}})',
    settings: 'Agent settings',
    providerDefaultModel: 'Provider default',
    nameLabel: 'Session name',
    optional: 'optional',
    namePlaceholder: 'New session',
    checkAgain: 'Check again',
  },
} as const;

/** Production strings that still say "wykonawca"/"executor", in the mock's one word: "Agent". */
export const agentWording = {
  pl: {
    sessions: { context: { executor: 'Agent' } },
    create: { prerequisite: { provider: 'Wybierz dostępnego agenta.' } },
    sessionStart: { prerequisite: { noProvider: 'Żaden agent nie jest teraz dostępny.' } },
  },
  en: {
    sessions: { context: { executor: 'Agent' } },
    create: { prerequisite: { provider: 'Choose an available agent.' } },
    sessionStart: { prerequisite: { noProvider: 'No agent is available right now.' } },
  },
} as const;

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

/**
 * The tile's short status: a small fixed vocabulary per reason code, so every tile keeps one line in
 * both languages. The catalogue's precise reason moves into the diagnostics.
 */
const shortStatusCopy = {
  pl: {
    available: 'Dostępny',
    signIn: 'Wymaga logowania',
    notFound: 'Nie znaleziono CLI',
    setup: 'Wymaga konfiguracji',
    turnedOff: 'Wyłączony',
    failsToStart: 'Błąd uruchamiania',
    checkFailed: 'Błąd sprawdzania',
    incompatible: 'Niezgodna wersja',
    checkUnfinished: 'Sprawdzanie przerwane',
    worktree: 'Nie w worktree',
    unknown: 'Nie sprawdzono',
  },
  en: {
    available: 'Available',
    signIn: 'Sign-in needed',
    notFound: 'CLI not found',
    setup: 'Needs setup',
    turnedOff: 'Turned off',
    failsToStart: 'Fails to start',
    checkFailed: 'Check failed',
    incompatible: 'Incompatible version',
    checkUnfinished: "Check didn't finish",
    worktree: 'Not in worktree',
    unknown: 'Not checked',
  },
} as const;

export function shortStatus(provider: ProviderDescriptor, locale: MockLocale): string {
  const copy = shortStatusCopy[locale];
  switch (provider.readiness) {
    case 'ready':
      return copy.available;
    case 'authenticationRequired':
      return copy.signIn;
    case 'unknown':
      return copy.unknown;
    case 'unavailable':
      break;
  }

  switch (provider.reasonCode) {
    case 'EXECUTABLE_NOT_FOUND':
      return provider.unresolvedLauncher ? copy.setup : copy.notFound;
    case 'AUTHENTICATION_REQUIRED':
      return copy.signIn;
    case 'INSTALLATION_UNAVAILABLE':
      return copy.setup;
    case 'NOT_ALLOWED_BY_PROJECT':
    case 'NOT_ENABLED_ON_WORKSTATION':
      return copy.turnedOff;
    case 'EXECUTABLE_NOT_WORKING':
      return copy.failsToStart;
    case 'PROBE_FAILED':
      return copy.checkFailed;
    case 'PROTOCOL_UNSUPPORTED':
    case 'KNOWN_INCOMPATIBILITY':
    case 'RESTRICTION_UNSUPPORTED':
      return copy.incompatible;
    // Temporary: the check's process may still be running; wait, then check again.
    case 'PROCESS_SETTLEMENT_UNVERIFIED':
      return copy.checkUnfinished;
    case 'SPECIFICATION_WORKTREE_UNSUPPORTED':
      return copy.worktree;
    case undefined:
      return copy.unknown;
  }
}
