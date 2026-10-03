import { defineResource } from '@nevo/authorization';

export const SpecAuthorization = defineResource({
  name: 'spec',
  capabilities: {
    View: 'view',
    Create: 'create',
    Manage: 'manage',
  },
});
