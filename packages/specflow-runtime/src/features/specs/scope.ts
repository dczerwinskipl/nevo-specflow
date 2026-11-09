import type { Scope } from '@nevo/authorization';

/** The Runtime's project id, read per check: composition never touches the Engine eagerly. */
export type ProjectIdSource = () => string | undefined;

/**
 * The single authorization scope of a Specification for every `spec.*` check: `{projectId, specId}`,
 * so a `{projectId}` grant covers the project's Specifications and a `{specId}` grant still covers
 * its own. `projectId` is the Runtime's project (the Engine's in project mode, the catalogue's in
 * demo mode); a Runtime without a project has no project dimension to add.
 */
export function specScope(projectId: string | undefined, specId: string): Scope {
  return projectId === undefined ? { specId } : { projectId, specId };
}
