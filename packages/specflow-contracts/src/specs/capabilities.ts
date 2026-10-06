import { defineResource } from '@nevo/authorization';

export const SpecCapabilities = defineResource({
  name: 'spec',
  actions: {
    View: 'view',
    Create: 'create',
    Manage: 'manage',
  },
});
