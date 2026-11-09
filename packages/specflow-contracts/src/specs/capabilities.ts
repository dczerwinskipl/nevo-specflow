import { defineResource } from '@nevo/authorization';

export const SpecCapabilities = defineResource({
  name: 'spec',
  actions: {
    View: 'view',
    Create: 'create',
    Manage: 'manage',
    CloseWorktree: 'close-worktree',
    CloseSpecification: 'close-specification',
    /** Associate a new Session with this Specification; implies no Session capability. */
    StartSession: 'start-session',
  },
});
