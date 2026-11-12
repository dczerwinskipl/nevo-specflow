// Document paths as a reader shows them: relative to `docs.root`, not to the checkout.

/** `file` (checkout-relative, `/`-separated) below `root`; unchanged when it is not below it. */
export function underDocsRoot(root: string, file: string): string {
  const prefix = `${root}/`;

  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}
