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
  const read = await source.readSpecification(specId);
  if (!read) {
    return null;
  }

  const { created, manifestTasks, ...specification } = read;
  const missing = { state: 'unavailable' as const, reason: 'not_implemented' as const };
  const [tasks, documents, sessions] = await Promise.all([
    contributions?.tasks?.(specId, manifestTasks ? { manifestTasks } : {}),
    contributions?.documents?.(specId),
    contributions?.sessions?.(specId, { authz }),
  ]);
  // Activity is composed from facts the reads above already returned; authorization of its
  // Session events happens with every other Session reference at the endpoint.
  const activity = await contributions?.activity?.(specId, {
    ...(created !== undefined ? { created } : {}),
    sessionStarts: sessions?.sessionStarts ?? [],
  });

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
      activity: activity ?? missing,
    },
    actions: {
      ...specification.actions,
      ...(sessions?.startSession ? { startSession: sessions.startSession } : {}),
    },
  };
}
