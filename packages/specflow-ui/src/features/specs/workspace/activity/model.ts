export type {
  ActivityEvent,
  ActivityEventKind,
  BaseActivityEvent,
  DocumentActivityEvent,
  InformationalActivityEvent,
  SessionActivityEvent,
  TaskActivityEvent,
} from '../../read-model/model';

import type { ActivityEvent } from '../../read-model/model';

export type WorkspaceActivityEvent = ActivityEvent;

/**
 * Passes through typed ActivityEvent.
 */
export function normalizeActivityEvent(event: ActivityEvent): ActivityEvent {
  return event;
}
