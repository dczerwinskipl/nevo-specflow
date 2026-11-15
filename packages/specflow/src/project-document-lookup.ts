import {
  asString,
  DocsError,
  isInactiveStatus,
  loadReadableDocs,
  openCorpus,
  readCheckoutDocsSettings,
} from '@nevo/specflow-docs';
import type { SpecificationCheckout } from '@nevo/specflow-engine';

/**
 * Whether the documentation of a Specification's checkout (its workspace or worktree, as the Engine
 * resolves it for `path` references) has an active document with this stable id, for the
 * `project-document` context entries of a Task. Same rule as the reader commands run there: the
 * checkout's own `docs` settings, a deprecated, superseded or unreadable document does not
 * resolve. Each checkout is read once, on its first lookup, so a command without a
 * project-document reference never scans it. Invalid documentation settings resolve nothing.
 */
export function projectDocumentLookup(): (
  checkout: SpecificationCheckout,
  id: string,
) => Promise<boolean> {
  const byRoot = new Map<string, ReadonlySet<string>>();

  return (checkout, id) => {
    let active = byRoot.get(checkout.root);
    if (active === undefined) {
      active = activeDocumentIds(checkout.root);
      byRoot.set(checkout.root, active);
    }

    return Promise.resolve(active.has(id));
  };
}

function activeDocumentIds(root: string): ReadonlySet<string> {
  try {
    const settings = readCheckoutDocsSettings(root, { rejectLinks: true });
    if (settings.status === 'not-configured') {
      return new Set();
    }

    return new Set(
      loadReadableDocs(openCorpus(root, settings.corpus))
        .docs.filter((doc) => !isInactiveStatus(doc.status))
        .map((doc) => asString(doc.id)),
    );
  } catch (error) {
    if (error instanceof DocsError) {
      return new Set();
    }

    throw error;
  }
}
