import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { providerDescriptor } from './startCatalogue.stories-support';

type NativeMode = NonNullable<ProviderDescriptor['providerModes']>[number];

const nativeMode = (
  modeId: string,
  title: string,
  overrides: Partial<NativeMode> = {},
): NativeMode => ({
  modeId,
  title,
  nativeMode: modeId,
  mode: modeId === 'plan' ? 'read-only' : 'workspace-write',
  readiness: 'ready',
  authorized: true,
  ...overrides,
});

/** Claude, with its own native work modes and two models (one with efforts). */
export const claudeDescriptor = providerDescriptor({
  providerId: 'claude',
  title: 'Claude',
  models: [
    { modelId: 'claude-sonnet', title: 'Claude Sonnet', efforts: ['low', 'medium', 'high'] },
    { modelId: 'claude-haiku', title: 'Claude Haiku', efforts: [] },
  ],
  modes: ['read-only', 'workspace-write'],
  defaultModeId: 'acceptEdits',
  providerModes: [
    nativeMode('plan', 'Plan'),
    nativeMode('acceptEdits', 'Accept edits'),
    nativeMode('auto', 'Auto', {
      readiness: 'unavailable',
      reason: 'Wymaga zgody administratora.',
    }),
  ],
});

/** Codex, offering no model choice: its Session starts at the provider default. */
export const codexDescriptor = providerDescriptor({
  providerId: 'codex',
  title: 'Codex',
  modes: ['read-only', 'workspace-write'],
  defaultModeId: 'agent',
  providerModes: [nativeMode('ask', 'Ask', { mode: 'read-only' }), nativeMode('agent', 'Agent')],
  executable: {
    path: 'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\5449c1f0f26f1f98\\codex.exe',
    source: 'discovered',
    location: 'codex-desktop-app',
    version: '0.167.0',
  },
});

/**
 * Antigravity with thirteen models, so the Model field becomes the searchable Combobox (the design
 * system's Select-up-to-eight rule): efforts on some, and a different set of work modes. The last
 * title repeats the one before it, so the model id tells the two apart.
 */
export const antigravityDescriptor = providerDescriptor({
  providerId: 'antigravity',
  title: 'Antigravity',
  models: Array.from({ length: 13 }, (_, index) => {
    const number = index + 1;

    return {
      modelId: `agy-${number}`,
      title:
        number === 13
          ? 'Gemini 6 Flash'
          : `Gemini ${Math.ceil(number / 2)} ${number % 2 ? 'Pro' : 'Flash'}`,
      efforts: number % 3 === 0 ? ['low', 'medium', 'high'] : [],
    };
  }),
  modes: ['read-only', 'workspace-write'],
  defaultModeId: 'planning',
  providerModes: [
    nativeMode('planning', 'Planowanie', { mode: 'read-only' }),
    nativeMode('fast', 'Szybki'),
    nativeMode('review', 'Przegląd', { mode: 'read-only' }),
  ],
});

/** The managed Runtime's catalogue: Claude, Codex and Antigravity, all ready. */
export const managedProviders: ProviderDescriptor[] = [
  claudeDescriptor,
  codexDescriptor,
  antigravityDescriptor,
];

const profile = 'C:\\Users\\dev';
const npmPrefix = profile + '\\AppData\\Roaming\\npm';

/**
 * Codex enabled but not found: discovery looked on PATH, in the Codex desktop app and in the npm
 * global package, as the Runtime reports it (the app is not installed).
 */
export function codexNotFound(): ProviderDescriptor {
  const npm = '\\node_modules\\@openai';
  const binary = '\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe';

  return {
    ...codexDescriptor,
    executable: undefined,
    readiness: 'unavailable',
    reasonCode: 'EXECUTABLE_NOT_FOUND',
    reason: 'No Codex CLI was found on PATH or in its install locations.',
    checkedLocations: [
      { source: 'path', path: 'codex.exe, codex.cmd, codex.bat' },
      {
        source: 'discovered',
        path: profile + '\\AppData\\Local\\OpenAI\\Codex\\bin\\*\\codex.exe',
        location: 'codex-desktop-app',
      },
      {
        source: 'discovered',
        path: npmPrefix + npm + '\\codex\\node_modules\\@openai\\codex-win32-x64' + binary,
        location: 'npm-global-package',
      },
      {
        source: 'discovered',
        path: npmPrefix + npm + '\\codex-win32-x64' + binary,
        location: 'npm-global-package',
      },
      {
        source: 'discovered',
        path: npmPrefix + npm + '\\codex' + binary,
        location: 'npm-global-package',
      },
    ],
  };
}

/** Codex installed through npm, but the package's native executable is missing. */
export function codexLauncherWithoutExecutable(): ProviderDescriptor {
  return {
    ...codexNotFound(),
    reason: `${npmPrefix}\\codex.cmd is the npm launcher of @openai/codex, but the package's native executable is missing.`,
    unresolvedLauncher: { path: npmPrefix + '\\codex.cmd', package: '@openai/codex' },
  };
}

/** Every provider needs signing in again, or is unavailable with its reason. */
export const unavailableProviders: ProviderDescriptor[] = [
  { ...claudeDescriptor, readiness: 'authenticationRequired' },
  codexNotFound(),
  {
    ...antigravityDescriptor,
    readiness: 'unavailable',
    reasonCode: 'PROBE_FAILED',
    reason: 'Antigravity did not complete protocol initialization.',
  },
];
