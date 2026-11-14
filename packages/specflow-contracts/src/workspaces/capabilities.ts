import { defineResource } from '@nevo/authorization';

/**
 * The workspace resource (ADR 0022 §2): capability `workspace.view` (list the project's registered
 * workspaces), checked at the Runtime's project scope `{ projectId }`.
 */
export const WorkspaceCapabilities = defineResource({
  name: 'workspace',
  actions: {
    View: 'view',
  },
});
