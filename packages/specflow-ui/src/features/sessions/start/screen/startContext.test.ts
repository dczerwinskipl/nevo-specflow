import { describe, expect, it } from 'vitest';
import { codexClaudeCatalogue } from '../catalogue/startCatalogue.stories-support';
import { startContextValue } from './startContext';

const ready = {
  status: 'ready',
  catalogue: codexClaudeCatalogue,
  configurationUnavailable: false,
  refresh: () => undefined,
} as const;
const none = { providerId: '', modelId: '', effort: 'provider-default', mode: '' };
const specification = {
  status: 'ready',
  value: { id: 's', key: 'SPEC-1', title: 'Logowanie SSO' },
} as const;
const context = (overrides: Partial<Parameters<typeof startContextValue>[0]> = {}) =>
  startContextValue({ catalogue: ready, choice: none, notChosen: 'not chosen', ...overrides });

describe('startContextValue', () => {
  it('pins the Specification when there is one, else carries no association', () => {
    expect(context({ specification })).toMatchObject({
      scope: { kind: 'specification' },
      specification,
    });
    expect(context()).toMatchObject({ scope: { kind: 'standalone' } });
    expect(context()).not.toHaveProperty('specification');
  });

  it('mirrors the choice as it is made: nothing, the provider, then its model and effort', () => {
    expect(context().executor).toEqual({
      status: 'ready',
      value: { providerId: '', providerTitle: 'not chosen' },
    });
    const claude = { ...none, providerId: 'claude' };
    expect(context({ choice: claude }).executor).toEqual({
      status: 'ready',
      value: {
        providerId: 'claude',
        providerTitle: 'Claude',
        modelTitle: 'not chosen',
        effort: undefined,
      },
    });
    expect(context({ choice: { ...claude, modelId: 'model-a', effort: 'high' } }).executor).toEqual(
      {
        status: 'ready',
        value: {
          providerId: 'claude',
          providerTitle: 'Claude',
          modelTitle: 'claude model A',
          effort: 'high',
        },
      },
    );
  });

  it('shows no model for a provider that offers none', () => {
    const plain = {
      ...ready,
      catalogue: {
        ...codexClaudeCatalogue,
        providers: codexClaudeCatalogue.providers.map((p) => ({ ...p, models: [] })),
      },
    } as const;
    expect(
      context({ catalogue: plain, choice: { ...none, providerId: 'claude' } }).executor,
    ).toMatchObject({ value: { providerTitle: 'Claude', modelTitle: undefined } });
  });

  it('is loading, or unreadable, while the catalogue is', () => {
    expect(context({ catalogue: { status: 'loading' } }).executor).toEqual({ status: 'loading' });
    expect(context({ catalogue: { status: 'error', refresh: () => undefined } }).executor).toEqual({
      status: 'unreadable',
    });
  });
});
