import { describe, expect, it } from 'vitest';

import { parseSpecsFeatureConfig } from './configuration';

describe('Specs feature configuration', () => {
  it('owns the Specs configuration hierarchy and delegates Current section values', () => {
    expect(
      parseSpecsFeatureConfig({
        overview: {
          current: {
            sections: ['draft', 'ready'],
          },
        },
      }),
    ).toEqual({
      overview: {
        current: {
          sections: ['draft', 'ready'],
        },
      },
    });
  });

  it('rejects unknown configuration fields', () => {
    expect(() => parseSpecsFeatureConfig({ unexpected: true })).toThrow();
  });
});
