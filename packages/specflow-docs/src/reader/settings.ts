// The documentation settings of one checkout, as a reader needs them: only the `docs` namespace of
// `<checkout>/.nevo/config.yaml` plus `<docs.root>/docs.yaml`. Other namespaces are not read, so an
// `ai:` block of a worktree can neither fail the read nor reach an embedding endpoint (ADR 0022).

import { lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DocsConfigError, DocsLinkRejectedError } from '../errors';
import { DOCS_FILE_NAME, type CorpusSettings, type DocsFileSettings } from '../config/docs-file';
import { parseDocsConfig, type DocsSettings } from '../config/docs-settings';
import { loadDocsFile, readTopLevel } from '../config/load-docs-settings';
import { corpusSettingsFingerprint } from '../config/settings-fingerprint';

export type CheckoutDocsSettings =
  | {
      /** The resolved `docs.root` (default `docs`) is not an existing directory. */
      readonly status: 'not-configured';
    }
  | {
      readonly status: 'configured';
      readonly docs: DocsSettings;
      readonly file: DocsFileSettings;
      /** What `openCorpus` works with; pass it on so `docs.yaml` is not read again. */
      readonly corpus: CorpusSettings;
      /** Changes whenever `docs` or `docs.yaml` change in a way that affects a reader. */
      readonly fingerprint: string;
    };

export interface ReadCheckoutDocsSettingsOptions {
  /** Refuse a symbolic link or junction at `docs.root`, `.nevo/config.yaml` or `docs.yaml`. */
  readonly rejectLinks: boolean;
}

const CONFIG_PATH = ['.nevo', 'config.yaml'];

/**
 * Read the documentation settings of `checkoutRoot`. Throws `DocsConfigError` when the `docs`
 * namespace or `docs.yaml` is invalid and `DocsLinkRejectedError` for a refused link.
 */
export function readCheckoutDocsSettings(
  checkoutRoot: string,
  { rejectLinks }: ReadCheckoutDocsSettingsOptions,
): CheckoutDocsSettings {
  if (rejectLinks) {
    rejectLink(checkoutRoot, CONFIG_PATH);
  }

  let docs: DocsSettings;
  try {
    docs = parseDocsConfig(readTopLevel(join(checkoutRoot, ...CONFIG_PATH))?.docs);
  } catch (err) {
    if (err instanceof DocsConfigError) {
      throw new DocsConfigError(`${CONFIG_PATH.join('/')}: ${err.message}`, { cause: err });
    }

    throw err;
  }

  if (rejectLinks) {
    rejectLink(checkoutRoot, docs.root.split('/'));
    rejectLink(checkoutRoot, [...docs.root.split('/'), DOCS_FILE_NAME]);
  }

  // Like the CLI, the defaults apply; a root that is not a directory means no documentation.
  if (
    !statSync(join(checkoutRoot, ...docs.root.split('/')), { throwIfNoEntry: false })?.isDirectory()
  ) {
    return { status: 'not-configured' };
  }

  const file = loadDocsFile(checkoutRoot, docs.root);
  const corpus: CorpusSettings = { root: docs.root, ...file };

  return {
    status: 'configured',
    docs,
    file,
    corpus,
    fingerprint: corpusSettingsFingerprint(corpus, docs.search.semantic),
  };
}

/** Throw when any segment of `segments` below `base` exists and is a symbolic link or junction. */
function rejectLink(base: string, segments: readonly string[]): void {
  let current = base;
  for (const segment of segments) {
    current = join(current, segment);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new DocsLinkRejectedError(
        `${segments.join('/')} must not be a symbolic link or junction (${segment}).`,
      );
    }
  }
}
