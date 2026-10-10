import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { WorkspaceReadModel, SourceSection } from './repository';

function presentSection<T>(section: SourceSection<T>) {
  return section.state === 'available'
    ? { state: 'available' as const, data: section.data }
    : { state: 'unavailable' as const, reason: section.reason };
}

/** The Runtime read model already assigns Attention to its owning domain section. */
export function presentWorkspace(data: WorkspaceReadModel): SpecificationWorkspaceResponse {
  return {
    revision: data.revision,
    specification: data.specification,
    ...(data.recommendedSessionId ? { recommendedSessionId: data.recommendedSessionId } : {}),
    sections: {
      tasks: presentSection(data.sections.tasks),
      documents: presentSection(data.sections.documents),
      sessions: presentSection(data.sections.sessions),
      activity: presentSection(data.sections.activity),
      repository:
        data.sections.repository.state === 'available'
          ? {
              state: 'available',
              data: {
                ...data.sections.repository.data,
                attention: data.sections.repository.data.attention ?? [],
              },
            }
          : presentSection(data.sections.repository),
      changes: presentSection(data.sections.changes),
    },
    actions: data.actions,
  };
}
