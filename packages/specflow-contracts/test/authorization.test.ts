import { describe, expect, it } from 'vitest';

import { SessionAuthorization, SettingsAuthorization, SpecAuthorization } from '../src/index.js';

describe('SpecFlow authorization contracts', () => {
  it('defines stable feature-owned resource and capability ids', () => {
    expect(SpecAuthorization.capabilities).toEqual({
      View: 'spec.view',
      Create: 'spec.create',
      Manage: 'spec.manage',
    });
    expect(SessionAuthorization.capabilities).toEqual({
      Create: 'session.create',
      View: 'session.view',
      Manage: 'session.manage',
    });
    expect(SettingsAuthorization.capabilities).toEqual({
      View: 'settings.view',
      Manage: 'settings.manage',
    });
  });
});
