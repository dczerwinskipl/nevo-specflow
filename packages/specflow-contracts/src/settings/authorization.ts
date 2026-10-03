import { defineResource } from '@nevo/authorization';

export const SettingsAuthorization = defineResource({
  name: 'settings',
  capabilities: {
    View: 'view',
    Manage: 'manage',
  },
});
