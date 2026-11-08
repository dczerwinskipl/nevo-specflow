import type { RequestAuthorization } from '../../auth';
import type {
  SpecificationWorkspaceRepository,
  WorkspaceContributions,
  WorkspaceReadModel,
} from './repository';

/** Specs composes lightweight owner contributions; it never reads foreign bodies or history. */
export async function readWorkspace(
  source: SpecificationWorkspaceRepository,
  contributions: WorkspaceContributions | undefined,
  specId: string,
  authz: RequestAuthorization,
): Promise<WorkspaceReadModel | null> {
  const specification = await source.readSpecification(specId);
  if (!specification) {
    return null;
  }

  const missing = { state: 'unavailable' as const, reason: 'not_implemented' as const };
  const [tasks, documents, sessions] = await Promise.all([
    contributions?.tasks?.(specId),
    contributions?.documents?.(specId),
    contributions?.sessions?.(specId, { authz }),
  ]);

  return {
    ...specification,
    ...(sessions?.recommendedSessionIds?.length
      ? { recommendedSessionIds: sessions.recommendedSessionIds }
      : {}),
    ...(sessions?.sessionIdentities ? { sessionIdentities: sessions.sessionIdentities } : {}),
    sections: {
      ...specification.sections,
      tasks: tasks ?? missing,
      documents: documents ?? missing,
      sessions: sessions?.section ?? missing,
    },
    actions: {
      ...specification.actions,
      ...(sessions?.startSession ? { startSession: sessions.startSession } : {}),
    },
  };
}
