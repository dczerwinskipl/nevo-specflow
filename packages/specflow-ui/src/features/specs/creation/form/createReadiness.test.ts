import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import { providerDefaultEffort } from '../../../sessions';
import { createOptionsFixture } from '../options/creationOptions.stories-support';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';
import { createReadiness } from './createReadiness';

const modelLessProvider = {
  id: 'plain',
  title: 'Plain agent',
  mark: 'neutral',
  version: '1',
  access: 'cli',
  available: true,
  modes: [{ id: 'build', title: 'Build' }],
  models: [],
} as const;
const listedProvider = {
  ...modelLessProvider,
  id: 'listed',
  models: [{ id: 'm1', title: 'M1', efforts: ['high'], modes: ['build'] }],
} as const;

const catalogue = (provider: object) =>
  ({ providers: [provider], archetypes: [] }) as unknown as DemoCatalogue;

const base = {
  method: 'ai',
  title: 'Payment limits',
  archetype: { id: 'feature' } as ArchetypeInfo,
  workspaceState: { status: 'ready', options: createOptionsFixture('default') } as const,
  choice: initialWorkspaceChoice,
  configurationUnavailable: false,
  forbiddenCreate: false,
};

describe('createReadiness: the agent', () => {
  it('lets a provider that lists no model be submitted without one (N-D2)', () => {
    const readiness = createReadiness({
      ...base,
      catalogue: catalogue(modelLessProvider),
      agent: { providerId: 'plain', modelId: '', effort: providerDefaultEffort, mode: 'build' },
    });

    expect(readiness).toEqual({ prerequisite: undefined, canSubmit: true });
  });

  it('still requires a mode the model-less provider describes', () => {
    const readiness = createReadiness({
      ...base,
      catalogue: catalogue(modelLessProvider),
      agent: { providerId: 'plain', modelId: '', effort: providerDefaultEffort, mode: 'plan' },
    });

    expect(readiness.canSubmit).toBe(false);
    expect(readiness.prerequisite?.key).toBe('create.prerequisite.mode');
  });

  it('still requires a model from a provider that lists some', () => {
    const readiness = createReadiness({
      ...base,
      catalogue: catalogue(listedProvider),
      agent: { providerId: 'listed', modelId: '', effort: providerDefaultEffort, mode: 'build' },
    });

    expect(readiness.canSubmit).toBe(false);
    expect(readiness.prerequisite?.key).toBe('create.prerequisite.model');
  });
});
