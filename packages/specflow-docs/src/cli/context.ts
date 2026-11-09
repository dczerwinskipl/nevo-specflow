import { InvalidArgumentError, type Command } from 'commander';

import type { DocsConfigPaths } from '../config/load-docs-settings';
import type { DocsCorpusRules } from '../corpus/corpus';
import { DocsUsageError } from '../errors';

/** The project the host resolved: its root and configuration file paths. */
export interface DocsProject extends DocsConfigPaths {
  /** Absolute project root. */
  readonly root: string;
}

/**
 * What the host (the product shell, or a repository's own launcher) gives the `docs` command. The
 * host resolves the project; the command never starts Runtime or touches UI assets.
 */
export interface DocsCommandContext {
  /** Resolves the project for a command that reads the corpus (not called for `--help`). */
  readonly resolveProject: () => Promise<DocsProject>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /**
   * The command line that regenerates the index as this host invokes it, for example
   * `nevo-specflow docs check --write`. It is quoted in check hints and in the generated index.
   */
  readonly checkWriteCommand: string;
  /** Host-specific rules on top of the product contract; the product shell supplies none. */
  readonly corpusRules?: DocsCorpusRules;
}

/** Usage problems found by the use cases exit like Commander usage errors (exit code 2). */
export async function runDocsAction(command: Command, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (err instanceof DocsUsageError) {
      command.error(err.message, { exitCode: 2, code: 'nevo.docs.usage' });
    }

    throw err;
  }
}

/** Commander argument parser for `--limit`. */
export function positiveInteger(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError('Must be a positive integer.');
  }

  return n;
}
