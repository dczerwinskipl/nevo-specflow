import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { RequestAuthorization } from '../../auth';
import type { ReferenceFacts, TaskIdentity } from './facts';
import { sessionScope, type SessionReference, type SessionReferenceOwner } from '../../sessions';

export interface TaskVisibility {
  (link: ReferenceFacts): Promise<boolean>;
  /** Resolves every not yet resolved Session reference of `links` in one batch. */
  prefetch(links: readonly ReferenceFacts[]): Promise<void>;
}

export function taskVisibility(
  identity: TaskIdentity,
  authz: RequestAuthorization,
  sessions?: SessionReferenceOwner,
): TaskVisibility {
  const owners = new Map<string, Promise<SessionReference | undefined>>();
  function prefetch(links: readonly ReferenceFacts[]): Promise<void> {
    const pending = [
      ...new Set(
        links.flatMap((link) =>
          link.state === 'available' &&
          link.target.kind === 'session' &&
          !owners.has(link.target.sessionId)
            ? [link.target.sessionId]
            : [],
        ),
      ),
    ];
    if (!pending.length) {
      return Promise.resolve();
    }

    const batch = sessions ? sessions.resolveMany(pending) : Promise.resolve(new Map());
    for (const sessionId of pending) {
      owners.set(
        sessionId,
        batch.then((resolved: ReadonlyMap<string, SessionReference>) => resolved.get(sessionId)),
      );
    }

    return batch.then(() => undefined);
  }

  const visible = async (link: ReferenceFacts): Promise<boolean> => {
    if (link.state === 'forbidden') {
      return false;
    }

    if (link.state !== 'available') {
      return true;
    }

    if (link.target.kind !== 'session') {
      return link.target.specId === identity.specId;
    }

    const sessionId = link.target.sessionId;
    await prefetch([link]);
    const owner = await owners.get(sessionId);

    return (
      owner?.sessionId === sessionId &&
      owner.projectId === identity.projectId &&
      owner.workspaceId === identity.workspaceId &&
      authz.can({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.View,
        scope: sessionScope(owner, SessionCapabilities.capabilities.View),
      })
    );
  };

  return Object.assign(visible, { prefetch });
}
