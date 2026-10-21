import type { ResolvedProjectHome } from '../../project/project-home';
import { assertSharedResourcesAvailable, SharedResourceError } from '../coordination/resources';
import { CloseOperationError } from './model';

export {
  resourcesForCreate,
  sortedResources,
  overlaps,
  type MutationResource,
} from '../coordination/resources';

/** Lifecycle error mapping at the Close boundary, not within Create. */
export async function assertResourcesAvailable(
  context: ResolvedProjectHome,
  resources: readonly string[],
  self?: { readonly kind: 'create' | 'close'; readonly operationId: string },
): Promise<void> {
  try {
    await assertSharedResourcesAvailable(context, resources, self);
  } catch (error) {
    if (error instanceof SharedResourceError) {
      throw new CloseOperationError(
        error.code === 'RESOURCE_CONFLICT' ? 'CLOSE_CONFLICT' : 'CLOSE_JOURNAL_CORRUPT',
        error.message,
      );
    }
    throw error;
  }
}
