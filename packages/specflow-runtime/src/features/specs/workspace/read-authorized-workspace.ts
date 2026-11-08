import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { RequestAuthorization } from '../../auth';
import { sessionScope, type SessionReference, type SessionReferenceOwner } from '../../sessions';
import type { SpecificationWorkspaceRepository, WorkspaceContributions } from './repository';
import { readWorkspace } from './read-workspace';
import { specScope } from '../scope';
import { presentWorkspace } from './presenter';
import { authorizeSessionReferences } from './authorize-projection';

export async function readAuthorizedWorkspace(
  source: SpecificationWorkspaceRepository | undefined,
  contributions: WorkspaceContributions | undefined,
  specId: string,
  authz: RequestAuthorization,
  sessions?: SessionReferenceOwner,
  projectId?: string,
): Promise<
  { kind: 'ok'; value: SpecificationWorkspaceResponse } | { kind: 'unavailable' | 'not_found' }
> {
  authz.require({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: specScope(projectId, specId),
  });
  if (!source) {
    return { kind: 'unavailable' };
  }

  const data = await readWorkspace(source, contributions, specId, authz);
  if (!data) {
    return { kind: 'not_found' };
  }

  if (data.specification.id !== specId) {
    return { kind: 'unavailable' };
  }

  const ids = new Set<string>(),
    sections = data.sections;
  for (const item of [
    ...data.specification.attention,
    ...(sections.tasks.state === 'available' ? sections.tasks.data.attention : []),
    ...(sections.sessions.state === 'available' ? sections.sessions.data.attention : []),
    ...(sections.repository.state === 'available' ? sections.repository.data.attention : []),
  ]) {
    if (item.kind === 'session' && item.targetId) {
      ids.add(item.targetId);
    }
  }

  if (sections.sessions.state === 'available') {
    for (const session of sections.sessions.data.items) {
      ids.add(session.id);
    }
  }

  for (const id of data.recommendedSessionIds ?? []) {
    ids.add(id);
  }

  if (sections.activity.state === 'available') {
    for (const item of sections.activity.data.items) {
      if (item.kind === 'session' && item.targetId) {
        ids.add(item.targetId);
      }

      if (item.relatedSessionId) {
        ids.add(item.relatedSessionId);
      }
    }
  }

  // One batch for every referenced Session; the store-derived identity decides the scope.
  const owners: ReadonlyMap<string, SessionReference> =
    ids.size && sessions ? await sessions.resolveMany([...ids]) : new Map();
  const permitted = new Set<string>();
  for (const id of ids) {
    const owner = owners.get(id);
    if (
      owner?.sessionId === id &&
      owner.specId === specId &&
      authz.can({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.View,
        scope: sessionScope(owner, SessionCapabilities.capabilities.View),
      })
    ) {
      permitted.add(id);
    }
  }

  return {
    kind: 'ok',
    value: authorizeSessionReferences(
      // The first candidate the caller may view, so a hidden Session never hides the next one.
      presentWorkspace(
        data,
        data.recommendedSessionIds?.find((id) => permitted.has(id)),
      ),
      (id) => permitted.has(id),
    ),
  };
}
