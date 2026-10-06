import { defineResource } from '@nevo/authorization';

export const SettingsCapabilities = defineResource({
  name: 'settings',
  actions: {
    View: 'view',
    Manage: 'manage',
  },
});
