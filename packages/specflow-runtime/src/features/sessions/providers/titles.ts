import type { SessionProviderId } from '../configuration';

/** The display title of each provider the Runtime knows, shared by its driver and the catalogue. */
export const ProviderTitles: Readonly<Record<SessionProviderId, string>> = {
  mock: 'Controlled mock (test only)',
  claude: 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
};
