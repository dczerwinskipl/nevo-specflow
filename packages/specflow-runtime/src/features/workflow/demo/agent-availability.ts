import type { ActionProjection, WorkflowSubject } from '@nevo/specflow-engine';

/**
 * The demo Runtime runs no agent: an agent option the definitions make available is unavailable
 * (`demo`), with the launch it would use, so the Run with agent dialog explains it before anything is sent.
 */
export function demoAgentAvailability(
  _subject: WorkflowSubject,
  projection: ActionProjection,
): Promise<ActionProjection> {
  const position = projection.position;
  if (
    (position.kind !== 'not-started' && position.kind !== 'ready' && position.kind !== 'blocked') ||
    position.next?.agent.kind !== 'available'
  ) {
    return Promise.resolve(projection);
  }

  const { launch, independent } = position.next.agent;

  return Promise.resolve({
    ...projection,
    position: {
      ...position,
      next: {
        ...position.next,
        agent: {
          kind: 'unavailable',
          reason: 'demo',
          detail: 'The demo runs no agent.',
          launch,
          ...(independent ? { independent } : {}),
        },
      },
    },
  });
}
