import {
  asString,
  DEFAULT_DOCS_SETTINGS,
  inspectCorpus,
  isInactiveStatus,
  openFileSystemCorpus,
  type DocsConfiguration,
} from '@nevo/specflow-docs';

/**
 * Whether the project documentation (the corpus this Runtime serves under `/api/docs/`) has an
 * active document of this stable id, for the `project-document` context entries of a Task. Same
 * rule as `docs get`: a deprecated or superseded document does not resolve. Each returned lookup
 * reads the corpus frontmatter once, on its first call, so open one per request (the Engine's
 * `openWorkflow`) to see the documentation as it is now; a request without such a reference never
 * scans it. Without a project root nothing resolves.
 */
export function openProjectDocumentLookup(
  projectRoot: string | undefined,
  configuration?: DocsConfiguration,
): () => (id: string) => Promise<boolean> {
  return () => {
    let active: Set<string> | undefined;

    return (id) => {
      if (projectRoot === undefined) {
        return Promise.resolve(false);
      }

      active ??= new Set(
        inspectCorpus(
          openFileSystemCorpus(projectRoot, configuration?.docs ?? DEFAULT_DOCS_SETTINGS),
        )
          .docs.filter((doc) => !isInactiveStatus(doc.status))
          .map((doc) => asString(doc.id)),
      );

      return Promise.resolve(active.has(id));
    };
  };
}
