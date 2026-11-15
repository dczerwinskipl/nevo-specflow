import {
  asString,
  DocsError,
  inspectCorpus,
  isInactiveStatus,
  openCorpus,
  readCheckoutDocsSettings,
} from '@nevo/specflow-docs';

/**
 * Whether the documentation of the Runtime's own checkout (the corpus this Runtime serves for its
 * workspace under `/api/workspaces/:workspaceId/docs`) has an active document of this stable id,
 * for the `project-document` context entries of a Task. Same rule as `docs get`: a deprecated or
 * superseded document does not resolve. Each returned lookup reads the checkout's documentation
 * settings and the corpus frontmatter once, on its first call, so open one per request (the
 * Engine's `openWorkflow`) to see the documentation as it is now; a request without such a
 * reference never scans it. `checkoutRoot` is read then too, not when the Runtime starts. Without a
 * checkout, or when its documentation is not configured or its settings are invalid, nothing
 * resolves.
 */
export function openProjectDocumentLookup(
  checkoutRoot: () => string | undefined,
): () => (id: string) => Promise<boolean> {
  return () => {
    let active: ReadonlySet<string> | undefined;

    return (id) => {
      active ??= activeDocumentIds(checkoutRoot());

      return Promise.resolve(active.has(id));
    };
  };
}

function activeDocumentIds(checkoutRoot: string | undefined): ReadonlySet<string> {
  if (checkoutRoot === undefined) {
    return new Set();
  }

  try {
    const settings = readCheckoutDocsSettings(checkoutRoot, { rejectLinks: true });
    if (settings.status === 'not-configured') {
      return new Set();
    }

    return new Set(
      inspectCorpus(openCorpus(checkoutRoot, settings.corpus))
        .docs.filter((doc) => !isInactiveStatus(doc.status))
        .map((doc) => asString(doc.id)),
    );
  } catch (error) {
    // Invalid or linked documentation settings resolve nothing; `docs check` reports them.
    if (error instanceof DocsError) {
      return new Set();
    }

    throw error;
  }
}
