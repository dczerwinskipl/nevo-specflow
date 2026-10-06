import { defineResource } from '@nevo/authorization';

export const SessionCapabilities = defineResource({
  name: 'session',
  actions: {
    Create: 'create',
    View: 'view',
    Manage: 'manage',
  },
});
