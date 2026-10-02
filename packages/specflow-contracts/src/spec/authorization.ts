import { defineResource } from '@nevo/authorization';

export const SpecAuthorization = defineResource({
  name: 'spec',
  capabilities: {
    List: 'list',
    View: 'view',
    Create: 'create',
    Manage: 'manage',
  },
});
