import { describe, expect, it } from 'vitest';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { startCatalogueFromDemo } from './fromDemoCatalogue';

const demo = (providers: unknown[]) => ({ demo: true, providers }) as unknown as DemoCatalogue;

describe('startCatalogueFromDemo', () => {
  it('maps the creation catalogue provider, its models and its own modes', () => {
    const catalogue = startCatalogueFromDemo(
      demo([
        {
          id: 'claude',
          title: 'Claude',
          mark: 'claude',
          connection: 'subscription',
          available: true,
          reason: 'Limited',
          modes: [{ id: 'plan', title: 'Plan' }],
          defaultModeId: 'plan',
          models: [{ id: 'm', title: 'M', efforts: ['low'], modes: ['plan'] }],
        },
      ]),
    );
    expect(catalogue).toEqual({
      demo: true,
      providers: [
        {
          id: 'claude',
          title: 'Claude',
          icon: 'claude',
          available: true,
          reason: 'Limited',
          access: 'subscription',
          models: [{ id: 'm', title: 'M', efforts: ['low'], modeIds: ['plan'] }],
          modes: [{ id: 'plan', title: 'Plan', available: true }],
          defaultModeId: 'plan',
        },
      ],
    });
  });

  it('states no access for an unknown connection, and keeps an unavailable provider', () => {
    const [provider] = startCatalogueFromDemo(
      demo([
        {
          id: 'x',
          title: 'X',
          mark: 'neutral',
          connection: 'unknown',
          available: false,
          modes: [],
          models: [],
        },
      ]),
    ).providers;
    expect(provider).toMatchObject({ id: 'x', available: false, models: [], modes: [] });
    expect(provider).not.toHaveProperty('access');
    expect(provider).not.toHaveProperty('reason');
  });
});
