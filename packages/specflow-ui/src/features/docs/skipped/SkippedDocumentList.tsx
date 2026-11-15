import { Typography } from '@nevo/ui';
import type { WorkspaceDocsSkippedDocument } from '@nevo/specflow-contracts/docs';

/**
 * The documents the reader skips, each as its repository path (`<docs.root>/<path>`, the form the
 * article's Properties show and a search of the repository finds) over its error, both wrapping
 * anywhere. One list for the tree pane's note, a skipped Related document and a skipped article.
 */
export function SkippedDocumentList({
  skipped,
  docsRoot,
}: {
  skipped: readonly WorkspaceDocsSkippedDocument[];
  docsRoot: string;
}) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {skipped.map((item) => (
        <li key={item.path} className="grid gap-0.5">
          <Typography as="code" variant="code-md" className="wrap-anywhere text-content-secondary">
            {`${docsRoot}/${item.path}`}
          </Typography>
          <Typography as="span" variant="body-sm" className="wrap-anywhere text-content-muted">
            {item.error}
          </Typography>
        </li>
      ))}
    </ul>
  );
}
