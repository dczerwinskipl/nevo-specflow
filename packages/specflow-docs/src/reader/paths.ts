// Document paths as a reader shows them: relative to `docs.root`, not to the checkout. The corpus
// reports files, skip reasons and search hits relative to the checkout, as the CLI prints them.

import type { SkippedDocument } from '../corpus/readable';

/** `file` (checkout-relative, `/`-separated) below `root`; unchanged when it is not below it. */
export function underDocsRoot(root: string, file: string): string {
  const prefix = `${root}/`;

  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

/**
 * `text` with every checkout-relative path below `root` written relative to it. A path starts the
 * text or follows a space, an opening parenthesis, a comma or a quote, as the skip reasons write
 * them (`Invalid YAML frontmatter in docs/a.md: …`, `duplicate id 'x' (also in docs/a.md, docs/b.md)`).
 */
export function pathsUnderDocsRoot(root: string, text: string): string {
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return text.replace(new RegExp(`(^|[\\s(,'"\`])${escaped}/`, 'g'), '$1');
}

/** Skipped documents (checkout-relative) with their path and reason relative to `root`. */
export function skippedUnderDocsRoot(
  root: string,
  skipped: readonly SkippedDocument[],
): SkippedDocument[] {
  return skipped.map(({ path, error }) => ({
    path: underDocsRoot(root, path),
    error: pathsUnderDocsRoot(root, error),
  }));
}
