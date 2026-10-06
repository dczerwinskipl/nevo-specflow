import { describe, expect, it } from 'vitest';

import { SessionCapabilities, SettingsCapabilities, SpecCapabilities } from '../src/index';

describe('SpecFlow authorization contracts', () => {
  it('defines stable feature-owned resource and capability ids', () => {
    expect(SpecCapabilities.capabilities).toEqual({
      View: 'spec.view',
      Create: 'spec.create',
      Manage: 'spec.manage',
    });
    expect(SessionCapabilities.capabilities).toEqual({
      Create: 'session.create',
      View: 'session.view',
      Manage: 'session.manage',
    });
    expect(SettingsCapabilities.capabilities).toEqual({
      View: 'settings.view',
      Manage: 'settings.manage',
    });
  });
});
