import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { WorkspaceReadModel, SourceSection } from './repository';

function presentSection<T>(section: SourceSection<T>) {
  return section.state === 'available'
    ? { state: 'available' as const, data: section.data }
    : { state: 'unavailable' as const, reason: section.reason };
}

/** Converts the Runtime read model to the public response without mixing authorization into storage. */
export function presentWorkspace(data: WorkspaceReadModel): SpecificationWorkspaceResponse {
  return {
    revision: data.revision,
    specification: data.specification,
    ...(data.recommendedSessionId ? { recommendedSessionId: data.recommendedSessionId } : {}),
    sections: {
      attention: presentSection(data.sections.attention),
      tasks: presentSection(data.sections.tasks),
      documents: presentSection(data.sections.documents),
      sessions: presentSection(data.sections.sessions),
      activity: presentSection(data.sections.activity),
      repository: presentSection(data.sections.repository),
      changes: presentSection(data.sections.changes),
    },
    actions: data.actions,
  };
}
