import { defineResource } from '@nevo/authorization';

/**
 * The documentation resource (ADR 0022 §2): capability `docs.view` (list, read and search the
 * documentation of the project's workspaces), checked at the Runtime's project scope `{ projectId }`.
 */
export const DocsCapabilities = defineResource({
  name: 'docs',
  actions: {
    View: 'view',
  },
});
