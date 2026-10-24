import type { SpecFlowEngine } from '../../../application';
import { readCreateJournal } from '../journal';
import {
  projectCreatedSpecification,
  type PublicCreateOperation,
} from '../../operations/projection';

export type PublicCreateInspection =
  | PublicCreateOperation
  | {
      readonly operationId: string;
      readonly kind: 'specification-create';
      readonly status: 'in-progress' | 'recovery-required';
    };

/**
 * Read-only projection of the validated durable Create journal. The status
 * reports persisted progress, NOT the liveness of any original writer.
 * This method never waits, resumes an operation, repairs Git or mutates state.
 */
export async function inspectPublicCreateOperation(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<PublicCreateInspection | undefined> {
  const record = await readCreateJournal(engine.context, operationId);
  if (!record) return undefined;
  if (record.stage === 'completed') {
    return projectCreatedSpecification({
      operationId: record.operationId,
      specId: record.specId,
      slug: record.slug,
      workspaceId: record.target.workspaceId,
      workspaceRoot: record.target.workspaceRoot,
      relativeManifestPath: record.files[0]!.relativePath,
      documentIds: record.documentIds,
    });
  }
  return {
    operationId: record.operationId,
    kind: 'specification-create',
    status: record.stage === 'recovery-required' ? 'recovery-required' : 'in-progress',
  };
}
