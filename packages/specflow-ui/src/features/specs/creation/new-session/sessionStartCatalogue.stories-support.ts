import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { catalogue as creationCatalogue } from '../options/creationCatalogue.stories-support';

type Provider = DemoCatalogue['providers'][number];

const antigravityModes = [
  { id: 'planning', title: 'Planowanie' },
  { id: 'fast', title: 'Szybki' },
  { id: 'review', title: 'Przegląd' },
];

/**
 * An Antigravity provider with thirteen models, so the Model field becomes the searchable Combobox
 * (the design system's Select-up-to-eight rule), efforts on some of the models and its own work
 * modes. The contract has no Antigravity mark, so it uses the neutral one.
 */
const antigravity: Provider = {
  id: 'antigravity',
  title: 'Antigravity',
  mark: 'neutral',
  version: 'Demo',
  access: 'Dane demonstracyjne',
  profile: 'Profil demonstracyjny',
  connection: 'unknown',
  quota: { state: 'unknown' },
  available: true,
  modes: antigravityModes,
  defaultModeId: 'planning',
  models: Array.from({ length: 13 }, (_, index) => {
    const number = index + 1;

    return {
      id: `agy-${number}`,
      // The last title repeats the one before it, so the model id is shown as `meta` for both.
      title:
        number === 13
          ? 'Gemini 6 Flash'
          : `Gemini ${Math.ceil(number / 2)} ${number % 2 ? 'Pro' : 'Flash'}`,
      efforts: number % 3 === 0 ? ['low', 'medium', 'high'] : [],
      modes: number % 4 === 0 ? ['planning', 'review'] : ['planning', 'fast', 'review'],
    };
  }),
};

/**
 * The creation catalogue (Codex, Claude) plus Antigravity, for the Session start stories only: the
 * catalogue other stories use stays as it is.
 */
export const startCatalogue: DemoCatalogue = {
  ...creationCatalogue,
  providers: [...creationCatalogue.providers, antigravity],
};

/** Every executor is unavailable, each with its own reason (the "no provider" state). */
export const noProviderCatalogue: DemoCatalogue = {
  ...startCatalogue,
  providers: startCatalogue.providers.map((provider) => ({
    ...provider,
    available: false,
    reason: 'Nie zalogowano do CLI.',
  })),
};
