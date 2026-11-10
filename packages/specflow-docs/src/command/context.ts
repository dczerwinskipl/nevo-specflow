import { InvalidArgumentError, type Command } from 'commander';

import type { DocsConfigPaths } from '../config/load-docs-settings';
import type { DocsCorpusRules } from '../corpus/corpus';
import { DocsUsageError } from '../errors';
import type { CreateEmbeddingProvider } from '../embeddings/embedding-providers';
import type { BackgroundIndexLaunch, SpawnDetached } from '../semantic-index/catch-up';

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
   * `nevo-specflow docs check --write`. It is quoted only in `check` hints; the generated index
   * always names the product command (`INDEX_REGENERATE_COMMAND`).
   */
  readonly checkWriteCommand: string;
  /**
   * The command line that reads documents as this host invokes it, quoted in `search` hints.
   * Default `nevo-specflow docs get`.
   */
  readonly getCommand?: string;
  /**
   * The command line that builds the semantic index as this host invokes it, quoted in the
   * `index-building` reasons of `search` and `semantic status`. Default
   * `nevo-specflow docs semantic index`.
   */
  readonly semanticIndexCommand?: string;
  /**
   * The command line that reports the semantic index as this host invokes it, quoted in the
   * background catch-up reasons of `search`. Default `nevo-specflow docs semantic status`.
   */
  readonly semanticStatusCommand?: string;
  /**
   * How this host's own executable runs `semantic index` (same Node binary and entry). With it, a
   * `search` whose index lacks more vectors than it embeds starts that command in the background
   * (ADR 0020 §5); without it, the reason asks for `semantic index`.
   */
  readonly backgroundIndex?: BackgroundIndexLaunch;
  /** Test seam for starting the background `semantic index`; default a detached child process. */
  readonly spawnDetached?: SpawnDetached;
  /** Test seam for the clock of the background catch-up. Default `Date.now`. */
  readonly now?: () => number;
  /** Environment the embedding API key variable is read from. Default `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam for the embedding endpoint; production uses the OpenAI-compatible adapter. */
  readonly createEmbeddingProvider?: CreateEmbeddingProvider;
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
