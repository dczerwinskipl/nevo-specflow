import type { CreatedSpecification } from './durable';

export interface PublicCreateOperation {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: 'specification-create';
  readonly status: 'completed';
  readonly slug: string;
  readonly workspaceId: string;
  readonly relativeManifestPath: string;
  readonly documentIds: string[];
  /** Present when the files were written without a commit (Git is disabled in the project). */
  readonly uncommitted?: true;
}

/** Transport-independent result. Never serialize workstation paths or journal evidence. */
export function projectCreatedSpecification(created: CreatedSpecification): PublicCreateOperation {
  return {
    operationId: created.operationId,
    specId: created.specId,
    kind: 'specification-create',
    status: 'completed',
    slug: created.slug,
    workspaceId: created.workspaceId,
    relativeManifestPath: created.relativeManifestPath,
    documentIds: [...created.documentIds],
    ...(created.uncommitted ? { uncommitted: true as const } : {}),
  };
}
