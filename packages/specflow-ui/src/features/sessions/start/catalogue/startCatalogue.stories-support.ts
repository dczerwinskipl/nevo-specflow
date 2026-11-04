import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { StartCatalogue, StartProvider } from './startCatalogue';

/**
 * Start catalogues for tests and stories, built directly in the provider-neutral model (the
 * adapters have their own tests). Each provider has its own work-mode vocabulary, like the real
 * Runtime's: Codex offers Ask/Edit/Agent, Claude its native Plan/Accept edits/Auto.
 */
const provider = (id: 'codex' | 'claude'): StartProvider => ({
  id,
  title: id === 'codex' ? 'Codex' : 'Claude',
  icon: id,
  available: true,
  models: [
    {
      id: 'model-a',
      title: `${id} model A`,
      efforts: ['low', 'high'],
      modeIds: id === 'codex' ? ['ask', 'edit', 'agent'] : ['plan', 'acceptEdits', 'auto'],
    },
    {
      id: 'model-b',
      title: `${id} model B`,
      efforts: [],
      modeIds: id === 'codex' ? ['ask', 'agent'] : ['plan', 'acceptEdits'],
    },
  ],
  modes:
    id === 'codex'
      ? [
          { id: 'ask', title: 'Ask', available: true },
          { id: 'edit', title: 'Edit', available: true },
          { id: 'agent', title: 'Agent', available: true },
        ]
      : [
          { id: 'plan', title: 'Plan', available: true },
          { id: 'acceptEdits', title: 'Accept edits', available: true },
          { id: 'auto', title: 'Auto', available: true },
        ],
  defaultModeId: id === 'codex' ? 'agent' : 'acceptEdits',
});

export const codexClaudeCatalogue: StartCatalogue = {
  demo: true,
  providers: [provider('codex'), provider('claude')],
};

/** A catalogue none of whose providers can be used. */
export const offlineCatalogue: StartCatalogue = {
  demo: true,
  providers: codexClaudeCatalogue.providers.map((p) => ({
    ...p,
    available: false,
    reason: 'Nie zalogowano do CLI.',
  })),
};

const capabilities: ProviderDescriptor['capabilities'] = {
  questions: true,
  permissions: true,
  cancel: true,
  resume: true,
  modelOverride: true,
  effortOverride: true,
};

/** A managed Runtime provider (`GET /api/session-providers`) with the given overrides. */
export function providerDescriptor(
  overrides: Partial<ProviderDescriptor> & Pick<ProviderDescriptor, 'providerId'>,
): ProviderDescriptor {
  return {
    title: overrides.providerId,
    readiness: 'ready',
    models: [],
    modes: ['read-only'],
    capabilities,
    ...overrides,
  };
}
