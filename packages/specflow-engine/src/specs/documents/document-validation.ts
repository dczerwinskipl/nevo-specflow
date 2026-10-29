import type { DocumentIssue, RequirementResult } from '@nevo/specflow-contracts/documents';

import type { ManifestArchetype, ManifestDocument } from '../model';

/**
 * Pure document validation (architecture "Validation results"): a function of the registry, the
 * PERSISTED requirements and the observed file set. Nothing here reads the live catalogue or the
 * filesystem, and nothing records or implies readiness, acceptance or approval; completeness is
 * structural only.
 *
 * `skipped-entry`, `path-case-collision` and `archive-limit` issues are filesystem facts that the tree
 * projection adds; the issue type (from the contracts) already defines them.
 */

export interface DocumentValidationInput {
  /** The archetype snapshot persisted in the manifest. */
  readonly archetype: Pick<ManifestArchetype, 'requirements'>;
  readonly documents: readonly ManifestDocument[];
  /**
   * Relative paths of the regular files observed in the Specification directory. The reader excludes
   * the manifest, hidden entries and symlinks before calling.
   */
  readonly observedPaths: Iterable<string>;
  /**
   * Registered paths whose file exists but cannot be read safely (a symlink, a redirected ancestor,
   * an unreadable entry). They are reported as skipped entries by the projection, are not dangling (the
   * file is not missing) and, being unreadable, do not count toward a requirement.
   */
  readonly unreadablePaths?: Iterable<string>;
}

export interface UnclassifiedFile {
  readonly path: string;
}

export interface DocumentValidation {
  /** One result per persisted requirement, in requirement order. */
  readonly requirements: readonly RequirementResult[];
  /** Every requirement satisfied. Structural only: not acceptance, not readiness. */
  readonly complete: boolean;
  /** Registry entries whose file is absent (not merely unreadable), in registry order. */
  readonly dangling: readonly ManifestDocument[];
  /** Observed files that no registry entry names (exact path), sorted by path. */
  readonly unclassified: readonly UnclassifiedFile[];
  /** `dangling`, then `unclassified`, then `requirement-unmet`. */
  readonly issues: readonly DocumentIssue[];
}

export function validateDocuments(input: DocumentValidationInput): DocumentValidation {
  const observed = new Set(input.observedPaths);
  const registered = new Set(input.documents.map((document) => document.path));

  const unreadable = new Set(input.unreadablePaths ?? []);
  const dangling = input.documents.filter(
    (document) => !observed.has(document.path) && !unreadable.has(document.path),
  );
  const unclassified = [...observed]
    .filter((path) => !registered.has(path))
    .sort(compareCodeUnits)
    .map((path) => ({ path }));

  const counts = new Map<string, number>();
  for (const document of input.documents) {
    if (observed.has(document.path)) {
      counts.set(document.type, (counts.get(document.type) ?? 0) + 1);
    }
  }

  const requirements = input.archetype.requirements.map((requirement): RequirementResult => {
    const count = counts.get(requirement.documentType) ?? 0;

    return {
      documentType: requirement.documentType,
      minCount: requirement.minCount,
      count,
      satisfied: count >= requirement.minCount,
    };
  });

  const issues: DocumentIssue[] = [
    ...dangling.map((document): DocumentIssue => ({
      code: 'dangling',
      path: document.path,
      documentType: document.type,
    })),
    ...unclassified.map((file): DocumentIssue => ({ code: 'unclassified', path: file.path })),
    ...requirements
      .filter((result) => !result.satisfied)
      .map((result): DocumentIssue => ({
        code: 'requirement-unmet',
        documentType: result.documentType,
      })),
  ];

  return {
    requirements,
    complete: requirements.every((result) => result.satisfied),
    dangling,
    unclassified,
    issues,
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
