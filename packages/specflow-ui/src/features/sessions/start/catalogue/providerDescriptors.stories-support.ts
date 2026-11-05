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

/** Every provider needs signing in again, or is unavailable with its reason. */
export const unavailableProviders: ProviderDescriptor[] = [
  { ...claudeDescriptor, readiness: 'authenticationRequired' },
  { ...codexDescriptor, readiness: 'unavailable', reason: 'Nie zainstalowano CLI.' },
  { ...antigravityDescriptor, readiness: 'unavailable', reason: 'Nie zalogowano do CLI.' },
];
