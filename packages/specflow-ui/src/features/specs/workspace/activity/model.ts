import type { ActivityEvent } from '../model';

export type ActivityEventKind = 'task' | 'session' | 'doc' | 'info';

export interface BaseActivityEvent {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly description: string;
}

export interface TaskActivityEvent extends BaseActivityEvent {
  readonly kind: 'task';
  readonly targetId: string;
}

export interface SessionActivityEvent extends BaseActivityEvent {
  readonly kind: 'session';
  readonly targetId: string;
}

export interface DocumentActivityEvent extends BaseActivityEvent {
  readonly kind: 'doc';
  readonly targetId: string;
}

export interface InformationalActivityEvent extends BaseActivityEvent {
  readonly kind: 'info';
  readonly targetId?: string;
}

export type WorkspaceActivityEvent =
  TaskActivityEvent | SessionActivityEvent | DocumentActivityEvent | InformationalActivityEvent;

/**
 * Normalizes any legacy or contract ActivityEvent into a typed WorkspaceActivityEvent.
 */
export function normalizeActivityEvent(event: ActivityEvent): WorkspaceActivityEvent {
  const kind: ActivityEventKind =
    'kind' in event && typeof (event as { kind?: unknown }).kind === 'string'
      ? (event as { kind: ActivityEventKind }).kind
      : (event.type ?? 'info');

  if (kind === 'task' && event.targetId) {
    return {
      id: event.id,
      time: event.time,
      title: event.title,
      description: event.description,
      kind: 'task',
      targetId: event.targetId,
    };
  }

  if (kind === 'session' && event.targetId) {
    return {
      id: event.id,
      time: event.time,
      title: event.title,
      description: event.description,
      kind: 'session',
      targetId: event.targetId,
    };
  }

  if (kind === 'doc' && event.targetId) {
    return {
      id: event.id,
      time: event.time,
      title: event.title,
      description: event.description,
      kind: 'doc',
      targetId: event.targetId,
    };
  }

  return {
    id: event.id,
    time: event.time,
    title: event.title,
    description: event.description,
    kind: 'info',
    targetId: event.targetId,
  };
}
