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

describe('createReadiness: the first problem follows the form order and names its field', () => {
  const agent = { providerId: 'listed', modelId: '', effort: providerDefaultEffort, mode: 'build' };
  const pendingBase = {
    ...initialWorkspaceChoice,
    tile: 'new' as const,
    base: { on: true, ref: '' },
  };

  it('name, then archetype, then the agent, then the workspace', () => {
    const all = {
      ...base,
      title: '',
      archetype: undefined,
      catalogue: { ...catalogue(listedProvider), archetypes: [{ id: 'feature' }] } as DemoCatalogue,
      agent,
      choice: pendingBase,
    };
    expect(createReadiness(all).problemField).toBe('name');
    expect(createReadiness({ ...all, title: 'T' }).problemField).toBe('archetype');
    const withArchetype = { ...all, title: 'T', archetype: { id: 'feature' } as ArchetypeInfo };
    expect(createReadiness(withArchetype)).toMatchObject({
      problemField: 'model',
      prerequisite: { key: 'create.prerequisite.model' },
    });
    expect(createReadiness({ ...withArchetype, agent: { ...agent, modelId: 'm1' } })).toMatchObject(
      { problemField: 'base', prerequisite: { key: 'create.workspace.errors.pickBase' } },
    );
  });

  it('a reason no field can fix has no field', () => {
    expect(
      createReadiness({
        ...base,
        catalogue: catalogue(listedProvider),
        agent,
        configurationUnavailable: true,
      }).problemField,
    ).toBeUndefined();
  });
});

describe('createReadiness: a blocked Create always has a reason', () => {
  const agent = { providerId: 'listed', modelId: 'm1', effort: 'high', mode: 'build' };
  const ready = {
    ...base,
    catalogue: { ...catalogue(listedProvider), archetypes: [{ id: 'feature' }] } as DemoCatalogue,
    agent,
  };

  it('an effort the chosen model does not offer is an agent problem at the Effort field', () => {
    const readiness = createReadiness({ ...ready, agent: { ...agent, effort: 'max' } });
    expect(readiness).toMatchObject({
      canSubmit: false,
      problemField: 'effort',
      prerequisite: { key: 'create.prerequisite.effort' },
    });
    // The Effort field comes before Work mode: with both wrong, effort is the first problem.
    expect(
      createReadiness({ ...ready, agent: { ...agent, effort: 'max', mode: 'other' } }).problemField,
    ).toBe('effort');
    // A provider without models runs only its default effort.
    expect(
      createReadiness({
        ...ready,
        catalogue: catalogue(modelLessProvider),
        agent: { providerId: 'plain', modelId: '', effort: 'high', mode: 'build' },
      }).problemField,
    ).toBe('effort');
  });

  it.each([
    ['ready', {}],
    ['no name', { title: '' }],
    ['no archetype', { archetype: undefined }],
    ['an unknown provider', { agent: { ...agent, providerId: 'gone' } }],
    ['no model', { agent: { ...agent, modelId: '' } }],
    ['an unsupported effort', { agent: { ...agent, effort: 'max' } }],
    ['an unsupported mode', { agent: { ...agent, mode: 'other' } }],
    ['a forbidden Create', { forbiddenCreate: true }],
    ['a stale configuration', { configurationUnavailable: true }],
    ['loading options', { workspaceState: { status: 'loading' } as const }],
    [
      'a pending base',
      { choice: { ...initialWorkspaceChoice, tile: 'new' as const, base: { on: true, ref: '' } } },
    ],
  ])('%s: canSubmit is false only with a prerequisite', (_name, change) => {
    const readiness = createReadiness({ ...ready, ...change });
    expect(readiness.canSubmit || readiness.prerequisite !== undefined).toBe(true);
    if (!readiness.canSubmit) {
      expect(readiness.prerequisite).toBeDefined();
    }
  });
});
