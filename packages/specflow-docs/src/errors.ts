// Error model of the documentation capability. Domain and application code throw these; only the
// CLI adapter decides how they reach the user (usage errors exit 2, everything else exits 1).

export class DocsError extends Error {
  override readonly name: string = 'DocsError';
}

/** Bad command input, an unknown or inactive document id. */
export class DocsUsageError extends DocsError {
  override readonly name = 'DocsUsageError';
}

/** The `docs` configuration namespace (or a configuration file) is invalid. */
export class DocsConfigError extends DocsError {
  override readonly name = 'DocsConfigError';
}

/** The documentation corpus failed validation. */
export class DocsCorpusInvalidError extends DocsError {
  override readonly name = 'DocsCorpusInvalidError';

  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`documentation corpus is invalid:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}
