import {
  DEFINITION_PROBLEMS_MAX,
  type ArchetypeDefinition,
  type DefinitionProblem,
  type DocumentTypeDefinition,
} from '@nevo/specflow-contracts/documents';

import { DOCUMENT_TYPE_KIND } from './kinds/document-type';
import { SPECIFICATION_ARCHETYPE_KIND } from './kinds/specification-archetype';
import { compareProblems, type LoadResult } from './loader';
import { compareText } from './order';
import { resolveCatalogue, type ResolvedCatalogue } from './resolved-catalogue';

/**
 * The catalogue resolved from the project's definition files: the valid document types and archetypes
 * (a pure function of the files, in id order, so the same files give the same revision on any machine)
 * plus the problems of the files that were rejected.
 */
export interface ProjectCatalogue {
  readonly catalogue: ResolvedCatalogue;
  /** At most {@link DEFINITION_PROBLEMS_MAX}: errors first, then by source. */
  readonly problems: readonly DefinitionProblem[];
  readonly problemsTruncated: boolean;
  /** False when `.nevo/definitions` does not exist. */
  readonly rootPresent: boolean;
  /** Ids of archetype files that exist but were rejected. */
  readonly invalidArchetypeIds: ReadonlySet<string>;
}

/** Cap a sorted problem list to the contract size. */
export function capProblems(problems: readonly DefinitionProblem[]): {
  readonly problems: readonly DefinitionProblem[];
  readonly problemsTruncated: boolean;
} {
  const sorted = [...problems].sort(compareProblems);

  return {
    problems: sorted.slice(0, DEFINITION_PROBLEMS_MAX),
    problemsTruncated: sorted.length > DEFINITION_PROBLEMS_MAX,
  };
}

function entitiesOf<T>(result: LoadResult, kind: string): T[] {
  return [...(result.definitions.get(kind)?.entries() ?? [])]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, loaded]) => loaded.entity as T);
}

/** Resolve a loaded definition set into the catalogue (no I/O). */
export function resolveProjectCatalogue(result: LoadResult): ProjectCatalogue {
  const catalogue = resolveCatalogue({
    documentTypes: entitiesOf<DocumentTypeDefinition>(result, DOCUMENT_TYPE_KIND),
    archetypes: entitiesOf<ArchetypeDefinition>(result, SPECIFICATION_ARCHETYPE_KIND),
  });
  const capped = capProblems(result.problems);

  return {
    catalogue,
    problems: capped.problems,
    problemsTruncated: capped.problemsTruncated,
    rootPresent: result.rootPresent,
    invalidArchetypeIds: new Set(result.invalid.get(SPECIFICATION_ARCHETYPE_KIND) ?? []),
  };
}
