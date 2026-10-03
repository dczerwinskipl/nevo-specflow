import { defineResource } from '@nevo/authorization';

export const SessionAuthorization = defineResource({
  name: 'session',
  capabilities: {
    Create: 'create',
    View: 'view',
    Manage: 'manage',
  },
});
