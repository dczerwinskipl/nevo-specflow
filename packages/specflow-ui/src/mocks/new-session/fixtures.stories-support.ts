import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import {
  antigravityDescriptor,
  claudeDescriptor,
  codexNotFound,
  managedProviders,
} from '../../features/sessions/start/catalogue/providerDescriptors.stories-support';

export type NewSessionState =
  | 'all-available'
  | 'one-unavailable'
  /** Every agent confirmed unavailable. */
  | 'none-available'
  /** Codex's availability check was interrupted: undetermined, not unavailable. */
  | 'check-interrupted'
  /** The longest short statuses on every card; one of them undetermined. */
  | 'longest-statuses';
export type MockLocale = 'pl' | 'en';

/** The Runtime catalogue of each state, from the production story fixtures. */
export function providersFor(state: NewSessionState): ProviderDescriptor[] {
  const settlement: ProviderDescriptor = {
    ...codexNotFound(),
    checkedLocations: undefined,
    reasonCode: 'PROCESS_SETTLEMENT_UNVERIFIED',
    reason: 'The availability check process did not exit.',
  };

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
          reasonCode: 'NOT_ENABLED_ON_WORKSTATION',
          reason: 'Antigravity is turned off on this workstation.',
        },
      ];
    case 'check-interrupted':
      return [claudeDescriptor, settlement, antigravityDescriptor];
    case 'longest-statuses':
      return [
        {
          ...claudeDescriptor,
          readiness: 'unavailable',
          reasonCode: 'KNOWN_INCOMPATIBILITY',
          reason: 'Claude Code 3.4.0 is recorded as incompatible.',
        },
        settlement,
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
 * Confirmed availability versus a check that did not reach a result. A failed or interrupted check
 * (the probe failed, its process did not exit, nothing checked yet) says nothing about the agent
 * itself: it is undetermined, and checking again is its action.
 */
export type Availability = 'available' | 'unavailable' | 'undetermined';

export function availabilityOf(provider: ProviderDescriptor): Availability {
  if (provider.readiness === 'ready') {
    return 'available';
  }

  return provider.readiness === 'unknown' ||
    provider.reasonCode === 'PROCESS_SETTLEMENT_UNVERIFIED' ||
    provider.reasonCode === 'PROBE_FAILED'
    ? 'undetermined'
    : 'unavailable';
}

/**
 * One way to fix an agent, and what makes the Runtime see it (verified on PR #174):
 * - `recheck`: the next catalogue read re-runs discovery and the sign-in check (a found executable is
 *   kept while its file is unchanged, a failed search for 30 s), so "Check again" sees it;
 * - `restart`: `.nevo/config.yaml` and `.nevo/local/config.yaml` are read once, when the Runtime
 *   starts, so only a restart sees the change; "Check again" cannot.
 */
export interface Fix {
  readonly kind: 'recheck' | 'restart';
  /** Shown when an agent has more than one way to fix it. */
  readonly title?: string;
  /** Text where `code` is code and **text** names an action. */
  readonly text: string;
  readonly yaml?: { readonly file: string; readonly body: string };
  readonly command?: string;
}

/**
 * The full diagnostics of one agent, shown only on request. In production these come from the
 * catalogue's `hint` messages, which would need code markup (an i18n `<code>` tag) and structured
 * fixes; the mock writes them out.
 */
export interface ProviderDiagnostics {
  /** What was checked or what the Runtime found. */
  readonly found?: string;
  readonly fixes: readonly Fix[];
  /** Every path discovery checked (behind its own disclosure). */
  readonly checkedPaths?: readonly string[];
}

const codexYaml = 'sessions:\n  providers:\n    codex:\n      executable: C:\\path\\to\\codex.exe';

const diagnostics: Record<MockLocale, Record<string, Omit<ProviderDiagnostics, 'checkedPaths'>>> = {
  pl: {
    'claude:authenticationRequired': {
      fixes: [
        {
          kind: 'recheck',
          text: 'Zaloguj się w CLI Claude w terminalu:',
          command: 'claude auth login',
        },
      ],
    },
    'codex:EXECUTABLE_NOT_FOUND': {
      found: 'Sprawdzono: `PATH`, aplikację Codex na komputer i globalny pakiet npm.',
      fixes: [
        {
          kind: 'recheck',
          title: 'Zainstaluj CLI',
          text: 'Zainstaluj CLI Codex w jednym z tych miejsc. Nieudane wyszukiwanie jest pamiętane przez 30 s, więc nowa instalacja pojawi się najwyżej po tym czasie.',
        },
        {
          kind: 'restart',
          title: 'Albo wskaż zainstalowany plik',
          text: 'Dodaj jego ścieżkę do `.nevo/local/config.yaml`:',
          yaml: { file: '.nevo/local/config.yaml', body: codexYaml },
        },
      ],
    },
    'antigravity:NOT_ENABLED_ON_WORKSTATION': {
      found:
        'Ten komputer wyłącza Antigravity ustawieniem `sessions.providers.antigravity.enabled: false` w `.nevo/local/config.yaml`.',
      fixes: [{ kind: 'restart', text: 'Usuń to ustawienie.' }],
    },
    'claude:KNOWN_INCOMPATIBILITY': {
      found:
        'Wykryta wersja: `3.4.0`, zapisana jako niezgodna. Obsługiwane wersje: `docs/reference/providers/compatibility.md`.',
      fixes: [{ kind: 'recheck', text: 'Zainstaluj obsługiwaną wersję CLI Claude.' }],
    },
    'codex:PROCESS_SETTLEMENT_UNVERIFIED': {
      found:
        'Proces uruchomiony przy sprawdzaniu mógł się jeszcze nie zakończyć, więc dostępność nie została ustalona. To nie oznacza, że Codex jest niedostępny.',
      fixes: [
        {
          kind: 'recheck',
          text: 'Poczekaj chwilę. Jeśli to się powtarza, zakończ proces `codex` w Menedżerze zadań.',
        },
      ],
    },
    'antigravity:INSTALLATION_UNAVAILABLE': {
      found:
        'Antigravity używa zasad zarządzanych na tym komputerze albo innego źródła logowania. Nevo SpecFlow uruchamia CLI tylko z jego domyślnym logowaniem.',
      fixes: [
        {
          kind: 'recheck',
          text: 'Zaloguj się domyślnym logowaniem CLI albo usuń zasady zarządzane (`docs/reference/providers`).',
        },
      ],
    },
  },
  en: {
    'claude:authenticationRequired': {
      fixes: [
        {
          kind: 'recheck',
          text: 'Sign in to the Claude CLI in a terminal:',
          command: 'claude auth login',
        },
      ],
    },
    'codex:EXECUTABLE_NOT_FOUND': {
      found: 'Looked in: `PATH`, the Codex desktop app and the npm global package.',
      fixes: [
        {
          kind: 'recheck',
          title: 'Install the CLI',
          text: 'Install the Codex CLI in one of these places. A failed search is remembered for 30 s, so a new installation shows up after that at the latest.',
        },
        {
          kind: 'restart',
          title: 'Or point to an installed file',
          text: 'Add its path to `.nevo/local/config.yaml`:',
          yaml: { file: '.nevo/local/config.yaml', body: codexYaml },
        },
      ],
    },
    'antigravity:NOT_ENABLED_ON_WORKSTATION': {
      found:
        'This machine turns Antigravity off with `sessions.providers.antigravity.enabled: false` in `.nevo/local/config.yaml`.',
      fixes: [{ kind: 'restart', text: 'Remove that setting.' }],
    },
    'claude:KNOWN_INCOMPATIBILITY': {
      found:
        'Detected version: `3.4.0`, recorded as incompatible. Supported versions: `docs/reference/providers/compatibility.md`.',
      fixes: [{ kind: 'recheck', text: 'Install a supported version of the Claude CLI.' }],
    },
    'codex:PROCESS_SETTLEMENT_UNVERIFIED': {
      found:
        'A process started by the check may still be running, so availability was not determined. This does not mean Codex is unavailable.',
      fixes: [
        {
          kind: 'recheck',
          text: 'Wait a moment. If it keeps happening, end the `codex` process in Task Manager.',
        },
      ],
    },
    'antigravity:INSTALLATION_UNAVAILABLE': {
      found:
        'Antigravity uses machine-managed policy or another sign-in source. Nevo SpecFlow runs the CLI only with its own default sign-in.',
      fixes: [
        {
          kind: 'recheck',
          text: 'Sign in with the CLI default sign-in, or remove the managed policy (`docs/reference/providers`).',
        },
      ],
    },
  },
};

const genericFix: Record<MockLocale, string> = {
  pl: 'Popraw przyczynę podaną powyżej.',
  en: 'Fix the cause above.',
};

export function diagnosticsOf(
  locale: MockLocale,
  provider: ProviderDescriptor | undefined,
  providerId: string,
): ProviderDiagnostics {
  const reason = provider?.readiness === 'unavailable' ? provider.reasonCode : provider?.readiness;
  const written = diagnostics[locale][`${providerId}:${reason ?? ''}`];
  if (!written) {
    return { fixes: [{ kind: 'recheck', text: genericFix[locale] }] };
  }

  const paths = provider?.checkedLocations?.map((location) => location.path);

  return paths?.length ? { ...written, checkedPaths: paths } : written;
}

/** Mock-only copy; everything else is the production catalogue's own text. */
export const mockCopy = {
  pl: {
    oneUnavailable: '{{provider}}: {{status}}',
    someUnavailable: 'Niedostępne: {{providers}}',
    noneHeading: 'Żaden agent nie jest dostępny',
    noneLine: 'Sprawdź przyczyny niedostępności i wymagane działania dla poszczególnych agentów.',
    undeterminedHeading: 'Nie udało się ustalić dostępności',
    undeterminedLine:
      'Sprawdzanie części agentów nie dało wyniku. Sprawdź ponownie albo zobacz przyczyny dla poszczególnych agentów.',
    noneNote: 'Żaden agent nie jest teraz dostępny.',
    howToFix: 'Jak naprawić',
    details: 'Szczegóły',
    agents: 'Agent',
    checkedPaths: 'Sprawdzone ścieżki ({{count}})',
    fixRecheck: 'Następnie wybierz **Sprawdź ponownie**.',
    fixRestart:
      'Następnie uruchom ponownie Nevo SpecFlow: konfiguracja jest czytana tylko przy starcie, więc **Sprawdź ponownie** nie zobaczy tej zmiany.',
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
    noneHeading: 'No agent is available',
    noneLine: 'See why each agent is unavailable and what it needs.',
    undeterminedHeading: 'Availability could not be determined',
    undeterminedLine:
      'Checking some agents gave no result. Check again, or see the cause for each agent.',
    noneNote: 'No agent is available right now.',
    howToFix: 'How to fix',
    details: 'Details',
    agents: 'Agent',
    checkedPaths: 'Checked paths ({{count}})',
    fixRecheck: 'Then choose **Check again**.',
    fixRestart:
      'Then restart Nevo SpecFlow: the configuration is read only at start, so **Check again** cannot see this change.',
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
 * The card's short status: a small fixed vocabulary per reason code, so every card keeps one line in
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
    case 'PROCESS_SETTLEMENT_UNVERIFIED':
      return copy.checkUnfinished;
    case 'SPECIFICATION_WORKTREE_UNSUPPORTED':
      return copy.worktree;
    case undefined:
      return copy.unknown;
  }
}
