import { defineResource } from '@nevo/authorization';

/** The documentation search resource (ADR 0020 §6): capability `docs.search`. */
export const DocsCapabilities = defineResource({
  name: 'docs',
  actions: {
    Search: 'search',
  },
});
