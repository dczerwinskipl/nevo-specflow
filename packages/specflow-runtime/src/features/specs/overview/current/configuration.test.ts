import { describe, expect, it } from 'vitest';

import { DEFAULT_CURRENT_SECTIONS, parseCurrentOverviewSections } from './configuration';

describe('Current Specs Overview section configuration', () => {
  it('uses the default section order when the section list is absent', () => {
    expect(parseCurrentOverviewSections(undefined)).toEqual(DEFAULT_CURRENT_SECTIONS);
  });

  it('uses section list order directly without an order field', () => {
    expect(parseCurrentOverviewSections(['ended', 'not-started', 'requires-attention'])).toEqual([
      'ended',
      'not-started',
      'requires-attention',
    ]);
  });

  it.each(['ended', ['ended', 'ended'], ['invalid-section'], ['draft'], ['ready']])(
    'rejects invalid section configuration: %j',
    (value) => {
      expect(() => parseCurrentOverviewSections(value)).toThrow();
    },
  );
});
