import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
/**
 * A single policy for all Session references. Sources must mark generic
 * Session-owned activity with relatedSessionId; unbound Session events are dropped.
 */
export function authorizeSessionReferences(
  data: SpecificationWorkspaceResponse,
  canReadSession: (sessionId: string) => boolean,
): SpecificationWorkspaceResponse {
  const sections = data.sections;
  const sessions = sections.sessions;
  const sourceSessions = sessions.state === 'available' ? sessions.data.items : [];
  const permitted = sourceSessions.filter((item) => canReadSession(item.id));
  const visibleSessionIds = new Set(permitted.map((item) => item.id));
  const isAllowed = (id: string | undefined) => Boolean(id) && canReadSession(id!);
  const attention = sections.attention;
  const activity = sections.activity;
  return {
    ...data,
    ...(data.recommendedSessionId && visibleSessionIds.has(data.recommendedSessionId)
      ? { recommendedSessionId: data.recommendedSessionId }
      : { recommendedSessionId: undefined }),
    sections: {
      ...sections,
      sessions:
        sessions.state !== 'available'
          ? sessions
          : permitted.length === 0 && sourceSessions.length > 0
            ? { state: 'forbidden' }
            : { state: 'available', data: { items: permitted } },
      attention:
        attention.state === 'available'
          ? {
              state: 'available',
              data: {
                items: attention.data.items.filter(
                  (item) => item.kind !== 'session' || isAllowed(item.targetId),
                ),
              },
            }
          : attention,
      activity:
        activity.state === 'available'
          ? {
              state: 'available',
              data: {
                items: activity.data.items.filter((item) =>
                  item.kind === 'session'
                    ? isAllowed(item.targetId) &&
                      (!item.relatedSessionId || isAllowed(item.relatedSessionId))
                    : !item.relatedSessionId || isAllowed(item.relatedSessionId),
                ),
              },
            }
          : activity,
    },
  };
}
