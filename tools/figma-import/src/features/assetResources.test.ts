import { describe, expect, it } from 'vitest';
import type { DesignResources } from '../core/model';
import { assetMainComponentFor } from './assetResources';

describe('asset resource resolution', () => {
  it('resolves an ordinary asset layer from materialized resources without a catalogue', () => {
    const master = { id: 'asset-master' } as ComponentNode;
    const resources = {
      assets: new Map([['asset/opaque-id', master]]),
    } satisfies Pick<DesignResources, 'assets'>;

    expect(assetMainComponentFor('asset/opaque-id', resources)).toBe(master);
  });
});

